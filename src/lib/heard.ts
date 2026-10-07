import { createHash } from "node:crypto";
import { count, desc, eq, inArray, max, sql } from "drizzle-orm";
import { db, schema } from "../db/index.ts";
import { audience, publish } from "./events.ts";
import type { Band } from "./orbit.ts";
import { isOwnedBy, liveSky, rootsOf, type Fate, type Kind, type Root, type SkyObject, type Viewer } from "./sky.ts";
import { STATIONS, untilStation, type StationId } from "./stations.ts";

// Being heard (ADR 0016). A beacon is heard when its satellite comes over a
// ground station while people have the sky open: that pass is a
// transmission, logged with how many were listening, and everyone listening
// who isn't its owner has heard it, once each. "Heard by" is how many
// different people that is. A pass with nobody listening isn't heard, and
// leaves nothing behind.

const { objects, operators, transmissions, listens } = schema;

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
  id: number;
  kind: Kind;
  callsign: string | null;
  beacon: string | null;
  // for a fragment: the words it carries, and the satellites (and
  // derelicts) at the root of the collision it came from (ADR 0017)
  words: string | null;
  from: Root[] | null;
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

// Every pass over a station between `from` and `to`, heard by `ears` (the
// people listening now, by default): logged, counted, and told to everyone.
// The server runs this every second while anyone is listening; it's exact,
// not sampled, since when a satellite comes into a window is closed form
// (stations.ts, untilStation).
export function listen(from: number, to: number, ears: ReadonlySet<string> = audience()): Transmission[] {
  if (ears.size === 0 || to <= from) return [];
  const passes: { object: SkyObject; station: StationId; at: number; heard: string[] }[] = [];
  for (const object of liveSky(to).filter(speaks)) {
    // only from when it was up there on this orbit
    const start = Math.max(from, object.epoch, object.launchedAt);
    if (start >= to) continue;
    const own = ownerKeys(object);
    const heard = [...ears].filter((key) => !own.has(key));
    for (const station of STATIONS) {
      const ms = untilStation(object, start, station);
      if (ms !== null && start + ms <= to) passes.push({ object, station: station.id, at: Math.round(start + ms), heard });
    }
  }
  if (passes.length === 0) return [];
  passes.sort((a, b) => a.at - b.at || a.object.id - b.object.id);
  db.transaction((tx) => {
    for (const pass of passes) {
      tx.insert(transmissions)
        .values({ object: pass.object.id, station: pass.station, at: pass.at, listeners: pass.heard.length })
        .run();
      for (const listener of pass.heard) {
        tx.insert(listens).values({ object: pass.object.id, listener, at: pass.at }).onConflictDoNothing().run();
      }
    }
  });
  const items = new Map(feedOf(passes.map((p) => p.object.id)).map((item) => [item.id, item]));
  for (const pass of passes) {
    const item = items.get(pass.object.id);
    if (!item) continue;
    // each pass as it was, though the counts are as they are now
    const { mine: _, ...told } = { ...item, station: stationName(pass.station), at: pass.at };
    publish({ type: "heard", heard: told, owner: pass.object.owner, operator: pass.object.operator });
  }
  return passes.map((p) => ({ object: p.object.id, station: p.station, at: p.at, listeners: p.heard.length }));
}

// The feed's rows for these objects (unordered), as their owner-free selves.
function feedOf(ids: number[], who?: Viewer | string): HeardItem[] {
  if (ids.length === 0) return [];
  const latest = db
    .select({ object: transmissions.object, id: max(transmissions.id), passes: count() })
    .from(transmissions)
    .where(inArray(transmissions.object, ids))
    .groupBy(transmissions.object)
    .all();
  const last = new Map(
    db
      .select({ id: transmissions.id, station: transmissions.station, at: transmissions.at })
      .from(transmissions)
      .where(inArray(transmissions.id, latest.map((l) => l.id ?? 0)))
      .all()
      .map((t) => [t.id, t]),
  );
  const heardBy = new Map(
    db
      .select({ object: listens.object, n: count() })
      .from(listens)
      .where(inArray(listens.object, ids))
      .groupBy(listens.object)
      .all()
      .map((row) => [row.object, row.n]),
  );
  const rows = new Map(
    db
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
      .all()
      .map((row) => [row.id, row]),
  );
  // each collision's roots once, however many of its fragments were heard
  const roots = new Map<number, Root[]>();
  const rootsFor = (collision: number) => roots.get(collision) ?? roots.set(collision, rootsOf(collision)).get(collision)!;
  return latest.flatMap(({ object, id, passes }) => {
    const row = rows.get(object);
    const pass = last.get(id ?? 0);
    if (!row || !pass) return [];
    return [
      {
        id: row.id,
        kind: row.kind,
        callsign: row.callsign,
        beacon: row.beacon,
        words: row.kind === "debris" ? row.words : null,
        from: row.kind === "debris" && row.source !== null ? rootsFor(row.source) : null,
        question: row.question,
        handle: row.handle,
        band: row.band,
        fate: row.fate,
        station: stationName(pass.station),
        at: pass.at,
        passes,
        heardBy: heardBy.get(object) ?? 0,
        mine: isOwnedBy(row, who),
      },
    ];
  });
}

// What the stations have heard, each beacon once, the latest pass first.
export function recentlyHeard(limit: number, who?: Viewer | string, now = Date.now()): HeardItem[] {
  const recent = db
    .select({ object: transmissions.object, last: max(transmissions.at) })
    .from(transmissions)
    .where(sql`${transmissions.at} <= ${now}`)
    .groupBy(transmissions.object)
    .orderBy(desc(max(transmissions.at)))
    .limit(limit)
    .all();
  const order = new Map(recent.map((r, i) => [r.object, i]));
  return feedOf(recent.map((r) => r.object), who).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
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
