import { createHash } from "node:crypto";
import { and, count, desc, eq, inArray, isNotNull, max, sql } from "drizzle-orm";
import { db, schema } from "../db/index.ts";
import { audience, publish } from "./events.ts";
import { onAir, type Speaker } from "./airtime.ts";
import { periodNow, reentryAt, type Band } from "./orbit.ts";
import { isOwnedBy, liveSky, rootsOf, type Fate, type Kind, type Root, type SkyObject, type Viewer } from "./sky.ts";
import { STATIONS, stationOver, type StationId } from "./stations.ts";
import { lineOf } from "./wreck.ts";

// Being heard (ADR 0016). A beacon is heard when it's on air over a ground
// station while people have the sky open: that pass is a transmission,
// logged with how many heard it, and everyone listening while it's on air
// who isn't its owner has heard it, once each. "Heard by" is how many
// different people that is. A pass with nobody listening isn't heard, and
// leaves nothing behind.

const { objects, operators, transmissions, listens, visitors } = schema;

// A listener, as the server keeps them: their operator, once signed in, so
// two devices are one listener; otherwise a one-way hash of their cookie,
// so the cookie (which is what lets them act as themselves) isn't kept
// again. Shared by the event stream, which tags each listener with it.
export function listenerKey(viewer: Viewer): string {
  if (viewer.operator !== null) return `o:${viewer.operator}`;
  return `p:${createHash("sha256")
    .update(viewer.person ?? "")
    .digest("hex")
    .slice(0, 24)}`;
}

// The browsers that have asked for something here besides the event
// stream (a page, a card, a form), as listener keys: read once, then kept
// up as they come.
let known: Set<string> | null = null;
const visitorsSeen = () => (known ??= new Set(db.select({ listener: visitors.listener }).from(visitors).all().map((row) => row.listener)));

// A browser asked for something here: from now on its stream counts as
// someone listening. Kept, so a stream reconnecting after a restart still
// counts.
export function visited(person: string, now = Date.now()): void {
  const key = listenerKey({ person, operator: null });
  const seen = visitorsSeen();
  if (seen.has(key)) return;
  db.insert(visitors).values({ listener: key, at: now }).onConflictDoNothing().run();
  seen.add(key);
}

// Who an open stream counts as listening, if anyone: only a browser that
// has loaded something here, so a cookie made up for a stream (or made for
// it just now) isn't anyone. A script that loads a page first still is, as
// each new browser is someone new for launching (ADR 0009).
export function listenerFor(locals: { person: string | undefined; operator: { id: number } | null }): string | null {
  if (!locals.person || !visitorsSeen().has(listenerKey({ person: locals.person, operator: null }))) return null;
  return listenerKey({ person: locals.person, operator: locals.operator?.id ?? null });
}

// The keys an object's owner listens as: the operator it belongs to, and the
// cookie that launched it (they may be listening signed out).
function ownerKeys(object: Pick<SkyObject, "owner" | "operator">): Set<string> {
  const keys = new Set<string>();
  if (object.operator !== null) keys.add(listenerKey({ person: undefined, operator: object.operator }));
  if (object.owner !== null) keys.add(listenerKey({ person: object.owner, operator: null }));
  return keys;
}

// What a station hears: people's satellites with a beacon, and fragments
// carrying the words of what broke them, as static (ADR 0017). Derelicts
// are dead, and so is debris that carries nothing.
const speaks = (object: SkyObject) =>
  (object.kind === "satellite" && Boolean(object.beacon)) || (object.kind === "debris" && Boolean(object.words));

export interface Transmission {
  object: number;
  station: StationId;
  at: number;
  // how many heard it, its owner not counted
  listeners: number;
}

// A beacon as the feed shows it: who launched it, what it said, where and
// when it was last heard, and how often and by how many.
export interface HeardItem {
  // the card it's on: a satellite's own, or one for all of a wreck's static
  key: string;
  // the satellite, or the fragment of the wreck heard last
  id: number;
  kind: Kind;
  callsign: string | null;
  beacon: string | null;
  // for a fragment: the words it carries, and the satellites (and
  // derelicts) at the root of the collision it came from (ADR 0017)
  words: string | null;
  from: Root[] | null;
  // for a wreck's static: how many of its fragments carry words, and how
  // many of those are still up
  pieces: number | null;
  up: number | null;
  // the stations' question it answered (ADR 0018)
  question: string | null;
  handle: string | null;
  band: Band;
  fate: Fate;
  // the station that heard it last, by name, and when
  station: string;
  at: number;
  passes: number;
  heardBy: number;
  mine: boolean;
}

// How many beacons the feed holds (the sky page, and a stream's hello).
export const HEARD_FEED = 30;

const stationName = (id: string) => STATIONS.find((s) => s.id === id)?.name ?? id;

// How many listeners one pass can credit: past this the sky is being
// gamed (scripted streams), not listened to, and a pass shouldn't write
// thousands of rows. Who it credits is drawn at random, so streams opened
// first can't crowd out the people who came after.
export const MOST_COUNTED = 200;
// how far back one look goes, after a stall: two minutes, a second at a
// time (a longer look in a crowded sky holds everything else up)
const LONGEST_LOOK = 2 * 60_000;

// Up to `n` of these, drawn at random.
function sample<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  const pool = [...items];
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

// Each pass so far, by object and station: when it started, when it was
// last on air (it's the same pass until it has been off that station for
// half a lap), its row, and who it has credited.
interface Pass {
  at: number;
  last: number;
  row: number;
  heard: Set<string>;
}
const passesNow = new Map<string, Pass>();

// Every pass heard between `from` and `to` by `ears` (the people listening
// now, by default): looking once a second at what each station is
// broadcasting (airtime.ts, the same rule every screen plays by), a beacon
// is heard while it's on air, not merely for coming over, so one that never
// gets a turn isn't. Its first second on air starts the pass (logged, and
// told to everyone); anyone who starts listening while it's still on air
// that pass has heard it too. Returns the passes it started. The server
// runs this every second while anyone is listening.
export function listen(from: number, to: number, ears: ReadonlySet<string> = audience()): Transmission[] {
  if (ears.size === 0 || to <= from) return [];
  const speaking = liveSky(to).filter(speaks);
  if (speaking.length === 0) return [];
  const start = Math.max(from, to - LONGEST_LOOK);
  // a second apart, back from now, but not again within half a second of
  // the last look (the ear's ticks drift a little past a second)
  const times: number[] = [];
  for (let t = to; t > start && (t === to || t - start >= 500); t -= 1000) times.unshift(t);
  const everyone = [...ears];
  const owners = new Map<number, Set<string>>();
  // the passes this look started or credited someone to, with who and when
  const touched = new Map<Pass, { object: SkyObject; station: StationId; started: boolean; fresh: [string, number][] }>();
  for (const t of times) {
    const overhead = new Map<StationId, (Speaker & { object: SkyObject })[]>();
    for (const object of speaking) {
      // up there, on this orbit, and not yet burned up
      if (object.launchedAt > t || object.epoch > t || t >= reentryAt(object)) continue;
      const station = stationOver(object, t);
      if (!station) continue;
      const here = overhead.get(station.id) ?? [];
      here.push({ id: object.id, text: lineOf(object) ?? "", static: object.kind === "debris", object });
      overhead.set(station.id, here);
    }
    for (const [station, here] of overhead) {
      const now = onAir(here, t);
      if (!now) continue;
      const object = now.speaker.object;
      const key = `${object.id}:${station}`;
      let pass = passesNow.get(key);
      const started = pass === undefined || t - pass.last >= periodNow(object, t) / 2;
      if (pass === undefined || started) {
        pass = { at: t, last: t, row: 0, heard: new Set() };
        passesNow.set(key, pass);
      }
      pass.last = t;
      const own = owners.get(object.id) ?? owners.set(object.id, ownerKeys(object)).get(object.id)!;
      const credited = pass.heard;
      const fresh = sample(
        everyone.filter((listener) => !own.has(listener) && !credited.has(listener)),
        Math.max(0, MOST_COUNTED - credited.size),
      );
      for (const listener of fresh) credited.add(listener);
      if (!started && fresh.length === 0) continue;
      const told = touched.get(pass) ?? touched.set(pass, { object, station, started, fresh: [] }).get(pass)!;
      told.fresh.push(...fresh.map((listener): [string, number] => [listener, t]));
    }
  }
  // forget passes long over
  if (passesNow.size > 5000) for (const [key, pass] of passesNow) if (to - pass.last > 3_600_000) passesNow.delete(key);
  if (touched.size === 0) return [];
  db.transaction((tx) => {
    for (const [pass, { object, station, started, fresh }] of touched) {
      if (started) {
        pass.row = tx
          .insert(transmissions)
          .values({ object: object.id, station, at: pass.at, listeners: pass.heard.size })
          .returning({ id: transmissions.id })
          .get().id;
      } else {
        tx.update(transmissions).set({ listeners: pass.heard.size }).where(eq(transmissions.id, pass.row)).run();
      }
      for (const [listener, at] of fresh) tx.insert(listens).values({ object: object.id, listener, at }).onConflictDoNothing().run();
    }
  });
  const items = new Map(feedOf([...new Set([...touched.values()].map((p) => p.object.id))]).map((item) => [item.id, item]));
  for (const [pass, { object, station }] of touched) {
    const item = items.get(object.id);
    if (!item) continue;
    // each pass as it was, though the counts are as they are now
    const { mine: _, ...told } = { ...item, station: stationName(station), at: pass.at };
    publish({ type: "heard", heard: told, owner: object.owner, operator: object.operator });
  }
  return [...touched].flatMap(([pass, { object, station, started }]) =>
    started ? [{ object: object.id, station, at: pass.at, listeners: pass.heard.size }] : [],
  );
}

// A card's key in the feed: a satellite's own ("o:12"); for static, the
// collision its fragments came from ("c:7"), so all of one wreck's static
// is one card, not a fragment each (the review, 2026-10-07).
const keyOf = (object: { id: number; kind: string; source: number | null }) =>
  object.kind === "debris" && object.source !== null ? `c:${object.source}` : `o:${object.id}`;

// The feed's cards for these objects (each the latest heard of its card),
// unordered, as their owner-free selves. A static card counts every
// fragment of its wreck that carries words: their passes, who heard any of
// them, and how many are still up.
function feedOf(ids: number[], who?: Viewer | string): HeardItem[] {
  if (ids.length === 0) return [];
  const rows = db
    .select({
      id: objects.id,
      kind: objects.kind,
      callsign: objects.callsign,
      beacon: objects.beacon,
      words: objects.words,
      question: objects.question,
      source: objects.sourceCollision,
      band: objects.band,
      fate: objects.fate,
      owner: objects.owner,
      operator: objects.operator,
      handle: operators.handle,
    })
    .from(objects)
    .leftJoin(operators, eq(objects.operator, operators.id))
    .where(inArray(objects.id, ids))
    .all();
  // each wreck's fragments that carry words
  const sources = [...new Set(rows.flatMap((row) => (row.kind === "debris" && row.source !== null ? [row.source] : [])))];
  const pieces = new Map<number, { id: number; fate: Fate }[]>();
  if (sources.length > 0) {
    for (const piece of db
      .select({ id: objects.id, fate: objects.fate, source: objects.sourceCollision })
      .from(objects)
      .where(and(inArray(objects.sourceCollision, sources), isNotNull(objects.words)))
      .all()) {
      pieces.set(piece.source!, [...(pieces.get(piece.source!) ?? []), piece]);
    }
  }
  const membersOf = (row: (typeof rows)[number]) =>
    row.kind === "debris" && row.source !== null ? (pieces.get(row.source) ?? [{ id: row.id, fate: row.fate }]).map((p) => p.id) : [row.id];
  const all = [...new Set(rows.flatMap(membersOf))];
  // every pass and every listener of any of them
  const passCount = new Map<number, number>();
  const latest = new Map<number, number>();
  for (const pass of db
    .select({ object: transmissions.object, id: max(transmissions.id), n: count() })
    .from(transmissions)
    .where(inArray(transmissions.object, all))
    .groupBy(transmissions.object)
    .all()) {
    passCount.set(pass.object, pass.n);
    latest.set(pass.object, pass.id ?? 0);
  }
  const last = new Map(
    db
      .select({ id: transmissions.id, station: transmissions.station, at: transmissions.at })
      .from(transmissions)
      .where(inArray(transmissions.id, [...latest.values()]))
      .all()
      .map((t) => [t.id, t]),
  );
  const heardOf = new Map<number, string[]>();
  for (const row of db.select({ object: listens.object, listener: listens.listener }).from(listens).where(inArray(listens.object, all)).all()) {
    heardOf.set(row.object, [...(heardOf.get(row.object) ?? []), row.listener]);
  }
  // each collision's roots once, however many of its fragments were heard
  const roots = new Map<number, Root[]>();
  const rootsFor = (collision: number) => roots.get(collision) ?? roots.set(collision, rootsOf(collision)).get(collision)!;
  return rows.flatMap((row) => {
    const pass = last.get(latest.get(row.id) ?? 0);
    if (!pass) return [];
    const members = membersOf(row);
    const wreck = row.kind === "debris" && row.source !== null ? (pieces.get(row.source) ?? null) : null;
    return [
      {
        key: keyOf(row),
        id: row.id,
        kind: row.kind,
        callsign: row.callsign,
        beacon: row.beacon,
        words: row.kind === "debris" ? row.words : null,
        from: row.kind === "debris" && row.source !== null ? rootsFor(row.source) : null,
        pieces: wreck ? wreck.length : null,
        up: wreck ? wreck.filter((p) => p.fate === "live").length : null,
        question: row.question,
        handle: row.handle,
        band: row.band,
        fate: row.fate,
        station: stationName(pass.station),
        at: pass.at,
        passes: members.reduce((sum, id) => sum + (passCount.get(id) ?? 0), 0),
        heardBy: new Set(members.flatMap((id) => heardOf.get(id) ?? [])).size,
        mine: isOwnedBy(row, who),
      },
    ];
  });
}

// How far back the feed looks: the latest passes logged, however many
// days of them there are, so a page doesn't read the whole log to open.
const LOOK_BACK = 2000;

// What the stations have heard, a card each, the latest heard first: a
// satellite's beacon, or all the static from one wreck.
export function recentlyHeard(limit: number, who?: Viewer | string, now = Date.now()): HeardItem[] {
  const latest = db
    .select({ object: transmissions.object, kind: objects.kind, source: objects.sourceCollision })
    .from(transmissions)
    .innerJoin(objects, eq(transmissions.object, objects.id))
    .where(sql`${transmissions.at} <= ${now}`)
    .orderBy(desc(transmissions.at), desc(transmissions.id))
    .limit(LOOK_BACK)
    .all();
  // the latest heard of each card, in order
  const order = new Map<string, { at: number; object: number }>();
  for (const pass of latest) {
    if (order.size >= limit) break;
    const key = keyOf({ id: pass.object, kind: pass.kind, source: pass.source });
    if (!order.has(key)) order.set(key, { at: order.size, object: pass.object });
  }
  const place = new Map([...order.values()].map((v) => [v.object, v.at]));
  return feedOf([...place.keys()], who).sort((a, b) => place.get(a.id)! - place.get(b.id)!);
}

// How many different people have heard an object, and over how many passes.
export function heardBy(id: number): number {
  return db.select({ n: count() }).from(listens).where(eq(listens.object, id)).get()?.n ?? 0;
}

// The same for the live sky, for the stations to say beside each beacon.
export function heardCounts(ids: number[]): Record<number, number> {
  if (ids.length === 0) return {};
  const rows = db
    .select({ object: listens.object, n: count() })
    .from(listens)
    .where(inArray(listens.object, ids))
    .groupBy(listens.object)
    .all();
  return Object.fromEntries(rows.map((row) => [row.object, row.n]));
}

// How many people have heard each of these, and over how many passes.
export function heardTotals(ids: number[]): Map<number, { by: number; passes: number }> {
  const totals = new Map(ids.map((id) => [id, { by: 0, passes: 0 }]));
  if (ids.length === 0) return totals;
  for (const row of db.select({ object: listens.object, n: count() }).from(listens).where(inArray(listens.object, ids)).groupBy(listens.object).all()) {
    totals.get(row.object)!.by = row.n;
  }
  for (const row of db
    .select({ object: transmissions.object, n: count() })
    .from(transmissions)
    .where(inArray(transmissions.object, ids))
    .groupBy(transmissions.object)
    .all()) {
    totals.get(row.object)!.passes = row.n;
  }
  return totals;
}

// The server's ear: every second while anyone is listening, what came over
// a station since the last look. Started by the first stream to open; never
// what keeps the process alive.
let ear: ReturnType<typeof setInterval> | undefined;
export function startListening(): void {
  if (ear) return;
  let last = Date.now();
  ear = setInterval(() => {
    const now = Date.now();
    try {
      listen(last, now);
    } catch (error) {
      // a busy or full disk: those passes go unheard, and it carries on
      console.error("listening failed:", error);
    }
    last = now;
  }, 1000);
  ear.unref?.();
}
