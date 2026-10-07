import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DECAY, MANOEUVRE, angleAt, burnAt, climb, descend, periodAt, radiusAt, reentryAt, type Orbit } from "../src/lib/orbit.ts";

// Slower orbits (ADR 0013): orbits launched under the old, three-times-faster
// period law are retimed once, in place, the first time the server settles
// the sky. Nothing jumps, and a second settle changes nothing. Drives the
// server's own code against a throwaway database, with the clock passed in.

process.env.DERELICTS = "0";
// nor the resident operators' launches (ADR 0015), which have their own tests
process.env.RESIDENTS = "0";
const dir = mkdtempSync(join(tmpdir(), "kessler-retime-"));
process.env.DATABASE_PATH = join(dir, "app.db");
execFileSync(process.execPath, ["scripts/migrate.mjs"], { env: process.env });

type Sky = typeof import("../src/lib/sky.ts");
type Db = typeof import("../src/db/index.ts");
let sky: Sky;
let db: Db["db"];
let schema: Db["schema"];

beforeAll(async () => {
  sky = await import("../src/lib/sky.ts");
  ({ db, schema } = await import("../src/db/index.ts"));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const HOUR = 3_600_000;
// in the future, so the server's own wake-up timers never fire mid-test
const T = Date.now() + 10 * 24 * HOUR;
const LAUNCHED = T - HOUR;

// an orbit as the old law launched it: a third of today's period
const old = (radius: number, phase: number, direction: 1 | -1 = 1): Orbit & { direction: 1 | -1 } => ({
  radius,
  phase,
  period: Math.round(periodAt(radius) / 3),
  epoch: LAUNCHED,
  direction,
});

function insert(kind: "satellite" | "debris", orbit: Orbit & { direction: 1 | -1 }) {
  return db
    .insert(schema.objects)
    .values({ kind, band: "mid", launchedAt: orbit.epoch, callsign: kind === "satellite" ? "OLDTIMER" : null, ...orbit })
    .returning({ id: schema.objects.id })
    .get().id;
}
const row = (id: number) => db.select().from(schema.objects).all().find((o) => o.id === id)!;

describe("retiming orbits launched under the old period law", () => {
  let fast: number;
  let backwards: number;
  let plunging: number;
  let modern: number;
  let climbing: number;
  let climbed: number;
  let descending: number;
  let future: number;
  const fastOrbit = old(1.75, 1);
  // a boost still climbing at T, one that finished climbing before T, and
  // one being brought down (ADR 0011), all under the old law
  const climbingOrbit = climb(old(1.35, 2), T - 30_000, 1.75);
  const climbedOrbit = climb(old(1.35, 5), T - 10 * 60_000, 1.75);
  const descendingOrbit = descend(old(1.8, 0.5), T - 30_000);
  // launched after T (as far as this settle knows)
  const futureOrbit = { ...old(1.75, 6), epoch: T + HOUR };
  const backOrbit = old(2.3, 4, -1);
  // launched so it is in its last plunge at T
  const plungeOrbit = { ...old(DECAY.burnRadius, 2), epoch: T - DECAY.plungeMs / 2 };
  const modernOrbit = { ...old(1.3, 3), period: Math.round(periodAt(1.3)) };

  beforeAll(() => {
    fast = insert("satellite", fastOrbit);
    backwards = insert("debris", backOrbit);
    plunging = insert("satellite", plungeOrbit);
    modern = insert("satellite", modernOrbit);
    climbing = insert("satellite", climbingOrbit);
    climbed = insert("satellite", climbedOrbit);
    descending = insert("satellite", descendingOrbit);
    future = insert("satellite", futureOrbit);
    expect(climbingOrbit.until).toBeGreaterThan(T);
    expect(climbedOrbit.until).toBeLessThan(T);
    expect(burnAt(plungeOrbit)).toBeLessThan(T);
    expect(reentryAt(plungeOrbit)).toBeGreaterThan(T);
  });

  it("gives each a new epoch, now, at the new period for where it is, so nothing jumps", () => {
    sky.settle(T);
    for (const [id, before] of [
      [fast, fastOrbit],
      [backwards, backOrbit],
    ] as const) {
      const after = row(id);
      expect(after.epoch).toBe(T);
      expect(after.radius).toBeCloseTo(radiusAt(before, T), 9);
      expect(after.phase).toBeCloseTo(angleAt(before, T), 9);
      expect(after.period).toBe(Math.round(periodAt(after.radius)));
      expect(after.direction).toBe(before.direction);
      // and it carries on falling to the same burn-up
      expect(reentryAt(after as Orbit)).toBeCloseTo(reentryAt(before), -1);
    }
  });

  it("keeps a manoeuvre going: a climb still climbs to the same height, one that's over just falls, a descent comes down at the same moment", () => {
    const now = (id: number) => {
      const r = row(id);
      return { ...r, direction: r.direction === -1 ? -1 : 1 } as Orbit;
    };
    // still climbing: the same rate and end, and the same height after it
    const up = now(climbing);
    expect(up.epoch).toBe(T);
    expect(up.until).toBe(climbingOrbit.until);
    expect(up.rate).toBe(climbingOrbit.rate);
    expect(up.period).toBe(Math.round(periodAt(up.radius)));
    expect(radiusAt(up, climbingOrbit.until! + 60_000)).toBeCloseTo(radiusAt(climbingOrbit, climbingOrbit.until! + 60_000), 6);
    expect(reentryAt(up)).toBeCloseTo(reentryAt(climbingOrbit), -2);
    // the climb ended before T: from here it falls by drag alone
    const over = now(climbed);
    expect(over).toMatchObject({ epoch: T, rate: 1, until: null });
    expect(over.radius).toBeCloseTo(radiusAt(climbedOrbit, T), 9);
    expect(reentryAt(over)).toBeCloseTo(reentryAt(climbedOrbit), -2);
    // brought down: burns up when it would have
    const down = now(descending);
    expect(down.epoch).toBe(T);
    expect(down.rate).toBe(descendingOrbit.rate);
    expect(reentryAt(down)).toBeCloseTo(reentryAt(descendingOrbit), -2);
    expect(reentryAt(down) - T).toBeLessThan(MANOEUVRE.descentMs + DECAY.plungeMs);
  });

  it("leaves alone anything already on the new law, or burning up, or not up yet", () => {
    expect(row(future)).toMatchObject({ epoch: futureOrbit.epoch, period: futureOrbit.period });
    expect(row(modern)).toMatchObject({ epoch: LAUNCHED, period: modernOrbit.period });
    expect(row(plunging)).toMatchObject({ epoch: plungeOrbit.epoch, period: plungeOrbit.period });
  });

  it("does nothing the second time", () => {
    const before = db.select().from(schema.objects).all();
    sky.retime(T + 60_000);
    expect(db.select().from(schema.objects).all()).toEqual(before);
  });
});
