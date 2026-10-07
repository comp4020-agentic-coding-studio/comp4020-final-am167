import { and, count, countDistinct, desc, eq, gt, inArray, isNotNull, isNull, lt, max, ne, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "../db/index.ts";
import { fatalMeeting, fragmentsOf, impactOf, nextMeeting } from "./collide.ts";
import { listening, publish } from "./events.ts";
import { FUEL, REFUSALS, canManoeuvre, type Refusal } from "./manoeuvre.ts";
import { handles } from "./operators.ts";
import type { LaunchErrors, LaunchInput } from "./launch.ts";
import { STATIONS, nextStation } from "./stations.ts";
import { lineOf, shardsOf, type WreckPiece } from "./wreck.ts";
import {
  BANDS,
  DECAY,
  angleAt,
  bandAt,
  burnAt,
  climb,
  descend,
  periodAt,
  placeInBand,
  radiusAt,
  reentryAt,
  type Band,
  type Orbit,
} from "./orbit.ts";

const { objects, collisions, operators, manoeuvres, transmissions, listens } = schema;

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
  // for debris, the collision it came from, and the words it carries (ADR
  // 0017)
  sourceCollision: number | null;
  words: string | null;
  // the stations' question its beacon answered, if any (ADR 0018)
  question: string | null;
  // for a derelict, the gone satellite whose last words it carries
  echo: number | null;
  // a manoeuvre's rate and the end of a climb (ADR 0011), part of the orbit
  rate: number;
  until: number | null;
  // when its owner started bringing it down, and the boosts it has used
  deorbitedAt: number | null;
  boosts: number;
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
export const isOwnedBy = (object: { owner: string | null; operator: number | null }, who: Who) => ownedBy(object, who);
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
  words: objects.words,
  question: objects.question,
  echo: objects.echo,
  rate: objects.rate,
  until: objects.until,
  deorbitedAt: objects.deorbitedAt,
  boosts: objects.boosts,
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
  // for debris, what it was carrying (ADR 0017)
  words: string | null;
  // the stations' question it was answering (ADR 0018)
  question: string | null;
  // for a derelict carrying an echo (in `words`), whose last words they are
  echoOf: string | null;
  operator: string | null;
  from: Root[] | null;
}

// A collision that has happened: what met, who it names, what it left, and
// what the wreck says (ADR 0017).
export interface CollisionReport extends CollisionRow {
  objects: [SkyObject, SkyObject];
  parties: [Party, Party];
  fragments: SkyObject[];
  wreck: WreckPiece[];
}

interface Hit {
  a: SkyObject;
  b: SkyObject;
  at: number;
}

// When every live pair will meet, if ever. Orbits only change by a
// manoeuvre (ADR 0011), so neither does when two of them meet: each pair is
// worked out once, when the second of them is first seen, and forgotten
// when either leaves the sky or manoeuvres (and then worked out again).
const paired = new Set<number>();
const meetings = new Map<string, Hit>();
// the keys of each object's meetings, to forget them when it goes
const meetingsOf = new Map<number, Set<string>>();

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
      for (const id of [a.id, b.id]) meetingsOf.set(id, (meetingsOf.get(id) ?? new Set()).add(key));
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
  const up = sky.filter((object) => object.launchedAt <= at && reentryAt(object) > at).length - 2;
  const pieces = fragmentsOf(a, b, at).slice(0, Math.max(0, LIVE_CAP - up));
  // each fragment carries a piece of both lines (ADR 0017), cut for the
  // fragments there's room for, so a crowded sky loses no words
  const shards = shardsOf({ id: a.id, text: lineOf(a) }, { id: b.id, text: lineOf(b) }, pieces.length);
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
    const fragments = pieces.map((orbit, i) =>
      toObject(
        tx
          .insert(objects)
          .values({
            kind: "debris",
            band: bandAt(orbit.radius),
            launchedAt: at,
            sourceCollision: row.id,
            words: shards[i],
            ...orbit,
          })
          .returning(columns)
          .get(),
      ),
    );
    return { ...row, fragments };
  });
  // as they are now, not as they were when the hit was predicted: an owner
  // may have claimed a handle since (ADR 0009)
  const fresh = (object: SkyObject) =>
    toObject(db.select(columns).from(objects).where(eq(objects.id, object.id)).get() ?? object);
  const both: [SkyObject, SkyObject] = [fresh(a), fresh(b)];
  const parties: [Party, Party] = [partyOf(both[0]), partyOf(both[1])];
  const wreck = report.fragments.flatMap((f) => (f.words ? [{ words: f.words, up: true }] : []));
  const named = { ...report, objects: both, parties, wreck };
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
  words: object.words,
  question: object.question,
  echoOf: object.echo === null ? null : (db.select({ callsign: objects.callsign }).from(objects).where(eq(objects.id, object.echo)).get()?.callsign ?? null),
  operator: object.operator === null ? null : (handles([object.operator]).get(object.operator) ?? null),
  from: object.kind === "debris" && object.sourceCollision !== null ? rootsOf(object.sourceCollision) : null,
});

// A collision as the page tells it: when, where, who it names, and what
// its wreck says now (ADR 0017).
export interface CollisionStory extends CollisionRow {
  parties: [Party, Party];
  wreck: WreckPiece[];
}

// What each of these collisions' wrecks says: every fragment's words, in
// order, and whether that fragment is still up to say them.
function wrecksOf(ids: number[]): Map<number, WreckPiece[]> {
  const wrecks = new Map(ids.map((id) => [id, [] as WreckPiece[]]));
  if (ids.length === 0) return wrecks;
  const pieces = db
    .select({ source: objects.sourceCollision, words: objects.words, fate: objects.fate })
    .from(objects)
    .where(inArray(objects.sourceCollision, ids))
    .orderBy(objects.id)
    .all();
  for (const piece of pieces) {
    if (piece.words && piece.source !== null) wrecks.get(piece.source)?.push({ words: piece.words, up: piece.fate === "live" });
  }
  return wrecks;
}

const storiesOf = (rows: CollisionRow[]): CollisionStory[] => {
  const wrecks = wrecksOf(rows.map((row) => row.id));
  return rows.map((row) => {
    const [a, b] = [row.a, row.b].map((id) =>
      toObject(db.select(columns).from(objects).where(eq(objects.id, id)).get()!),
    );
    return { ...row, parties: [partyOf(a), partyOf(b)], wreck: wrecks.get(row.id) ?? [] };
  });
};

// The latest collisions, newest first.
export function recentCollisions(n: number): CollisionStory[] {
  settle();
  return storiesOf(db.select().from(collisions).orderBy(desc(collisions.at), desc(collisions.id)).limit(n).all());
}

// An encounter (ADR 0017): a collision one of the viewer's satellites was
// in, told from their side: which of theirs, what it met, and the wreck.
export interface Encounter extends CollisionStory {
  yours: Party;
  other: Party;
}

// What happened to the viewer's satellites since `since` (their last look
// at Yours): encounters, and how many people heard them (each once, however
// many of theirs they heard). `known`: all their encounters, if the caller
// already has them.
export function newsSince(
  who: Who,
  since: number,
  now = Date.now(),
  known?: Encounter[],
): { encounters: Encounter[]; heardBy: number } {
  const encounters = (known ?? encountersOf(who, now, { since })).filter((e) => e.at > since);
  const ids = viewerOf(who).person
    ? db.select({ id: objects.id }).from(objects).where(ownerIs(who)).all().map((row) => row.id)
    : [];
  const heardBy =
    ids.length === 0
      ? 0
      : (db
          .select({ n: countDistinct(listens.listener) })
          .from(listens)
          .where(and(inArray(listens.object, ids), gt(listens.at, since)))
          .get()?.n ?? 0);
  return { encounters, heardBy };
}

// Every collision a satellite of the viewer's was in, newest first: those
// after `since`, and only the latest `limit`, if asked.
export function encountersOf(who: Who, now = Date.now(), { since = 0, limit }: { since?: number; limit?: number } = {}): Encounter[] {
  if (!viewerOf(who).person && viewerOf(who).operator === null) return [];
  settle(now);
  const ids = db
    .select({ id: objects.id })
    .from(objects)
    .where(and(ownerIs(who), eq(objects.kind, "satellite"), eq(objects.fate, "destroyed")))
    .all()
    .map((row) => row.id);
  if (ids.length === 0) return [];
  const query = db
    .select()
    .from(collisions)
    .where(and(gt(collisions.at, since), or(inArray(collisions.a, ids), inArray(collisions.b, ids))))
    .orderBy(desc(collisions.at), desc(collisions.id));
  const rows = limit === undefined ? query.all() : query.limit(limit).all();
  const mine = new Set(ids);
  return storiesOf(rows).map((story) => {
    const [a, b] = story.parties;
    return mine.has(a.id) ? { ...story, yours: a, other: b } : { ...story, yours: b, other: a };
  });
}

// Every collision ever, oldest first.
export const collisionLog = (): CollisionRow[] => db.select().from(collisions).orderBy(collisions.id).all();

// ── decay (ADR 0007) ──────────────────────────────────────────────────────

// Everything that has burned up by now leaves the sky: its fate becomes
// `decayed` (or `deorbited`, if its owner brought it down: ADR 0011), dated
// to the moment it burned up (worked out from its orbit, not when this
// ran), and everyone watching is told.
function markDecayed(now: number): SkyObject[] {
  const gone = live().filter((object) => reentryAt(object) <= now);
  if (gone.length > 0) {
    db.transaction((tx) => {
      for (const object of gone) {
        tx.update(objects)
          .set({ fate: object.deorbitedAt === null ? "decayed" : "deorbited", fateAt: Math.round(reentryAt(object)) })
          .where(and(eq(objects.id, object.id), eq(objects.fate, "live")))
          .run();
      }
    });
    for (const object of gone) publish({ type: "decay", object });
  }
  return gone;
}

// ── derelicts (ADR 0008) ──────────────────────────────────────────────────

// A dead satellite, owned by nobody, put into the sky by the server. It
// carries an echo: the last words of a satellite gone from the sky (the
// record keeps it), picked at random, so a collision with a derelict still breaks someone's
// words into someone else's (the review, 2026-10-07). None until something
// has gone.
// Up to `n` lines of satellites gone by `now`, at random, to echo.
const echoes = (n: number, now: number) =>
  db
    .select({ id: objects.id, beacon: objects.beacon })
    .from(objects)
    .where(and(eq(objects.kind, "satellite"), ne(objects.fate, "live"), isNotNull(objects.beacon), lt(objects.launchedAt, now)))
    .orderBy(sql`random()`)
    .limit(n)
    .all();

export function addDerelict(orbit: Orbit, now = Date.now()): SkyObject {
  const [echo] = echoes(1, now);
  const object = toObject(
    db
      .insert(objects)
      .values({ kind: "derelict", band: bandAt(orbit.radius), launchedAt: now, ...orbit, words: echo?.beacon ?? null, echo: echo?.id ?? null })
      .returning(columns)
      .get(),
  );
  publish({ type: "launch", object });
  unquiet();
  refreshMeetings(live());
  announce(now);
  return object;
}

// Derelicts still up from before they carried echoes (or put up while
// nothing had gone) get one, once, as the server starts: otherwise the
// sky's derelicts stay silent for days after a deploy (the second review,
// 2026-10-07). Only once, before anything moves, so a sky that kept
// running and one replayed after a stop break the same words.
let echoed = false;
function echoTheSilent(now: number): void {
  const silent = db
    .select({ id: objects.id })
    .from(objects)
    .where(and(eq(objects.kind, "derelict"), eq(objects.fate, "live"), isNull(objects.echo)))
    .all();
  if (silent.length === 0) return;
  const lines = echoes(silent.length, now);
  if (lines.length === 0) return;
  db.transaction((tx) => {
    silent.forEach((derelict, i) => {
      const line = lines[i % lines.length];
      tx.update(objects).set({ words: line.beacon, echo: line.id }).where(eq(objects.id, derelict.id)).run();
    });
  });
}

// ── a collision to watch (ADR 0008) ───────────────────────────────────────

// When nothing is coming, a visitor could watch for an hour and see no
// collision. So, for someone watching, and no more often than `every`, the
// server sends two derelicts at each other: same height, opposite ways, a
// dead-centre pass (collide.ts) that meets over a ground station, picked at
// random, `lead` from now. The rest of the world launches too.
export const STAGE = {
  every: 5 * 60_000,
  horizon: 4 * 60_000,
  lead: 25_000,
  radius: 1.3,
  // not into a sky that's already busy
  busy: 150,
};
let lastStaged = -Infinity;

export function stageCollision(now = Date.now()): Conjunction | null {
  if (now - lastStaged < STAGE.every) return null;
  if (schedule().some((hit) => hit.at > now && hit.at - now < STAGE.horizon)) return null;
  if (live().length >= STAGE.busy) return null;
  lastStaged = now;
  const period = periodAt(STAGE.radius);
  // how far each sweeps before they meet (lead is under half a lap, so this
  // is their first meeting)
  const sweep = ((2 * Math.PI) / period) * STAGE.lead;
  const way: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
  const station = STATIONS[Math.floor(Math.random() * STATIONS.length)];
  const orbit = (direction: 1 | -1) => ({
    radius: STAGE.radius,
    phase: station.angle - direction * sweep,
    period: Math.round(period),
    epoch: now,
    direction,
  });
  const a = addDerelict(orbit(way), now);
  const b = addDerelict(orbit(-way as 1 | -1), now);
  const hit = meetings.get(`${Math.min(a.id, b.id)}:${Math.max(a.id, b.id)}`);
  return hit ? toConjunction(hit) : null;
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
//
// Most reads come between events, with nothing to do: until the next
// collision or burn-up (and at least every QUIET_MS, for the derelicts),
// settling returns at once. A launch or a new derelict ends the quiet.
const QUIET_MS = 15_000;
let quietFrom = Infinity;
let quietUntil = -Infinity;
const unquiet = () => {
  quietUntil = -Infinity;
};

// Someone has just opened the sky: settle now, so a collision can be
// staged for them (stageCollision) without waiting out the quiet.
export function watcherArrived(): void {
  unquiet();
}

// Orbits launched before they slowed down (ADR 0013) went round three times
// as fast for their height. Each one still up gets a new epoch, now: where
// it is, with today's period for its height, so it carries on from there,
// slower, and falls to the same burn-up. One already in its last plunge is
// left to burn up. Anything on today's law is left alone, so it runs once.
// Needed until nothing launched before the change can still be up (three
// days after it deployed).
let retimed = false;
export function retime(now = Date.now()): void {
  const old = live().filter((o) => o.period < 0.6 * periodAt(o.radius) && o.epoch <= now && now < burnAt(o));
  if (old.length === 0) return;
  db.transaction((tx) => {
    for (const o of old) {
      const radius = radiusAt(o, now);
      // a climb that has ended: it falls by drag alone from here
      const climbed = o.until !== null && o.until <= now;
      tx.update(objects)
        .set({
          radius,
          phase: angleAt(o, now),
          period: Math.round(periodAt(radius)),
          epoch: now,
          rate: climbed ? 1 : o.rate,
          until: climbed ? null : o.until,
        })
        .where(eq(objects.id, o.id))
        .run();
    }
  });
}

export function settle(now = Date.now()): { decayed: SkyObject[]; collisions: CollisionReport[] } {
  // marked done only once it has worked: a busy or full disk tries again
  // on the next settle
  if (!retimed) {
    retime(now);
    retimed = true;
  }
  if (!echoed) {
    echoTheSilent(now);
    echoed = true;
  }
  if (now >= quietFrom && now < quietUntil) return { decayed: [], collisions: [] };
  const applied: CollisionReport[] = [];
  let sky = live();
  refreshMeetings(sky);
  for (;;) {
    const next = nextHit();
    if (!next || next.at > now) break;
    try {
      const report = collide(next, sky);
      applied.push(report);
      sky = sky.filter((object) => object.id !== next.a.id && object.id !== next.b.id).concat(report.fragments);
    } catch (error) {
      // a collision that can't be written (a busy or full disk) is dropped,
      // so it can't fail every read after it; the sky goes on without it
      console.error(`collision of ${next.a.id} and ${next.b.id} failed:`, error);
      meetings.delete(`${next.a.id}:${next.b.id}`);
      continue;
    }
    refreshMeetings(sky);
  }
  const decayed = markDecayed(now);
  keepDerelicts(now);
  // only for someone watching: a collision staged for nobody is just debris
  if (DERELICT_BASELINE > 0 && listening() > 0) stageCollision(now);
  refreshMeetings(live());
  announce(now);
  const next = wakeForNext();
  quietFrom = now;
  quietUntil = Math.min(next, now + QUIET_MS);
  return { decayed, collisions: applied };
}

export const settleDecay = (now = Date.now()): SkyObject[] => settle(now).decayed;

// Wakes for the next burn-up or collision, or within a minute regardless,
// so a timer never sleeps past a launch that burns up sooner.
// Returns when the next one is.
let wake: ReturnType<typeof setTimeout> | undefined;
function wakeForNext(): number {
  clearTimeout(wake);
  let next = nextHit()?.at ?? Infinity;
  for (const object of live()) next = Math.min(next, reentryAt(object));
  const wait = Math.min(Math.max(next - Date.now(), 0) + 5, 60_000);
  wake = setTimeout(() => {
    // an error here would otherwise end the process
    try {
      settle();
    } catch (error) {
      console.error("settling the sky failed:", error);
      wakeForNext();
    }
  }, wait);
  // never what keeps the process alive
  wake.unref?.();
  return next;
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
  // when its owner started bringing it down (ADR 0011)
  deorbitedAt: number | null;
  // its operator's handle, if it has one (ADR 0009)
  handle: string | null;
  mine: boolean;
  // its lineage (ADR 0003): for debris, the satellites at the root of the
  // collision it came from; for anything destroyed, what it collided with
  from: Root[] | null;
  collidedWith: Party | null;
}

// How to look at the record: which objects, in what order, which page.
// Read from the page's address, so every view can be linked to and the
// form works without JavaScript.
export type Fate = CatalogueEntry["fate"];
export const SORTS = ["launched", "name", "kind", "band", "height", "status", "operator"] as const;
export type Sort = (typeof SORTS)[number];
export interface CatalogueQuery {
  // what's up now, everything ever, or everything of yours (ADR 0015)
  show: "live" | "all" | "mine";
  kind: Kind | null;
  band: Band | null;
  // only with show "all" or "mine": live is what "In orbit" shows
  fate: Fate | null;
  // a callsign or an operator's handle, or part of one
  q: string;
  sort: Sort;
  dir: "asc" | "desc";
  page: number;
  per: number;
}

export const PER_PAGE = 100;
const PER_MAX = 200;
// which way each column sorts first: names A to Z, newest launches first
export const FIRST_DIR: Record<Sort, "asc" | "desc"> = {
  launched: "desc",
  name: "asc",
  kind: "asc",
  band: "asc",
  height: "asc",
  status: "asc",
  operator: "asc",
};

const oneOf = <T extends string>(value: string | null, options: readonly T[]): T | null =>
  value !== null && (options as readonly string[]).includes(value) ? (value as T) : null;

export function readCatalogueQuery(params: URLSearchParams): CatalogueQuery {
  // (`mine=1` was the "Only yours" box before Yours was a view of its own:
  // an old link to it opens Yours)
  const show = params.get("mine") === "1" ? "mine" : (oneOf(params.get("show"), ["all", "mine"] as const) ?? "live");
  const sort = oneOf(params.get("sort"), SORTS) ?? "launched";
  const whole = (value: string | null, fallback: number, min: number, max: number) => {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n >= min ? Math.min(n, max) : fallback;
  };
  return {
    show,
    kind: oneOf(params.get("kind"), ["satellite", "derelict", "debris"] as const),
    band: oneOf(params.get("band"), Object.keys(BANDS) as Band[]),
    fate: show !== "live" ? oneOf(params.get("fate"), ["live", "decayed", "deorbited", "destroyed"] as const) : null,
    q: (params.get("q") ?? "").trim().slice(0, 40),
    sort,
    dir: oneOf(params.get("dir"), ["asc", "desc"] as const) ?? FIRST_DIR[sort],
    page: whole(params.get("page"), 1, 1, 1_000_000),
    per: whole(params.get("per"), PER_PAGE, 1, PER_MAX),
  };
}

export const DEFAULT_QUERY: CatalogueQuery = readCatalogueQuery(new URLSearchParams());

export interface CataloguePage {
  rows: CatalogueEntry[];
  // how many match, and which of them this page holds (1-based, inclusive)
  total: number;
  from: number;
  to: number;
  pages: number;
}

// The record (ADR 0003), filtered, sorted and paged. Owners stay on the
// server; a row only says if it's yours. Lineage is worked out for the
// rows on the page only.
export function browse(query: CatalogueQuery, who: Who, now = Date.now()): CataloguePage {
  settle(now);
  const pattern = `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const fate = query.show === "live" ? "live" : query.fate;
  const rows = db
    .select({
      id: objects.id,
      kind: objects.kind,
      owner: objects.owner,
      operator: objects.operator,
      handle: operators.handle,
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
      rate: objects.rate,
      until: objects.until,
      deorbitedAt: objects.deorbitedAt,
    })
    .from(objects)
    .leftJoin(operators, eq(objects.operator, operators.id))
    .where(
      and(
        fate ? eq(objects.fate, fate) : undefined,
        query.kind ? eq(objects.kind, query.kind) : undefined,
        query.band ? eq(objects.band, query.band) : undefined,
        query.show === "mine" ? ownerIs(who) : undefined,
        query.q
          ? sql`(${objects.callsign} LIKE ${pattern} ESCAPE '\\' OR ${operators.handle} LIKE ${pattern} ESCAPE '\\')`
          : undefined,
      ),
    )
    .orderBy(desc(objects.launchedAt), desc(objects.id))
    .all();

  // the sort, in memory: a height is worked out from the orbit, and names
  // include the kind of what has none. Ties stay newest first.
  const nameOf = (row: (typeof rows)[number]) =>
    row.kind === "satellite" ? (row.callsign ?? "") : row.kind === "derelict" ? "Derelict" : "Fragment";
  const up = (row: (typeof rows)[number]) => row.fate === "live";
  const order = ["live", "destroyed", "decayed", "deorbited"];
  const text = (a: string | null, b: string | null) =>
    a === b ? 0 : a === null ? 1 : b === null ? -1 : a.localeCompare(b, "en", { sensitivity: "base" });
  const keyed = rows.map((row) => ({ row, height: up(row) ? radiusAt(toObject(row), now) : null }));
  const sign = query.dir === "asc" ? 1 : -1;
  const compare = (x: (typeof keyed)[number], y: (typeof keyed)[number]): number => {
    switch (query.sort) {
      case "launched":
        return sign * (x.row.launchedAt - y.row.launchedAt);
      case "name":
        return sign * text(nameOf(x.row), nameOf(y.row));
      case "kind":
        return sign * text(x.row.kind, y.row.kind);
      case "band":
        return sign * (Object.keys(BANDS).indexOf(x.row.band) - Object.keys(BANDS).indexOf(y.row.band));
      case "height":
        // nothing gone has a height: always last
        if (x.height === null || y.height === null) return x.height === y.height ? 0 : x.height === null ? 1 : -1;
        return sign * (x.height - y.height);
      case "status":
        return sign * (order.indexOf(x.row.fate) - order.indexOf(y.row.fate) || (y.row.fateAt ?? 0) - (x.row.fateAt ?? 0));
      case "operator":
        // anyone without a handle comes last
        if (x.row.handle === null || y.row.handle === null) return text(x.row.handle, y.row.handle);
        return sign * text(x.row.handle, y.row.handle);
    }
  };
  keyed.sort((x, y) => compare(x, y) || y.row.launchedAt - x.row.launchedAt || y.row.id - x.row.id);

  const total = keyed.length;
  const pages = Math.max(1, Math.ceil(total / query.per));
  const page = Math.min(query.page, pages);
  const shown = keyed.slice((page - 1) * query.per, page * query.per).map(({ row }) => row);

  // each collision's roots once, however many fragments it made
  const roots = new Map<number, Root[]>();
  const rootsFor = (collision: number) => roots.get(collision) ?? roots.set(collision, rootsOf(collision)).get(collision)!;
  // what each destroyed object on the page met
  const destroyed = shown.filter((row) => row.fate === "destroyed").map((row) => row.id);
  const met = new Map<number, number>();
  if (destroyed.length > 0) {
    const hits = db
      .select({ a: collisions.a, b: collisions.b })
      .from(collisions)
      .where(sql`${collisions.a} IN ${destroyed} OR ${collisions.b} IN ${destroyed}`)
      .all();
    for (const c of hits) {
      met.set(c.a, c.b);
      met.set(c.b, c.a);
    }
  }
  const partyById = (id: number) => {
    const row = db.select(columns).from(objects).where(eq(objects.id, id)).get();
    if (!row) return null;
    const object = toObject(row);
    return { ...partyOf({ ...object, sourceCollision: null }), from: object.sourceCollision === null ? null : rootsFor(object.sourceCollision) };
  };
  return {
    rows: shown.map(({ owner, operator, ...row }) => ({
      ...toObject(row),
      mine: ownedBy({ owner, operator }, who),
      from: row.kind === "debris" && row.sourceCollision !== null ? rootsFor(row.sourceCollision) : null,
      collidedWith: row.fate === "destroyed" && met.has(row.id) ? partyById(met.get(row.id)!) : null,
    })),
    total,
    from: total === 0 ? 0 : (page - 1) * query.per + 1,
    to: (page - 1) * query.per + shown.length,
    pages,
  };
}

// The newest rows of the record, unfiltered: what's in orbit, or everything.
export const CATALOGUE_MAX = 500;
export const catalogue = (show: "live" | "all", who: Who): CatalogueEntry[] =>
  browse({ ...DEFAULT_QUERY, show, per: CATALOGUE_MAX }, who).rows;

export function catalogueCounts(): { live: number; all: number } {
  settle();
  const row = db
    .select({ all: count(), live: sql<number>`sum(${objects.fate} = 'live')` })
    .from(objects)
    .get();
  return { live: Number(row?.live ?? 0), all: row?.all ?? 0 };
}

// ── an object's history (ADR 0012) ────────────────────────────────────────

// One object's record, told at length: where it came from, what happened to
// it, and what followed it.
export interface History {
  id: number;
  kind: Kind;
  callsign: string | null;
  band: Band;
  launchedAt: number;
  handle: string | null;
  mine: boolean;
  fate: Fate;
  fateAt: number | null;
  // its beacon, once it's been heard or it's gone (or to its owner,
  // always: ADR 0012, 0016); until then it's withheld here
  beacon: string | null;
  withheld: boolean;
  // how many people have heard it, over how many passes (ADR 0016)
  heard: { by: number; passes: number };
  // while it's up: when it next passes over a ground station, and which
  // (null if it burns up first), and when it burns up
  nextPass: { at: number; station: string } | null;
  reentryAt: number | null;
  // and its orbit, so a page can keep those counting down
  orbit: Required<Orbit> | null;
  // what its owner has done with it (ADR 0011), for its controls (ADR 0015)
  deorbitedAt: number | null;
  boosts: number;
  // boosts and deorbits (ADR 0011), oldest first, with the band each aimed for
  manoeuvres: { kind: ManoeuvreKind; at: number; to: Band }[];
  // for debris, the words it carries (ADR 0017); for a derelict, the echo
  // it carries, and whose last words they were
  words: string | null;
  echoOf: { id: number; callsign: string | null } | null;
  // the stations' question it answered (ADR 0018)
  question: string | null;
  // for debris: the collision it came from, what met, and who that traces to
  origin: { collision: number; at: number; parties: [Party, Party]; roots: Root[] } | null;
  // for anything destroyed: its collision, what it met, and what the wreck
  // says now (ADR 0017)
  end: { collision: number; at: number; with: Party; wreck: WreckPiece[] } | null;
  // everything downstream of it: the fragments its own collision left;
  // everything those (and theirs) went on to: the collisions, what they
  // destroyed, every fragment in all, and how many of those are still up.
  // The blame, read forwards.
  followed: { left: number; collisions: number; fragments: number; up: number; destroyed: Root[] };
}

export const objectById = (id: number): SkyObject | null => {
  const row = db.select(columns).from(objects).where(eq(objects.id, id)).get();
  return row ? toObject(row) : null;
};

export function historyOf(id: number, who: Who, now = Date.now()): History | null {
  settle(now);
  const row = db
    .select({ ...columns, fate: objects.fate, fateAt: objects.fateAt, handle: operators.handle })
    .from(objects)
    .leftJoin(operators, eq(objects.operator, operators.id))
    .where(eq(objects.id, id))
    .get();
  if (!row) return null;
  const object = toObject(row);
  const mine = ownedBy(object, who);
  const flying = object.fate === "live";
  const heard = {
    by: db.select({ n: count() }).from(listens).where(eq(listens.object, id)).get()?.n ?? 0,
    passes: db.select({ n: count() }).from(transmissions).where(eq(transmissions.object, id)).get()?.n ?? 0,
  };
  const shown = !flying || mine || heard.passes > 0;
  const pass = flying ? nextStation(object, now) : null;

  // Every collision and every fragment, read once and walked in memory: two
  // queries however long the cascade (the sky holds a few hundred objects,
  // and the record grows by a few collisions an hour).
  const byObject = new Map<number, CollisionRow[]>();
  for (const c of db.select().from(collisions).all()) {
    for (const member of [c.a, c.b]) byObject.set(member, [...(byObject.get(member) ?? []), c]);
  }
  const leftBy = new Map<number, { id: number; fate: Fate }[]>();
  const debris = db
    .select({ id: objects.id, fate: objects.fate, source: objects.sourceCollision })
    .from(objects)
    .where(sql`${objects.sourceCollision} IS NOT NULL`)
    .all();
  for (const d of debris) leftBy.set(d.source!, [...(leftBy.get(d.source!) ?? []), d]);

  const party = (other: number) => {
    const found = objectById(other);
    return found ? partyOf(found) : null;
  };
  const meeting = (c: CollisionRow | null | undefined) => {
    if (!c) return null;
    const [a, b] = [party(c.a), party(c.b)];
    return a && b ? { c, parties: [a, b] as [Party, Party] } : null;
  };
  const source =
    object.sourceCollision === null
      ? null
      : meeting(db.select().from(collisions).where(eq(collisions.id, object.sourceCollision)).get());
  // an object collides once: it's destroyed
  const own = object.fate === "destroyed" ? meeting(byObject.get(id)?.[0]) : null;

  // walk forwards: each collision a member of its lineage had, and the
  // fragments each left, which join the lineage. What it hit is worked out
  // last, once the whole lineage is known, so two of its own fragments
  // meeting aren't counted as a loss.
  const lineage = new Set([id]);
  const queue = [id];
  const walked = new Map<number, CollisionRow>();
  let up = 0;
  while (queue.length > 0) {
    for (const c of byObject.get(queue.shift()!) ?? []) {
      if (walked.has(c.id)) continue;
      walked.set(c.id, c);
      for (const fragment of leftBy.get(c.id) ?? []) {
        if (lineage.has(fragment.id)) continue;
        lineage.add(fragment.id);
        queue.push(fragment.id);
        if (fragment.fate === "live") up++;
      }
    }
  }
  const destroyed = [...walked.values()]
    .filter((c) => c.id !== own?.c.id)
    .flatMap((c) => [c.a, c.b].filter((other) => !lineage.has(other)))
    .map(objectById)
    .flatMap((o) => (o ? [{ id: o.id, kind: o.kind, callsign: o.callsign, operator: o.operator }] : []));
  const names = handles(destroyed.map((o) => o.operator));

  return {
    id: object.id,
    kind: object.kind,
    callsign: object.callsign,
    band: object.band,
    launchedAt: object.launchedAt,
    handle: row.handle,
    mine,
    fate: row.fate,
    fateAt: row.fateAt,
    beacon: shown ? object.beacon : null,
    withheld: !shown && object.beacon !== null,
    heard,
    nextPass: pass === null ? null : { at: now + pass.in, station: pass.station.name },
    reentryAt: flying ? reentryAt(object) : null,
    orbit: flying
      ? {
          radius: object.radius,
          phase: object.phase,
          period: object.period,
          epoch: object.epoch,
          direction: object.direction,
          rate: object.rate,
          until: object.until,
        }
      : null,
    deorbitedAt: object.deorbitedAt,
    boosts: object.boosts,
    words: object.words,
    echoOf: object.echo === null ? null : { id: object.echo, callsign: objectById(object.echo)?.callsign ?? null },
    question: object.question,
    manoeuvres: manoeuvresOf(id).map((m) => ({ kind: m.kind, at: m.at, to: bandAt(m.toRadius) })),
    origin: source && { collision: source.c.id, at: source.c.at, parties: source.parties, roots: rootsOf(source.c.id) },
    end: own && {
      collision: own.c.id,
      at: own.c.at,
      with: own.parties[own.c.a === id ? 1 : 0],
      wreck: wrecksOf([own.c.id]).get(own.c.id) ?? [],
    },
    followed: {
      left: own ? (leftBy.get(own.c.id)?.length ?? 0) : 0,
      collisions: walked.size - (own ? 1 : 0),
      fragments: lineage.size - 1,
      up,
      destroyed: destroyed.map((o) => ({ ...o, operator: o.operator === null ? null : (names.get(o.operator) ?? null) })),
    },
  };
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
    unquiet();
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
        question: input.question,
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

// Whether an object is the first a person ever launched, up or long gone:
// the sky explains itself after that one only.
export function isFirstLaunch(who: Who, id: number): boolean {
  if (!viewerOf(who).person) return false;
  const first = db
    .select({ id: sql<number | null>`min(${objects.id})` })
    .from(objects)
    .where(and(ownerIs(who), eq(objects.kind, "satellite")))
    .get();
  return first?.id === id;
}

// ── deorbiting and boosting (ADR 0011) ────────────────────────────────────

export type ManoeuvreKind = "deorbit" | "boost";
export type ManoeuvreRow = typeof manoeuvres.$inferSelect;
type ManoeuvreResult = { ok: true; object: SkyObject } | { ok: false; error: string; why: Refusal };
const refuse = (why: Refusal): ManoeuvreResult => ({ ok: false, error: REFUSALS[why], why });

// Your satellite, live, as it is at `now`; or null.
function yours(who: Who, id: number, now: number): SkyObject | null {
  settle(now);
  const row = db
    .select(columns)
    .from(objects)
    .where(and(eq(objects.id, id), eq(objects.fate, "live"), eq(objects.kind, "satellite")))
    .get();
  if (!row || !ownedBy(row, who)) return null;
  const object = toObject(row);
  // gone already, though not marked yet
  return reentryAt(object) > now ? object : null;
}

// A new orbit for an object, from `now`: stored, recorded, its collisions
// worked out again, and everyone told. Only if `allowed` still holds in the
// database as it's written (a boost not yet used, a satellite not already
// coming down), so no way of asking twice can do it twice; null if not.
function manoeuvre(
  object: SkyObject,
  kind: ManoeuvreKind,
  orbit: Required<Orbit>,
  now: number,
  extra: Partial<typeof objects.$inferInsert>,
  allowed: SQL,
): SkyObject | null {
  const after = db.transaction((tx) => {
    const row = tx
      .update(objects)
      .set({ ...orbit, ...extra })
      .where(and(eq(objects.id, object.id), eq(objects.fate, "live"), allowed))
      .returning(columns)
      .get();
    if (!row) return null;
    tx.insert(manoeuvres)
      .values({
        object: object.id,
        kind,
        at: now,
        fromRadius: radiusAt(object, now),
        toRadius: kind === "deorbit" ? DECAY.burnRadius : radiusAt(orbit, orbit.until ?? now),
      })
      .run();
    return toObject(row);
  });
  if (!after) return null;
  // its meetings were for the old orbit: forget them, and the collisions
  // coming that everyone was told of, then work them out again
  for (const key of meetingsOf.get(object.id) ?? []) announced.delete(key);
  forget(object.id);
  publish({ type: "manoeuvre", manoeuvre: kind, object: after, operator: partyOf(after).operator });
  unquiet();
  refreshMeetings(live());
  announce(now);
  wakeForNext();
  return after;
}

// Bring your satellite down (ADR 0011): it falls to the top of the
// atmosphere in two minutes, then burns up, and ends `deorbited`.
export function deorbit(who: Who, id: number, now = Date.now()): ManoeuvreResult {
  const object = yours(who, id, now);
  if (!object) return refuse("not-yours");
  const why = canManoeuvre(object, now).deorbit;
  if (why) return refuse(why);
  const after = manoeuvre(object, "deorbit", descend(object, now), now, { deorbitedAt: now }, isNull(objects.deorbitedAt));
  return after ? { ok: true, object: after } : refuse("coming-down");
}

// Boost your satellite up a band (ADR 0011): it climbs to a height in the
// next band, picked like a launch's, using its one tank of fuel.
export function boost(who: Who, id: number, now = Date.now(), random = Math.random): ManoeuvreResult {
  const object = yours(who, id, now);
  if (!object) return refuse("not-yours");
  const { boost: why, to } = canManoeuvre(object, now);
  if (why || !to) return refuse(why ?? "top-band");
  // a height in the next band up, like a launch's, but not short of its
  // lower edge, so a boost from the top of a band still climbs one
  let target = placeInBand(to, now, random).radius;
  for (let tries = 0; target < BANDS[to].minRadius && tries < 20; tries++) target = placeInBand(to, now, random).radius;
  target = Math.max(target, BANDS[to].minRadius);
  const after = manoeuvre(object, "boost", climb(object, now, target), now, { boosts: object.boosts + 1 }, and(lt(objects.boosts, FUEL), isNull(objects.deorbitedAt))!);
  return after ? { ok: true, object: after } : refuse("no-fuel");
}

// An object's manoeuvres, oldest first.
export const manoeuvresOf = (id: number): ManoeuvreRow[] =>
  db.select().from(manoeuvres).where(eq(manoeuvres.object, id)).orderBy(manoeuvres.id).all();
