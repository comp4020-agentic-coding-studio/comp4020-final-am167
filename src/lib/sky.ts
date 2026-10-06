import { and, count, desc, eq, inArray, max, ne, sql } from "drizzle-orm";
import { db, schema } from "../db/index.ts";
import { fatalMeeting, fragmentsOf, impactOf, nextMeeting } from "./collide.ts";
import { publish } from "./events.ts";
import { handles } from "./operators.ts";
import type { LaunchErrors, LaunchInput } from "./launch.ts";
import { BANDS, bandAt, placeInBand, reentryAt, type Band, type Orbit } from "./orbit.ts";

const { objects, collisions } = schema;

// How long between one person's launches (PLAN.md, "Launch limits"). There's
// no limit on how many you have up: each launch is another beacon heard, and
// another object everyone else has to share the sky with.
export const LAUNCH_GAP = 5 * 60_000;

// The most satellites the sky holds at once (PLAN.md, "Launch limits"), so
// the sky, and the 256 MB machine holding it, can't outgrow decay clearing
// it. Derelicts and debris don't count: a sky full of junk doesn't stop you
// launching into it. SKY_CAP overrides it for testing.
export const SKY_CAP = Number(process.env.SKY_CAP ?? 200);

// The most objects of any kind in the sky at once (ADR 0008): a collision
// that would pass it makes fewer fragments, so a runaway cascade can't fill
// the machine.
export const LIVE_CAP = Number(process.env.LIVE_CAP ?? 600);

// How few satellites and derelicts the server lets the sky fall to (ADR
// 0008): below it, it adds derelicts, so a quiet sky still has something to
// hit, but no faster than one every DERELICT_GAP, so it can't feed a cascade
// faster than the rest of the world launches. DERELICTS overrides it for
// testing.
export const DERELICT_BASELINE = Number(process.env.DERELICTS ?? 20);
export const DERELICT_GAP = 10 * 60_000;

export type Kind = "satellite" | "derelict" | "debris";

// An object as the server holds it, owner included.
export interface SkyObject extends Orbit {
  id: number;
  kind: Kind;
  owner: string | null;
  // its operator, once its person claimed or signed in to one (ADR 0009)
  operator: number | null;
  callsign: string | null;
  beacon: string | null;
  band: Band;
  launchedAt: number;
  direction: 1 | -1;
  // for debris, the collision it came from
  sourceCollision: number | null;
}

// Who is looking: their person cookie, and the operator they're signed in
// as, if any (ADR 0009). A bare string is a person who isn't signed in.
export interface Viewer {
  person: string | undefined;
  operator: number | null;
}
type Who = Viewer | string | undefined;
const viewerOf = (who: Who): Viewer => (typeof who === "object" ? who : { person: who, operator: null });

// Whether an object is the viewer's: its operator's, once it has one,
// otherwise the cookie's that launched it.
const ownedBy = (object: { owner: string | null; operator: number | null }, who: Who) => {
  const viewer = viewerOf(who);
  if (object.operator !== null) return object.operator === viewer.operator;
  return object.owner !== null && object.owner === viewer.person;
};

// What a client sees of an object: never the owner, only whether it's theirs.
export type PublicObject = Omit<SkyObject, "owner" | "operator"> & { mine: boolean };

export const toPublic = ({ owner, operator, ...object }: SkyObject, who: Who): PublicObject => ({
  ...object,
  mine: ownedBy({ owner, operator }, who),
});

// The objects a viewer owns, as a query condition.
const ownerIs = (who: Who) => {
  const viewer = viewerOf(who);
  return viewer.operator !== null ? eq(objects.operator, viewer.operator) : eq(objects.owner, viewer.person ?? "");
};

const columns = {
  id: objects.id,
  kind: objects.kind,
  owner: objects.owner,
  operator: objects.operator,
  callsign: objects.callsign,
  beacon: objects.beacon,
  band: objects.band,
  launchedAt: objects.launchedAt,
  radius: objects.radius,
  phase: objects.phase,
  period: objects.period,
  epoch: objects.epoch,
  direction: objects.direction,
  sourceCollision: objects.sourceCollision,
};

// The database keeps direction as a plain integer.
const toObject = <T extends { direction: number }>(row: T): T & { direction: 1 | -1 } => ({
  ...row,
  direction: row.direction === -1 ? -1 : 1,
});

const live = (): SkyObject[] =>
  db.select(columns).from(objects).where(eq(objects.fate, "live")).orderBy(objects.id).all().map(toObject);

// ── collisions (ADR 0008) ─────────────────────────────────────────────────

export type CollisionRow = typeof collisions.$inferSelect;

// A collision coming: two live objects and when they'll meet.
export interface Conjunction {
  a: number;
  b: number;
  at: number;
  angle: number;
  radius: number;
}

// Who a collision names, on every screen (ADR 0010): each object's
// callsign, beacon and operator (null until operators exist, ADR 0009, and
// for anyone unclaimed). For debris, the satellites at the root of the
// collision it came from, so the blame passes back to them.
// a satellite or derelict a collision traces back to
export interface Root {
  id: number;
  kind: Kind;
  callsign: string | null;
  operator: string | null;
}

export interface Party {
  id: number;
  kind: Kind;
  callsign: string | null;
  beacon: string | null;
  operator: string | null;
  from: Root[] | null;
}

// A collision that has happened: what met, who it names, and what it left.
export interface CollisionReport extends CollisionRow {
  objects: [SkyObject, SkyObject];
  parties: [Party, Party];
  fragments: SkyObject[];
}

interface Hit {
  a: SkyObject;
  b: SkyObject;
  at: number;
}

// When every live pair will meet, if ever. Orbits never change, so neither
// does when two of them meet: each pair is worked out once, when the second
// of them is first seen, and forgotten when either leaves the sky.
const paired = new Set<number>();
const meetings = new Map<string, Hit>();
// the keys of each object's meetings, to forget them when it goes
const meetingsOf = new Map<number, string[]>();

function forget(id: number): void {
  for (const key of meetingsOf.get(id) ?? []) meetings.delete(key);
  meetingsOf.delete(id);
  paired.delete(id);
}

function refreshMeetings(sky: SkyObject[]): void {
  const here = new Set(sky.map((object) => object.id));
  for (const id of [...paired]) if (!here.has(id)) forget(id);
  const known = sky.filter((object) => paired.has(object.id));
  for (const object of sky) {
    if (paired.has(object.id)) continue;
    for (const other of known) {
      // fragments of one collision start at one point: they never hit each other
      if (object.sourceCollision !== null && object.sourceCollision === other.sourceCollision) continue;
      const at = nextMeeting(other, object, -Infinity, fatalMeeting(other, object));
      if (at === null) continue;
      const [a, b] = other.id < object.id ? [other, object] : [object, other];
      const key = `${a.id}:${b.id}`;
      meetings.set(key, { a, b, at: Math.round(at) });
      for (const id of [a.id, b.id]) meetingsOf.set(id, [...(meetingsOf.get(id) ?? []), key]);
    }
    known.push(object);
    paired.add(object.id);
  }
}

// Which of two meetings comes first (ties broken by id, so every replay
// picks the same).
const sooner = (x: Hit, y: Hit) => x.at - y.at || x.a.id - y.a.id || x.b.id - y.b.id;

// The next collision: the earliest meeting of two objects still up.
function nextHit(): Hit | undefined {
  let next: Hit | undefined;
  for (const hit of meetings.values()) if (!next || sooner(hit, next) < 0) next = hit;
  return next;
}

// The collisions to come, in order: an object can only collide once, so a
// meeting after one of its pair has already been hit won't happen.
function schedule(): Hit[] {
  const hits = [...meetings.values()].sort(sooner);
  const used = new Set<number>();
  const coming: Hit[] = [];
  for (const hit of hits) {
    if (used.has(hit.a.id) || used.has(hit.b.id)) continue;
    used.add(hit.a.id);
    used.add(hit.b.id);
    coming.push(hit);
  }
  return coming;
}

const toConjunction = ({ a, b, at }: Hit): Conjunction => ({ a: a.id, b: b.id, at, ...impactOf(a, b, at) });

// Everyone is told of each collision coming, once.
const announced = new Set<string>();
function announce(now: number): void {
  for (const key of announced) if (!meetings.has(key)) announced.delete(key);
  for (const hit of schedule()) {
    const key = `${hit.a.id}:${hit.b.id}`;
    if (hit.at <= now || announced.has(key)) continue;
    announced.add(key);
    publish({ type: "conjunction", conjunction: toConjunction(hit) });
  }
}

// The collisions coming after `now`, for a page that has just opened.
export function conjunctions(now = Date.now()): Conjunction[] {
  settle(now);
  return schedule()
    .filter((hit) => hit.at > now)
    .map(toConjunction);
}

// Two objects meet: both are destroyed, the collision is recorded, and the
// fragments go up, all at the moment they met.
function collide({ a, b, at }: Hit, sky: SkyObject[]): CollisionReport {
  const impact = impactOf(a, b, at);
  // what's still up at that moment (anything burned up by then has left,
  // whether or not it has been marked yet), less the two that met
  const up = sky.filter((object) => reentryAt(object) > at).length - 2;
  const pieces = fragmentsOf(a, b, at).slice(0, Math.max(0, LIVE_CAP - up));
  const report = db.transaction((tx) => {
    const row = tx
      .insert(collisions)
      .values({ at, a: a.id, b: b.id, ...impact })
      .returning()
      .get();
    tx.update(objects)
      .set({ fate: "destroyed", fateAt: at })
      .where(inArray(objects.id, [a.id, b.id]))
      .run();
    const fragments = pieces.map((orbit) =>
      toObject(
        tx
          .insert(objects)
          .values({
            kind: "debris",
            band: bandAt(orbit.radius),
            launchedAt: at,
            sourceCollision: row.id,
            ...orbit,
          })
          .returning(columns)
          .get(),
      ),
    );
    return { ...row, objects: [a, b] as [SkyObject, SkyObject], fragments };
  });
  // as they are now, not as they were when the hit was predicted: an owner
  // may have claimed a handle since (ADR 0009)
  const now = (object: SkyObject) => toObject(db.select(columns).from(objects).where(eq(objects.id, object.id)).get()!);
  const parties: [Party, Party] = [partyOf(now(a)), partyOf(now(b))];
  const named = { ...report, parties };
  publish({ type: "collision", collision: named });
  return named;
}

// The satellites and derelicts at the root of a collision: its two objects,
// or for debris, the roots of the collision that made it.
export function rootsOf(collision: number): Root[] {
  // operator ids until the end, when they become handles
  const roots = new Map<number, Omit<Root, "operator"> & { operator: number | null }>();
  const seen = new Set<number>();
  const walk = (id: number) => {
    if (seen.has(id)) return;
    seen.add(id);
    const row = db.select().from(collisions).where(eq(collisions.id, id)).get();
    if (!row) return;
    for (const objectId of [row.a, row.b]) {
      const object = db
        .select({
          id: objects.id,
          kind: objects.kind,
          callsign: objects.callsign,
          operator: objects.operator,
          source: objects.sourceCollision,
        })
        .from(objects)
        .where(eq(objects.id, objectId))
        .get();
      if (!object) continue;
      if (object.kind === "debris" && object.source !== null) walk(object.source);
      else roots.set(object.id, { id: object.id, kind: object.kind, callsign: object.callsign, operator: object.operator });
    }
  };
  walk(collision);
  const found = [...roots.values()];
  const names = handles(found.map((root) => root.operator));
  return found
    .map((root) => ({ ...root, operator: root.operator === null ? null : (names.get(root.operator) ?? null) }))
    .sort((a, b) => a.id - b.id);
}

const partyOf = (object: SkyObject): Party => ({
  id: object.id,
  kind: object.kind,
  callsign: object.callsign,
  beacon: object.beacon,
  operator: object.operator === null ? null : (handles([object.operator]).get(object.operator) ?? null),
  from: object.kind === "debris" && object.sourceCollision !== null ? rootsOf(object.sourceCollision) : null,
});

// A collision as the page tells it: when, where, and who it names.
export interface CollisionStory extends CollisionRow {
  parties: [Party, Party];
}

// The latest collisions, newest first.
export function recentCollisions(n: number): CollisionStory[] {
  settle();
  const rows = db.select().from(collisions).orderBy(desc(collisions.at), desc(collisions.id)).limit(n).all();
  return rows.map((row) => {
    const [a, b] = [row.a, row.b].map((id) =>
      toObject(db.select(columns).from(objects).where(eq(objects.id, id)).get()!),
    );
    return { ...row, parties: [partyOf(a), partyOf(b)] };
  });
}

// Every collision ever, oldest first.
export const collisionLog = (): CollisionRow[] => db.select().from(collisions).orderBy(collisions.id).all();

// ── decay (ADR 0007) ──────────────────────────────────────────────────────

// Everything that has burned up by now leaves the sky: its fate becomes
// `decayed`, dated to the moment it burned up (worked out from its orbit, not
// when this ran), and everyone watching is told.
function markDecayed(now: number): SkyObject[] {
  const gone = live().filter((object) => reentryAt(object) <= now);
  if (gone.length > 0) {
    db.transaction((tx) => {
      for (const object of gone) {
        tx.update(objects)
          .set({ fate: "decayed", fateAt: Math.round(reentryAt(object)) })
          .where(and(eq(objects.id, object.id), eq(objects.fate, "live")))
          .run();
      }
    });
    for (const object of gone) publish({ type: "decay", object });
  }
  return gone;
}

// ── derelicts (ADR 0008) ──────────────────────────────────────────────────

// A dead satellite, owned by nobody, put into the sky by the server.
export function addDerelict(orbit: Orbit, now = Date.now()): SkyObject {
  const object = toObject(
    db
      .insert(objects)
      .values({ kind: "derelict", band: bandAt(orbit.radius), launchedAt: now, ...orbit })
      .returning(columns)
      .get(),
  );
  publish({ type: "launch", object });
  refreshMeetings(live());
  announce(now);
  return object;
}

// Tops the sky up with derelicts, each in a random band, towards `baseline`
// satellites and derelicts: one for every DERELICT_GAP since the last one
// went up, so an empty sky (or one the server slept through) fills at once
// and a busy one only slowly.
export function keepDerelicts(now = Date.now(), baseline = DERELICT_BASELINE): void {
  const up = db.select({ n: count() }).from(objects).where(and(eq(objects.fate, "live"), ne(objects.kind, "debris"))).get();
  const last = db.select({ at: max(objects.launchedAt) }).from(objects).where(eq(objects.kind, "derelict")).get();
  const due = last?.at == null ? Infinity : Math.floor((now - last.at) / DERELICT_GAP);
  const bands = Object.keys(BANDS) as Band[];
  for (let n = 0; n < Math.min(baseline - (up?.n ?? 0), due); n++) {
    addDerelict(placeInBand(bands[Math.floor(Math.random() * bands.length)], now), now);
  }
}

// ── keeping the sky up to date ────────────────────────────────────────────

// Brings the sky up to `now`: every collision that has come, in order (each
// one's fragments can hit something sooner, so the schedule is worked out
// again after each), then every burn-up, then the derelicts topped up.
// Every read of the sky runs this first, so a server that was stopped catches
// up before it answers; a timer runs it as each event comes while it's
// running.
export function settle(now = Date.now()): { decayed: SkyObject[]; collisions: CollisionReport[] } {
  const applied: CollisionReport[] = [];
  let sky = live();
  refreshMeetings(sky);
  for (;;) {
    const next = nextHit();
    if (!next || next.at > now) break;
    const report = collide(next, sky);
    applied.push(report);
    sky = sky.filter((object) => object.id !== next.a.id && object.id !== next.b.id).concat(report.fragments);
    refreshMeetings(sky);
  }
  const decayed = markDecayed(now);
  keepDerelicts(now);
  refreshMeetings(live());
  announce(now);
  wakeForNext();
  return { decayed, collisions: applied };
}

export const settleDecay = (now = Date.now()): SkyObject[] => settle(now).decayed;

// Wakes for the next burn-up or collision, or within a minute regardless,
// so a timer never sleeps past a launch that burns up sooner.
let wake: ReturnType<typeof setTimeout> | undefined;
function wakeForNext(): void {
  clearTimeout(wake);
  let next = nextHit()?.at ?? Infinity;
  for (const object of live()) next = Math.min(next, reentryAt(object));
  const wait = Math.min(Math.max(next - Date.now(), 0) + 5, 60_000);
  wake = setTimeout(() => settle(), wait);
  // never what keeps the process alive
  wake.unref?.();
}

export function liveSky(now = Date.now()): SkyObject[] {
  settle(now);
  return live();
}

// ── the record (ADR 0003) ─────────────────────────────────────────────────

// A catalogue row: an object, its orbit, whether it's still up, and when it
// came down.
export interface CatalogueEntry extends Orbit {
  id: number;
  kind: Kind;
  callsign: string | null;
  band: Band;
  launchedAt: number;
  direction: 1 | -1;
  sourceCollision: number | null;
  fate: "live" | "decayed" | "deorbited" | "destroyed";
  fateAt: number | null;
  mine: boolean;
  // its lineage (ADR 0003): for debris, the satellites at the root of the
  // collision it came from; for anything destroyed, what it collided with
  from: Root[] | null;
  collidedWith: Party | null;
}

// The record (ADR 0003): what's in orbit now, or everything ever launched,
// newest first. Owners stay on the server; a row only says if it's yours.
export function catalogue(show: "live" | "all", who: Who): CatalogueEntry[] {
  settle();
  const rows = db
    .select({
      id: objects.id,
      kind: objects.kind,
      owner: objects.owner,
      operator: objects.operator,
      callsign: objects.callsign,
      band: objects.band,
      launchedAt: objects.launchedAt,
      fate: objects.fate,
      fateAt: objects.fateAt,
      radius: objects.radius,
      phase: objects.phase,
      period: objects.period,
      epoch: objects.epoch,
      direction: objects.direction,
      sourceCollision: objects.sourceCollision,
    })
    .from(objects)
    .where(show === "live" ? eq(objects.fate, "live") : undefined)
    .orderBy(desc(objects.launchedAt), desc(objects.id))
    .all();
  // each collision's roots once, however many fragments it made
  const roots = new Map<number, Root[]>();
  const rootsFor = (collision: number) => roots.get(collision) ?? roots.set(collision, rootsOf(collision)).get(collision)!;
  // what each destroyed object met
  const met = new Map<number, number>();
  for (const c of db.select({ a: collisions.a, b: collisions.b }).from(collisions).all()) {
    met.set(c.a, c.b);
    met.set(c.b, c.a);
  }
  const partyById = (id: number) => {
    const row = db.select(columns).from(objects).where(eq(objects.id, id)).get();
    if (!row) return null;
    const object = toObject(row);
    return { ...partyOf({ ...object, sourceCollision: null }), from: object.sourceCollision === null ? null : rootsFor(object.sourceCollision) };
  };
  return rows.map(({ owner, operator, ...row }) => ({
    ...toObject(row),
    mine: ownedBy({ owner, operator }, who),
    from: row.kind === "debris" && row.sourceCollision !== null ? rootsFor(row.sourceCollision) : null,
    collidedWith: row.fate === "destroyed" && met.has(row.id) ? partyById(met.get(row.id)!) : null,
  }));
}

export function catalogueCounts(): { live: number; all: number } {
  settle();
  const row = db
    .select({ all: count(), live: sql<number>`sum(${objects.fate} = 'live')` })
    .from(objects)
    .get();
  return { live: Number(row?.live ?? 0), all: row?.all ?? 0 };
}

// ── launching ─────────────────────────────────────────────────────────────

type LaunchResult = { ok: true; object: SkyObject } | { ok: false; errors: LaunchErrors };

// When a person can next launch: a gap after their last launch, or now.
// (Per operator when signed in, so a second device doesn't double it.)
export function nextLaunchAt(who: Who, now = Date.now()): number {
  if (!viewerOf(who).person) return now;
  const last = db
    .select({ at: max(objects.launchedAt) })
    .from(objects)
    .where(ownerIs(who))
    .get();
  return Math.max(now, (last?.at ?? -Infinity) + LAUNCH_GAP);
}

// "You can launch again in 4 min 05 s."
export function waitMessage(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `You can launch again in ${minutes > 0 ? `${minutes} min ${String(rest).padStart(2, "0")} s` : `${rest} s`}.`;
}

export function launch(who: Viewer | string, input: LaunchInput, now = Date.now(), random = Math.random): LaunchResult {
  settle(now);
  const result = checkAndInsert(viewerOf(who), input, now, random);
  if (result.ok) {
    publish({ type: "launch", object: result.object });
    refreshMeetings(live());
    announce(now);
    wakeForNext();
  }
  return result;
}

const liveSatellites = and(eq(objects.fate, "live"), eq(objects.kind, "satellite"));

// better-sqlite3 is synchronous, so the check and the insert can't interleave
// with another request's.
function checkAndInsert(viewer: Viewer, input: LaunchInput, now: number, random: () => number): LaunchResult {
  return db.transaction((tx) => {
    const ready = nextLaunchAt(viewer, now);
    if (ready > now) return { ok: false as const, errors: { form: waitMessage(ready - now) } };

    const inOrbit = tx.select({ n: count() }).from(objects).where(liveSatellites).get();
    if ((inOrbit?.n ?? 0) >= SKY_CAP)
      return {
        ok: false as const,
        errors: { form: `The sky is full: ${SKY_CAP} satellites in orbit, the most it holds.` },
      };

    const object = tx
      .insert(objects)
      .values({
        kind: "satellite",
        owner: viewer.person,
        operator: viewer.operator,
        callsign: input.callsign,
        beacon: input.beacon,
        band: input.band,
        launchedAt: now,
        ...placeInBand(input.band, now, random),
      })
      .returning(columns)
      .get();
    return { ok: true as const, object: toObject(object) };
  });
}

export function skyIsFull(): boolean {
  settle();
  const row = db.select({ n: count() }).from(objects).where(liveSatellites).get();
  return (row?.n ?? 0) >= SKY_CAP;
}

// The live satellites a person owns, oldest first.
export function satellitesOf(who: Who): SkyObject[] {
  if (!viewerOf(who).person) return [];
  settle();
  return db
    .select(columns)
    .from(objects)
    .where(and(ownerIs(who), eq(objects.fate, "live")))
    .orderBy(objects.id)
    .all()
    .map(toObject);
}
