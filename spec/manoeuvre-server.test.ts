import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { HIT, fatalMeeting, nextMeeting } from "../src/lib/collide.ts";
import { MANOEUVRE, DECAY, bandAt, periodAt, radiusAt, reentryAt } from "../src/lib/orbit.ts";
import type { SkyEvent } from "../src/lib/events.ts";

// The server's side of deorbiting and boosting (ADR 0011): only the owner
// can, the orbit changes from that moment, everyone is told, a satellite
// brought down ends as `deorbited`, a boost uses the satellite's one tank of
// fuel, and the collisions coming are worked out again. Driven against
// throwaway databases with the clock passed in, as the collision tests are.

process.env.DERELICTS = "0";
// nor the resident operators' launches (ADR 0015), which have their own tests
process.env.RESIDENTS_PER_HOUR = "0";

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

async function freshServer() {
  const dir = mkdtempSync(join(tmpdir(), "kessler-manoeuvre-"));
  dirs.push(dir);
  process.env.DATABASE_PATH = join(dir, "app.db");
  execFileSync(process.execPath, ["scripts/migrate.mjs"], { env: process.env });
  vi.resetModules();
  const sky = await import("../src/lib/sky.ts");
  const events = await import("../src/lib/events.ts");
  const { db, schema } = await import("../src/db/index.ts");
  const heard: SkyEvent[] = [];
  events.subscribe((event) => heard.push(event));
  // a satellite on a chosen orbit, as if launched (a launch's orbit is random)
  const put = (owner: string, radius: number, phase: number, direction: 1 | -1, epoch = T) => {
    const row = db
      .insert(schema.objects)
      .values({
        kind: "satellite",
        owner,
        callsign: `SAT-${owner}`,
        beacon: `${owner} up here`,
        band: bandAt(radius),
        launchedAt: epoch,
        radius,
        phase,
        period: Math.round(periodAt(radius)),
        epoch,
        direction,
      })
      .returning()
      .get();
    return { ...row, kind: "satellite" as const, direction };
  };
  return { sky, heard, db, schema, put };
}

const HOUR = 3_600_000;
// in the future, so the server's own wake-up timers never fire mid-test
const T = Date.now() + 10 * 24 * HOUR;

describe("bringing a satellite down", async () => {
  const { sky, heard, put } = await freshServer();
  const sat = put("alice", 1.35, 1, 1);

  it("is refused to anyone but its owner", () => {
    const result = sky.deorbit("mallory", sat.id, T + 1_000);
    expect(result).toMatchObject({ ok: false });
    expect(sky.liveSky(T + 1_000).find((o) => o.id === sat.id)).toMatchObject({ epoch: T, rate: 1 });
  });

  it("starts a gradual descent from where it is, and tells everyone", () => {
    const at = T + 2_000;
    const result = sky.deorbit("alice", sat.id, at);
    if (!result.ok) throw new Error(result.error);
    expect(result.object).toMatchObject({ id: sat.id, epoch: at, deorbitedAt: at });
    expect(radiusAt(result.object, at)).toBeCloseTo(radiusAt(sat, at), 9);
    expect(reentryAt(result.object)).toBeCloseTo(at + MANOEUVRE.descentMs + DECAY.plungeMs, -1);
    const event = heard.find((e) => e.type === "manoeuvre");
    expect(event).toMatchObject({ type: "manoeuvre", manoeuvre: "deorbit", object: { id: sat.id, epoch: at } });
  });

  it("can't be done twice, or boosted on the way down", () => {
    expect(sky.deorbit("alice", sat.id, T + 3_000)).toMatchObject({ ok: false });
    expect(sky.boost("alice", sat.id, T + 3_000)).toMatchObject({ ok: false });
  });

  it("ends as deorbited, not decayed, when it has burned up", () => {
    const gone = T + 2_000 + MANOEUVRE.descentMs + DECAY.plungeMs;
    sky.settle(gone + 1_000);
    const row = sky.catalogue("all", "alice").find((o) => o.id === sat.id)!;
    expect(row.fate).toBe("deorbited");
    expect(Math.abs(row.fateAt! - gone)).toBeLessThan(1_000);
  });

  it("is kept in the record of manoeuvres", () => {
    expect(sky.manoeuvresOf(sat.id)).toEqual([
      expect.objectContaining({ object: sat.id, kind: "deorbit", at: T + 2_000 }),
    ]);
  });
});

describe("boosting a satellite", async () => {
  const { sky, heard, put } = await freshServer();
  const low = put("bob", 1.3, 0, 1);
  const high = put("bob", 2.4, 2, -1);

  it("climbs it into the next band up, and it stays up longer", () => {
    const at = T + 1_000;
    const result = sky.boost("bob", low.id, at, () => 0.5);
    if (!result.ok) throw new Error(result.error);
    const done = at + MANOEUVRE.climbMs;
    expect(bandAt(radiusAt(result.object, done))).toBe("mid");
    expect(reentryAt(result.object)).toBeGreaterThan(reentryAt(low) + 5 * HOUR);
    expect(result.object.boosts).toBe(1);
    expect(heard.find((e) => e.type === "manoeuvre")).toMatchObject({ manoeuvre: "boost", object: { id: low.id } });
  });

  it("has fuel for one boost only", () => {
    const after = T + 2_000 + MANOEUVRE.climbMs;
    expect(sky.boost("bob", low.id, after)).toMatchObject({ ok: false });
  });

  it("can't go higher than the high band", () => {
    expect(sky.boost("bob", high.id, T + 1_000)).toMatchObject({ ok: false });
  });

  it("is refused to anyone but its owner", () => {
    const other = put("carol", 1.25, 3, 1);
    expect(sky.boost("bob", other.id, T + 1_000)).toMatchObject({ ok: false });
  });

  it("can still bring a boosted satellite down", () => {
    const result = sky.deorbit("bob", low.id, T + 30_000);
    expect(result.ok).toBe(true);
  });
});

describe("a manoeuvre and the collisions coming", async () => {
  const { sky, heard, put } = await freshServer();
  const a = put("dave", 1.3, 0, 1);
  const b = put("erin", 1.3 + HIT.headOn / 2, 2, -1);
  const at = Math.round(nextMeeting(a, b, T, fatalMeeting(a, b))!);

  it("calls off a collision its old orbit was heading for, and tells everyone", () => {
    expect(sky.conjunctions(T).map((c) => [c.a, c.b, c.at])).toEqual([[a.id, b.id, at]]);
    const result = sky.boost("dave", a.id, T + 1_000, () => 0.5);
    expect(result.ok).toBe(true);
    expect(sky.conjunctions(T + 1_000).some((c) => c.a === a.id && c.at === at)).toBe(false);
    expect(heard.some((e) => e.type === "manoeuvre")).toBe(true);
    sky.settle(at + 1);
    expect(sky.collisionLog()).toHaveLength(0);
  });
});

describe("a server stopped mid-descent", () => {
  it("still marks it deorbited when it catches up", async () => {
    const first = await freshServer();
    const sat = first.put("frank", 1.3, 0, 1);
    expect(first.sky.deorbit("frank", sat.id, T + 1_000).ok).toBe(true);
    // the same database, a new server
    vi.resetModules();
    const sky = await import("../src/lib/sky.ts");
    sky.settle(T + 1_000 + MANOEUVRE.descentMs + DECAY.plungeMs + 1_000);
    expect(sky.catalogue("all", "frank").find((o) => o.id === sat.id)?.fate).toBe("deorbited");
  });
});
