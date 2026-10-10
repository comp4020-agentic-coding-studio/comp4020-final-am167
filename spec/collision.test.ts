import { describe, expect, it } from "vitest";
import { FRAGMENTS, HIT, SIZE, fatalMeeting, fragmentsOf, hitDistance, impactOf, nextMeeting } from "../src/lib/collide.ts";
import { angleAt, bandReach, periodAt, radiusAt, reentryAt, burnAt, type Orbit } from "../src/lib/orbit.ts";

// Collisions (ADR 0008). Orbits go either way round, and two objects collide
// when their angles meet while their heights are within the hit distance. The
// meeting is found in closed form, so the server can predict it, and replay
// it after a restart, without stepping through time. Pure maths, so it runs
// without the app.

const TAU = 2 * Math.PI;
const HOUR = 3_600_000;
const orbit = (radius: number, phase: number, direction: 1 | -1 = 1, epoch = 0): Orbit => ({
  radius,
  phase,
  period: periodAt(radius),
  epoch,
  direction,
});
// how far apart two angles are, either way round
const apart = (a: number, b: number) => {
  const d = (((a - b) % TAU) + TAU) % TAU;
  return Math.min(d, TAU - d);
};

describe("orbits going the other way", () => {
  it("a retrograde orbit mirrors a prograde one, at the same height", () => {
    const pro = orbit(1.3, 1);
    const retro = orbit(1.3, 1, -1);
    for (const t of [0, 10_000, 45_000, HOUR, 3 * HOUR]) {
      expect(radiusAt(retro, t)).toBe(radiusAt(pro, t));
      expect(apart(angleAt(retro, t), 2 - angleAt(pro, t))).toBeLessThan(1e-9);
    }
  });

  it("an orbit without a direction is prograde, as every orbit was", () => {
    const { direction: _, ...plain } = orbit(1.7, 0.5);
    expect(angleAt(plain, 30_000)).toBe(angleAt(orbit(1.7, 0.5, 1), 30_000));
  });
});

describe("predicting a meeting", () => {
  it("never for two objects farther apart than the hit distance: the gap only grows", () => {
    const gap = Math.max(HIT.headOn, HIT.lapping) * 1.5;
    expect(nextMeeting(orbit(1.3, 0), orbit(1.3 + gap, 1, -1), 0)).toBeNull();
    expect(nextMeeting(orbit(1.3, 0), orbit(1.3 + gap, 1, 1), 0)).toBeNull();
  });

  it("head-on, within half a lap, where both are at the same angle and close in height", () => {
    const a = orbit(1.3, 0);
    const b = orbit(1.3 + HIT.headOn / 2, 2, -1);
    const at = nextMeeting(a, b, 0)!;
    expect(at).not.toBeNull();
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(periodAt(1.3) / 2 + 1);
    expect(apart(angleAt(a, at), angleAt(b, at))).toBeLessThan(1e-6);
    expect(Math.abs(radiusAt(a, at) - radiusAt(b, at))).toBeLessThan(HIT.headOn);
  });

  it("finds the first meeting, not a later one", () => {
    const a = orbit(1.35, 0.3);
    const b = orbit(1.35 + HIT.headOn / 3, 5, -1);
    const at = nextMeeting(a, b, 0)!;
    // asking again from part-way there gives the same meeting
    expect(nextMeeting(a, b, at / 2)).toBeCloseTo(at, 0);
    // and from just after it, a later one
    expect(nextMeeting(a, b, at + 1)!).toBeGreaterThan(at + 1000);
  });

  it("going the same way, when the lower one laps the higher", () => {
    const a = orbit(1.3, 0);
    // just behind, so the lower one has to gain most of a turn to catch it
    const b = orbit(1.3 + HIT.lapping / 2, -0.5);
    const at = nextMeeting(a, b, 0)!;
    expect(at).not.toBeNull();
    // the lower one is only a little faster: many laps
    expect(at).toBeGreaterThan(5 * periodAt(1.3));
    expect(apart(angleAt(a, at), angleAt(b, at))).toBeLessThan(1e-6);
    expect(Math.abs(radiusAt(a, at) - radiusAt(b, at))).toBeLessThan(HIT.lapping);
  });

  it("never for two going the same way at exactly the same height", () => {
    expect(nextMeeting(orbit(1.3, 0), orbit(1.3, 1), 0)).toBeNull();
  });

  it("never once either has started burning up", () => {
    // same way, so close in height that lapping takes far longer than either lasts
    const a = orbit(1.3, 0);
    const b = orbit(1.3 + 1e-7, 0.5);
    expect(nextMeeting(a, b, 0)).toBeNull();
    // and nothing is predicted for an object already in its plunge
    const falling = orbit(1.3, 0);
    const from = burnAt(falling) + 1;
    expect(nextMeeting(falling, orbit(radiusAt(falling, from), 1, -1, from), from)).toBeNull();
  });

  it("needs debris to pass closer than a satellite: fragments are small", () => {
    const gap = HIT.headOn * 0.8;
    const satellite = { ...orbit(1.3, 0), kind: "satellite" as const };
    const above = { ...orbit(1.3 + gap, 2, -1), kind: "satellite" as const };
    expect(nextMeeting(satellite, above, 0)).not.toBeNull();
    expect(nextMeeting(satellite, { ...above, kind: "debris" }, 0)).toBeNull();
    expect(hitDistance({ ...satellite, kind: "debris" }, { ...above, kind: "debris" })).toBeCloseTo(
      HIT.headOn * SIZE.debris,
      12,
    );
  });

  it("hits at the first meeting when two pass dead centre, and only by chance otherwise", () => {
    const a = { ...orbit(1.3, 0), id: 11 };
    expect(fatalMeeting(a, { ...orbit(1.3, 2, -1), id: 12 })).toBe(1);
    // a pass half the hit distance apart is one chance in many: over ids,
    // the hit is usually not the first meeting
    const draws = Array.from({ length: 50 }, (_, i) =>
      fatalMeeting(a, { ...orbit(1.3 + HIT.headOn / 2, 2, -1), id: 100 + i }),
    );
    expect(draws.filter((n) => n === 1).length).toBeLessThan(10);
  });

  // a close pair isn't doomed: otherwise a satellite with a neighbour in
  // reach, given hours, almost never burns up (ADR 0020)
  it("lets about half of close pairs never collide, the same answer every time, but never a dead-centre pass", () => {
    const a = { ...orbit(1.3, 0), id: 11 };
    const pairs = Array.from({ length: 2000 }, (_, i) => ({ ...orbit(1.3 + HIT.headOn / 2, 2, -1), id: 100 + i }));
    const never = pairs.filter((b) => fatalMeeting(a, b) === null).length / pairs.length;
    expect(never).toBeGreaterThan(0.42);
    expect(never).toBeLessThan(0.58);
    for (const b of pairs.slice(0, 50)) expect(fatalMeeting(b, a)).toBe(fatalMeeting(a, b));
    expect(fatalMeeting(a, { ...orbit(1.3, 2, -1), id: 12 })).toBe(1);
  });

  it("finds a meeting to well under a millisecond, at real clock times", () => {
    const epoch = 1_790_000_000_000;
    const a = orbit(1.3, 0, 1, epoch);
    const b = orbit(1.3 + HIT.headOn / 2, 2, -1, epoch);
    const at = nextMeeting(a, b, epoch)!;
    expect(apart(angleAt(a, at), angleAt(b, at))).toBeLessThan(1e-6);
  });

  it("only from when both exist", () => {
    const a = orbit(1.3, 0);
    // launched an hour later, just above where a has fallen to by then
    const b = orbit(radiusAt(a, HOUR) + HIT.headOn / 2, 2, -1, HOUR);
    const at = nextMeeting(a, b, 0)!;
    expect(at).toBeGreaterThan(HOUR);
  });
});

describe("the wreck", () => {
  const a = { ...orbit(1.3, 0), id: 4 };
  const b = { ...orbit(1.3 + HIT.headOn / 2, 2, -1), id: 9 };
  const at = nextMeeting(a, b, 0)!;
  const impact = impactOf(a, b, at);

  it("happens where they met", () => {
    expect(apart(impact.angle, angleAt(a, at))).toBeLessThan(1e-6);
    expect(impact.radius).toBeGreaterThan(Math.min(radiusAt(a, at), radiusAt(b, at)) - 1e-9);
    expect(impact.radius).toBeLessThan(Math.max(radiusAt(a, at), radiusAt(b, at)) + 1e-9);
  });

  it("makes the same fragments every time, from the two objects", () => {
    const first = fragmentsOf(a, b, at);
    expect(first).toHaveLength(2 * FRAGMENTS.perObject);
    expect(fragmentsOf(b, a, at)).toEqual(first);
  });

  it("starts them at the impact, close to it, with periods for their heights", () => {
    for (const fragment of fragmentsOf(a, b, at)) {
      expect(fragment.epoch).toBe(at);
      expect(Math.abs(fragment.radius - impact.radius)).toBeLessThan(FRAGMENTS.maxSpread + 1e-9);
      expect(apart(fragment.phase, impact.angle)).toBeLessThan(0.2);
      expect(fragment.period).toBe(Math.round(periodAt(fragment.radius)));
      expect(reentryAt(fragment)).toBeGreaterThan(at);
    }
  });

  it("makes none from debris: a fragment that hits something is pulverised", () => {
    const fragment = { ...a, kind: "debris" as const };
    expect(fragmentsOf(fragment, b, at)).toHaveLength(FRAGMENTS.perObject);
    expect(fragmentsOf(fragment, { ...b, kind: "debris" as const }, at)).toHaveLength(0);
  });

  it("sends a head-on wreck both ways", () => {
    const directions = new Set(fragmentsOf(a, b, at).map((f) => f.direction));
    expect(directions).toEqual(new Set([1, -1]));
  });
});

// A collision under the launch bands (the server's staged ones, src/lib/sky.ts)
// keeps its fragments under them, so its debris can't reach anything launched
// since: heights keep their order as everything falls.
describe("a wreck under the launch bands", () => {
  const a = { ...orbit(1.1, 0), id: 4 };
  const b = { ...orbit(1.1, 2, -1), id: 9 };
  const at = nextMeeting(a, b, 0)!;
  const fragments = fragmentsOf(a, b, at);
  const floor = bandReach("low").min;

  it("only falls: no fragment is thrown above the impact", () => {
    const { radius } = impactOf(a, b, at);
    for (const fragment of fragments) expect(fragment.radius).toBeLessThanOrEqual(radius);
  });

  it("throws no fragment within a hit of the lowest launch", () => {
    const sat = { ...orbit(floor, 0), kind: "satellite" as const };
    const reach = Math.max(hitDistance(sat, { ...sat, kind: "debris" }), hitDistance(sat, { ...sat, direction: -1, kind: "debris" }));
    expect(fragments).toHaveLength(2 * FRAGMENTS.perObject);
    for (const fragment of fragments) expect(fragment.radius).toBeLessThanOrEqual(floor - reach);
  });

  it("never meets a satellite launched after it", () => {
    for (const fragment of fragments)
      for (const direction of [1, -1] as const)
        for (let phase = 0; phase < TAU; phase += 0.5) {
          const sat = { ...orbit(floor, phase, direction, at), kind: "satellite" as const };
          expect(nextMeeting(sat, { ...fragment, kind: "debris" }, at)).toBeNull();
        }
  });
});
