import { and, count, desc, eq, max, ne, sql } from "drizzle-orm";
import { db, schema } from "../db/index.ts";
import { publish } from "./events.ts";
import type { LaunchErrors, LaunchInput } from "./launch.ts";
import { placeInBand, reentryAt, type Band, type Orbit } from "./orbit.ts";

const { objects } = schema;

// After your satellite leaves the sky, how long before you can launch again
// (PLAN.md, "Launch limits").
export const RELAUNCH_COOLDOWN = 10 * 60_000;

// The most satellites the sky holds at once (PLAN.md, "Launch limits"), so
// the sky, and the 256 MB machine holding it, can't outgrow decay clearing
// it. SKY_CAP overrides it for testing.
export const SKY_CAP = Number(process.env.SKY_CAP ?? 200);

// An object as the server holds it, owner included.
export interface SkyObject extends Orbit {
  id: number;
  owner: string | null;
  callsign: string | null;
  beacon: string | null;
  band: Band;
  launchedAt: number;
}

// What a client sees of an object: never the owner, only whether it's theirs.
export type PublicObject = Omit<SkyObject, "owner"> & { mine: boolean };

export const toPublic = ({ owner, ...object }: SkyObject, person: string | undefined): PublicObject => ({
  ...object,
  mine: owner !== null && owner === person,
});

const columns = {
  id: objects.id,
  owner: objects.owner,
  callsign: objects.callsign,
  beacon: objects.beacon,
  band: objects.band,
  launchedAt: objects.launchedAt,
  radius: objects.radius,
  phase: objects.phase,
  period: objects.period,
  epoch: objects.epoch,
};

const live = (): SkyObject[] =>
  db.select(columns).from(objects).where(eq(objects.fate, "live")).orderBy(objects.id).all();

// ── decay (ADR 0007) ──────────────────────────────────────────────────────

// Everything that has burned up by now leaves the sky: its fate becomes
// `decayed`, dated to the moment it burned up (worked out from its orbit, not
// when this ran), and everyone watching is told. Every read of the sky runs
// this first, so a server that was stopped while things burned up catches up
// before it answers; a timer runs it as each one burns up while it's running.
export function settleDecay(now = Date.now()): SkyObject[] {
  const sky = live();
  const gone = sky.filter((object) => reentryAt(object) <= now);
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
  scheduleDecay(sky.filter((object) => !gone.includes(object)));
  return gone;
}

// Wakes for the next burn-up, or within a minute regardless, so a timer
// never sleeps past a launch that burns up sooner.
let wake: ReturnType<typeof setTimeout> | undefined;
function scheduleDecay(sky: SkyObject[]): void {
  clearTimeout(wake);
  let next = Infinity;
  for (const object of sky) next = Math.min(next, reentryAt(object));
  const wait = Math.min(Math.max(next - Date.now(), 0) + 5, 60_000);
  wake = setTimeout(() => settleDecay(), wait);
  // never what keeps the process alive
  wake.unref?.();
}

export function liveSky(): SkyObject[] {
  settleDecay();
  return live();
}

// A catalogue row: an object, its orbit, whether it's still up, and when it
// came down.
export interface CatalogueEntry extends Orbit {
  id: number;
  callsign: string | null;
  band: Band;
  launchedAt: number;
  fate: "live" | "decayed" | "deorbited" | "destroyed";
  fateAt: number | null;
  mine: boolean;
}

// The record (ADR 0003): what's in orbit now, or everything ever launched,
// newest first. Owners stay on the server; a row only says if it's yours.
export function catalogue(show: "live" | "all", person: string | undefined): CatalogueEntry[] {
  settleDecay();
  const rows = db
    .select({
      id: objects.id,
      owner: objects.owner,
      callsign: objects.callsign,
      band: objects.band,
      launchedAt: objects.launchedAt,
      fate: objects.fate,
      fateAt: objects.fateAt,
      radius: objects.radius,
      phase: objects.phase,
      period: objects.period,
      epoch: objects.epoch,
    })
    .from(objects)
    .where(show === "live" ? eq(objects.fate, "live") : undefined)
    .orderBy(desc(objects.launchedAt), desc(objects.id))
    .all();
  return rows.map(({ owner, ...row }) => ({ ...row, mine: owner !== null && owner === person }));
}

export function catalogueCounts(): { live: number; all: number } {
  settleDecay();
  const row = db
    .select({ all: count(), live: sql<number>`sum(${objects.fate} = 'live')` })
    .from(objects)
    .get();
  return { live: Number(row?.live ?? 0), all: row?.all ?? 0 };
}

type LaunchResult = { ok: true; object: SkyObject } | { ok: false; errors: LaunchErrors };

const ALREADY_UP = (callsign: string | null) => ({
  ok: false as const,
  errors: { form: `${callsign ?? "Your satellite"} is already in orbit. One live satellite each.` },
});

export function launch(person: string, input: LaunchInput, now = Date.now()): LaunchResult {
  settleDecay(now);
  let result: LaunchResult;
  try {
    result = checkAndInsert(person, input, now);
  } catch (error) {
    // the database's own one-live rule (schema.ts) caught what the check missed
    if ((error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") return ALREADY_UP(null);
    throw error;
  }
  if (result.ok) {
    publish({ type: "launch", object: result.object });
    scheduleDecay(live());
  }
  return result;
}

// better-sqlite3 is synchronous, so the check and the insert can't interleave
// with another request's.
function checkAndInsert(person: string, input: LaunchInput, now: number): LaunchResult {
  return db.transaction((tx) => {
    const live = tx
      .select(columns)
      .from(objects)
      .where(and(eq(objects.owner, person), eq(objects.fate, "live")))
      .get();
    if (live) return ALREADY_UP(live.callsign);

    const inOrbit = tx.select({ n: count() }).from(objects).where(eq(objects.fate, "live")).get();
    if ((inOrbit?.n ?? 0) >= SKY_CAP)
      return {
        ok: false as const,
        errors: { form: `The sky is full: ${SKY_CAP} satellites in orbit, the most it holds.` },
      };

    const last = tx
      .select({ at: max(objects.fateAt) })
      .from(objects)
      .where(and(eq(objects.owner, person), ne(objects.fate, "live")))
      .get();
    if (last?.at && now - last.at < RELAUNCH_COOLDOWN) {
      const minutes = Math.ceil((RELAUNCH_COOLDOWN - (now - last.at)) / 60_000);
      return {
        ok: false as const,
        errors: { form: `Your last satellite is gone. The pad reopens in ${minutes} min.` },
      };
    }

    const object = tx
      .insert(objects)
      .values({
        kind: "satellite",
        owner: person,
        callsign: input.callsign,
        beacon: input.beacon,
        band: input.band,
        launchedAt: now,
        ...placeInBand(input.band, now),
      })
      .returning(columns)
      .get();
    return { ok: true as const, object };
  });
}

export function skyIsFull(): boolean {
  settleDecay();
  const row = db.select({ n: count() }).from(objects).where(eq(objects.fate, "live")).get();
  return (row?.n ?? 0) >= SKY_CAP;
}

// The live satellite a person owns, if any.
export function liveSatelliteOf(person: string | undefined): SkyObject | undefined {
  if (!person) return undefined;
  settleDecay();
  return db
    .select(columns)
    .from(objects)
    .where(and(eq(objects.owner, person), eq(objects.fate, "live")))
    .get();
}
