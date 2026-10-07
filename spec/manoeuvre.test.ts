import { describe, expect, it } from "vitest";
import { HIT, nextMeeting } from "../src/lib/collide.ts";
import {
  DECAY,
  MANOEUVRE,
  angleAt,
  bandAt,
  burnAt,
  climb,
  descend,
  periodAt,
  plungeAt,
  positionAt,
  radiusAt,
  reentryAt,
  turnedAt,
  type Orbit,
} from "../src/lib/orbit.ts";

// Bringing a satellite down, or boosting it up a band (ADR 0011). A
// manoeuvre is a new epoch for the orbit, falling (or climbing) at its own
// rate, so positions stay a pure function of the orbit and the clock, and
// collisions are still found in closed form. Pure maths, so it runs without
// the app.

const TAU = 2 * Math.PI;
const T = 1_000_000;
const orbit = (radius: number, phase: number, direction: 1 | -1 = 1, epoch = 0): Orbit => ({
  radius,
  phase,
  period: Math.round(periodAt(radius)),
  epoch,
  direction,
});
const apart = (a: number, b: number) => {
  const d = (((a - b) % TAU) + TAU) % TAU;
  return Math.min(d, TAU - d);
};
const close = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe("bringing a satellite down", () => {
  const before = orbit(1.35, 1, -1);
  const after = descend(before, T);

  it("starts from where it is: no jump", () => {
    expect(close(positionAt(after, T), positionAt(before, T))).toBeLessThan(1e-9);
    expect(after.direction).toBe(-1);
    expect(after.epoch).toBe(T);
  });

  it("falls to the top of the atmosphere in the descent time, then burns up as anything does", () => {
    expect(burnAt(after)).toBeCloseTo(T + MANOEUVRE.descentMs, -1);
    expect(reentryAt(after)).toBeCloseTo(T + MANOEUVRE.descentMs + DECAY.plungeMs, -1);
    expect(plungeAt(after, T + MANOEUVRE.descentMs + 1_000)).not.toBeNull();
  });

  it("comes down steadily, never up", () => {
    let last = Infinity;
    for (let t = T; t <= burnAt(after); t += 5_000) {
      const r = radiusAt(after, t);
      expect(r).toBeLessThan(last);
      last = r;
    }
  });

  it("takes the same two minutes from the high band", () => {
    const high = descend(orbit(2.5, 0), T);
    expect(burnAt(high)).toBeCloseTo(T + MANOEUVRE.descentMs, -1);
  });

  it("keeps a whole number of milliseconds for its period, as the database does", () => {
    expect(Number.isInteger(after.period)).toBe(true);
  });
});

describe("boosting a satellite up a band", () => {
  const before = orbit(1.3, 2);
  const target = 1.75;
  const after = climb(before, T, target);

  it("starts from where it is: no jump", () => {
    expect(close(positionAt(after, T), positionAt(before, T))).toBeLessThan(1e-9);
  });

  it("climbs steadily to the height it was sent to, in the climb time", () => {
    let last = 0;
    for (let t = T; t <= T + MANOEUVRE.climbMs; t += 5_000) {
      const r = radiusAt(after, t);
      expect(r).toBeGreaterThan(last);
      last = r;
    }
    expect(radiusAt(after, T + MANOEUVRE.climbMs)).toBeCloseTo(target, 6);
    expect(bandAt(radiusAt(after, T + MANOEUVRE.climbMs))).toBe("mid");
  });

  it("then falls by drag alone, like an orbit launched at that height", () => {
    const end = T + MANOEUVRE.climbMs;
    const plain = orbit(target, 0, 1, end);
    const later = end + 3_600_000;
    expect(radiusAt(after, later)).toBeCloseTo(radiusAt(plain, later), 6);
    expect(reentryAt(after)).toBeCloseTo(reentryAt(plain), -2);
  });

  it("goes round without a jump when the climb ends", () => {
    const end = T + MANOEUVRE.climbMs;
    expect(Math.abs(turnedAt(after, end + 1) - turnedAt(after, end - 1))).toBeLessThan(0.001);
    expect(close(positionAt(after, end + 1), positionAt(after, end - 1))).toBeLessThan(0.001);
  });

  it("stays up far longer than it would have", () => {
    expect(reentryAt(after) - reentryAt(before)).toBeGreaterThan(5 * 3_600_000);
  });

  it("can be brought down halfway through the climb", () => {
    const mid = T + MANOEUVRE.climbMs / 2;
    const down = descend(after, mid);
    expect(close(positionAt(down, mid), positionAt(after, mid))).toBeLessThan(1e-9);
    expect(burnAt(down)).toBeCloseTo(mid + MANOEUVRE.descentMs, -1);
  });
});

describe("meeting something on the way", () => {
  // a satellite brought down from the low band's top passes the height of
  // one lower down; arrange the angles so they're together when it does
  const falling = descend(orbit(1.42, 0, 1), T);
  const height = 1.25;
  const below = orbit(height, 0, -1);
  // when the falling one passes the lower one's height (radius³ falls steadily)
  let lo = T;
  let hi = burnAt(falling);
  while (hi - lo > 1) {
    const mid = (lo + hi) / 2;
    if (radiusAt(falling, mid) > radiusAt(below, mid)) lo = mid;
    else hi = mid;
  }
  const crossing = hi;
  // the lower one's phase, so it's at the falling one's angle at the crossing
  const aligned = { ...below, phase: below.phase + (angleAt(falling, crossing) - angleAt(below, crossing)) };

  it("never meets two objects farther apart than the hit distance when neither manoeuvres", () => {
    expect(nextMeeting(orbit(1.42, 0, 1), orbit(height, 0, -1), T)).toBeNull();
  });

  it("finds the meeting as the falling one passes the other's height", () => {
    const at = nextMeeting(falling, aligned, T);
    expect(at).not.toBeNull();
    expect(Math.abs(at! - crossing)).toBeLessThan(10_000);
    expect(Math.abs(radiusAt(falling, at!) - radiusAt(aligned, at!))).toBeLessThan(HIT.headOn);
    expect(apart(angleAt(falling, at!), angleAt(aligned, at!))).toBeLessThan(1e-4);
  });

  it("finds none when they pass each other's height half a lap apart", () => {
    const opposite = { ...aligned, phase: aligned.phase + Math.PI };
    expect(nextMeeting(falling, opposite, T)).toBeNull();
  });

  it("finds a climbing satellite's meeting in the band it climbs into", () => {
    const climbing = climb(orbit(1.3, 0, 1), T, 1.8);
    const there = orbit(1.6, 0, -1);
    let lo2 = T;
    let hi2 = T + MANOEUVRE.climbMs;
    while (hi2 - lo2 > 1) {
      const mid = (lo2 + hi2) / 2;
      if (radiusAt(climbing, mid) < radiusAt(there, mid)) lo2 = mid;
      else hi2 = mid;
    }
    const met = { ...there, phase: there.phase + (angleAt(climbing, hi2) - angleAt(there, hi2)) };
    const at = nextMeeting(climbing, met, T);
    expect(at).not.toBeNull();
    expect(Math.abs(radiusAt(climbing, at!) - radiusAt(met, at!))).toBeLessThan(HIT.headOn);
    expect(apart(angleAt(climbing, at!), angleAt(met, at!))).toBeLessThan(1e-4);
  });

  it("finds meetings after a climb as it would for any orbit at that height", () => {
    const climbing = climb(orbit(1.3, 0, 1), T, 1.8);
    const end = T + MANOEUVRE.climbMs;
    const settled = { ...orbit(radiusAt(climbing, end), angleAt(climbing, end), 1, end) };
    const neighbour = orbit(radiusAt(climbing, end) + 0.005, 1, -1, end);
    const a = nextMeeting(climbing, neighbour, end);
    const b = nextMeeting({ ...settled, period: periodAt(settled.radius) }, neighbour, end);
    expect(a).not.toBeNull();
    expect(Math.abs(a! - b!)).toBeLessThan(2_000);
  });
});
