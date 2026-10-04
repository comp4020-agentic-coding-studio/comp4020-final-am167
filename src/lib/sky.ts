import { and, count, eq, max, ne } from "drizzle-orm";
import { db, schema } from "../db/index.ts";
import { publish } from "./events.ts";
import type { LaunchErrors, LaunchInput } from "./launch.ts";
import { placeInBand, type Band, type Orbit } from "./orbit.ts";

const { objects } = schema;

// After your satellite leaves the sky, how long before you can launch again
// (PLAN.md, "Launch limits"). Only bites once satellites can die, in C9.
export const RELAUNCH_COOLDOWN = 10 * 60_000;

// The most satellites the sky holds at once (PLAN.md, "Launch limits"). In
// C8 nothing comes down, so this is what stops the sky, and the 256 MB
// machine holding it, growing for ever. SKY_CAP overrides it for testing.
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

export function liveSky(): SkyObject[] {
  return db.select(columns).from(objects).where(eq(objects.fate, "live")).orderBy(objects.id).all();
}

type LaunchResult = { ok: true; object: SkyObject } | { ok: false; errors: LaunchErrors };

const ALREADY_UP = (callsign: string | null) => ({
  ok: false as const,
  errors: { form: `${callsign ?? "Your satellite"} is already in orbit. One live satellite each.` },
});

export function launch(person: string, input: LaunchInput, now = Date.now()): LaunchResult {
  let result: LaunchResult;
  try {
    result = checkAndInsert(person, input, now);
  } catch (error) {
    // the database's own one-live rule (schema.ts) caught what the check missed
    if ((error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") return ALREADY_UP(null);
    throw error;
  }
  if (result.ok) publish({ type: "launch", object: result.object });
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
  const row = db.select({ n: count() }).from(objects).where(eq(objects.fate, "live")).get();
  return (row?.n ?? 0) >= SKY_CAP;
}

// The live satellite a person owns, if any.
export function liveSatelliteOf(person: string | undefined): SkyObject | undefined {
  if (!person) return undefined;
  return db
    .select(columns)
    .from(objects)
    .where(and(eq(objects.owner, person), eq(objects.fate, "live")))
    .get();
}
