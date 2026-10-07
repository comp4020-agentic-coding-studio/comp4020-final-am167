import { describe, expect, it } from "vitest";
import {
  BANDS,
  DECAY,
  angleAt,
  bandAt,
  bandReach,
  burnAt,
  fallRate,
  heightKm,
  lifetime,
  lifetimeRange,
  periodAt,
  periodNow,
  placeInBand,
  plungeAt,
  radiusAt,
  reentryAt,
  type Band,
  type Orbit,
} from "../src/lib/orbit.ts";

// Orbital decay (ADR 0007). Everything in the sky slowly falls, faster the
// lower it is, until it meets the atmosphere and burns up in a short plunge.
// Positions stay a pure function of the stored orbit and the time, so every
// session, and the server, agree on where a falling object is and when it's
// gone. Pure maths, so it runs without the app.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const TAU = 2 * Math.PI;
const bands = Object.keys(BANDS) as Band[];
const middle = (band: Band) => (BANDS[band].minRadius + BANDS[band].maxRadius) / 2;
const orbitAt = (radius: number, epoch = 0): Orbit => ({ radius, phase: 1, period: periodAt(radius), epoch });

// the angle swept between two times, unwrapped
function swept(orbit: Orbit, from: number, to: number, steps = 2000): number {
  let total = 0;
  let last = angleAt(orbit, from);
  for (let i = 1; i <= steps; i++) {
    const next = angleAt(orbit, from + ((to - from) * i) / steps);
    total += (((next - last) % TAU) + TAU) % TAU;
    last = next;
  }
  return total;
}

describe("orbital decay", () => {
  it("starts from the stored orbit, so nothing jumps when decay arrives", () => {
    const orbit = { radius: 1.75, phase: 2, period: 180_000, epoch: 5_000 };
    expect(radiusAt(orbit, orbit.epoch)).toBe(orbit.radius);
    expect(angleAt(orbit, orbit.epoch)).toBeCloseTo(orbit.phase, 12);
  });

  it("only ever brings an orbit down, until it burns up", () => {
    for (const band of bands) {
      const orbit = orbitAt(middle(band));
      const end = reentryAt(orbit);
      let last = Infinity;
      for (let i = 0; i <= 400; i++) {
        const r = radiusAt(orbit, (end * i) / 400);
        expect(r).toBeLessThanOrEqual(last);
        last = r;
      }
      expect(radiusAt(orbit, end)).toBeCloseTo(DECAY.endRadius, 9);
    }
  });

  it("clears the low band in hours, the mid in about a day, the high in a few days at most", () => {
    expect(lifetime("low")).toBeGreaterThan(3 * HOUR);
    expect(lifetime("low")).toBeLessThan(5 * HOUR);
    expect(lifetime("mid")).toBeGreaterThan(12 * HOUR);
    expect(lifetime("mid")).toBeLessThan(DAY);
    expect(lifetime("high")).toBeGreaterThan(1.5 * DAY);
    expect(lifetime("high")).toBeLessThan(3 * DAY);
    // even the highest launch is down within a few days
    expect(lifetimeRange("high").longest).toBeLessThan(3.5 * DAY);
    // and the lowest still gets more than an hour
    expect(lifetimeRange("low").shortest).toBeGreaterThan(HOUR);
  });

  it("falls slowly at first and faster as the air thickens", () => {
    const orbit = orbitAt(middle("low"));
    const burn = burnAt(orbit);
    const step = 10 * 60_000;
    const first = orbit.radius - radiusAt(orbit, step);
    const last = radiusAt(orbit, burn - step) - radiusAt(orbit, burn);
    expect(last).toBeGreaterThan(first * 1.3);
  });

  it("goes round faster as it falls", () => {
    const orbit = orbitAt(middle("high"));
    const quarter = (reentryAt(orbit) - orbit.epoch) / 4;
    const early = swept(orbit, 0, HOUR);
    const late = swept(orbit, 3 * quarter, 3 * quarter + HOUR);
    expect(late).toBeGreaterThan(early * 1.2);
  });

  it("moves smoothly through the start of the plunge, with no jump", () => {
    const orbit = orbitAt(middle("low"));
    const burn = burnAt(orbit);
    const step = 20;
    const before = swept(orbit, burn - step, burn, 4);
    const after = swept(orbit, burn, burn + step, 4);
    expect(after / before).toBeGreaterThan(0.95);
    expect(after / before).toBeLessThan(1.05);
    // under a pixel, even close up over a station
    expect(Math.abs(radiusAt(orbit, burn + step) - radiusAt(orbit, burn - step))).toBeLessThan(1e-3);
  });

  it("burns up in a plunge of a fixed length, slowing as it does", () => {
    const orbit = orbitAt(middle("mid"));
    const burn = burnAt(orbit);
    expect(reentryAt(orbit) - burn).toBe(DECAY.plungeMs);
    expect(radiusAt(orbit, burn)).toBeCloseTo(DECAY.burnRadius, 9);
    expect(plungeAt(orbit, burn - 1)).toBeNull();
    expect(plungeAt(orbit, burn + DECAY.plungeMs / 2)).toBeCloseTo(0.5, 9);
    expect(plungeAt(orbit, reentryAt(orbit) + 1)).toBeNull();
    const D = DECAY.plungeMs;
    const fast = swept(orbit, burn, burn + D / 10, 50);
    const slow = swept(orbit, burn + (D * 8) / 10, burn + (D * 9) / 10, 50);
    expect(slow).toBeLessThan(fast / 4);
  });

  it("puts an orbit launched below the top of the atmosphere straight into its plunge", () => {
    const orbit = orbitAt(DECAY.burnRadius - 0.01, 100);
    expect(burnAt(orbit)).toBe(100);
    expect(reentryAt(orbit)).toBe(100 + DECAY.plungeMs);
  });

  it("spans each band's lifetimes from the bottom of its reach to the top", () => {
    for (const band of bands) {
      const { min, max } = bandReach(band);
      const range = lifetimeRange(band);
      expect(range.shortest).toBe(reentryAt(orbitAt(min)));
      expect(range.longest).toBe(reentryAt(orbitAt(max)));
      expect(range.shortest).toBeLessThan(lifetime(band));
      expect(range.longest).toBeGreaterThan(lifetime(band));
    }
  });

  it("never slows an orbit that starts below the top of the atmosphere", () => {
    const orbit = orbitAt(DECAY.burnRadius - 0.02, 0);
    expect(periodNow(orbit, DECAY.plungeMs / 2)).toBeLessThanOrEqual(orbit.period);
  });

  it("gives every launch a lifetime that grows with its height", () => {
    let random = 0.3;
    const next = () => (random = (random * 9301 + 49297) % 233280 / 233280);
    for (const band of bands) {
      const orbits = Array.from({ length: 200 }, () => placeInBand(band, 0, next)).sort((a, b) => a.radius - b.radius);
      for (let i = 1; i < orbits.length; i++) expect(reentryAt(orbits[i])).toBeGreaterThanOrEqual(reentryAt(orbits[i - 1]));
    }
  });
});

describe("bands are ranges of height", () => {
  it("has one period for each height, whichever band an object was launched into", () => {
    const random = () => 0.5;
    for (const band of bands) {
      const orbit = placeInBand(band, 0, random);
      expect(orbit.period).toBe(Math.round(periodAt(orbit.radius)));
    }
    expect(periodAt(middle("low"))).toBeCloseTo(BANDS.low.period, -3);
    expect(periodAt(middle("high"))).toBeCloseTo(BANDS.high.period, -3);
  });

  it("comes round slowly enough to read a beacon: low every 3 minutes, high every 24 (ADR 0012)", () => {
    const MINUTE = 60_000;
    expect(periodAt(middle("low"))).toBeCloseTo(3 * MINUTE, -2);
    expect(periodAt(middle("high"))).toBeCloseTo(24 * MINUTE, -2);
    expect(periodAt(middle("mid")) / MINUTE).toBeGreaterThan(7.5);
    expect(periodAt(middle("mid")) / MINUTE).toBeLessThan(8.5);
  });

  it("covers every height from the ground up, low to high, with no gaps", () => {
    expect(bandAt(1)).toBe("low");
    expect(bandAt(10)).toBe("high");
    let last = 0;
    for (let r = 1; r < 3; r += 0.001) {
      const i = bands.indexOf(bandAt(r));
      expect(i).toBeGreaterThanOrEqual(last);
      last = i;
    }
  });

  it("places every launch in the range of the band it was launched into", () => {
    for (const band of bands) {
      const { min, max } = bandReach(band);
      expect(bandAt(min)).toBe(band);
      expect(bandAt(max)).toBe(band);
    }
  });

  it("lets a falling object drift down through the bands below", () => {
    const orbit = orbitAt(middle("high"));
    const seen = new Set<Band>();
    const end = reentryAt(orbit);
    for (let i = 0; i <= 200; i++) seen.add(bandAt(radiusAt(orbit, (end * i) / 200)));
    expect([...seen]).toEqual(["high", "mid", "low"]);
  });
});

describe("heights in kilometres", () => {
  it("puts the top of the atmosphere where real re-entries begin, and the low band in low orbit", () => {
    expect(heightKm(DECAY.burnRadius)).toBeCloseTo(120, 6);
    expect(heightKm(1)).toBe(0);
    expect(heightKm(BANDS.low.minRadius)).toBeGreaterThanOrEqual(300);
    expect(heightKm(BANDS.low.maxRadius)).toBeLessThanOrEqual(1000);
  });

  it("says how fast an orbit is falling, faster the lower it is", () => {
    const low = orbitAt(middle("low"));
    const high = orbitAt(middle("high"));
    expect(fallRate(low, 0)).toBeGreaterThan(0);
    expect(fallRate(low, 0)).toBeGreaterThan(fallRate(high, 0) * 2);
    const later = burnAt(low) - HOUR;
    expect(fallRate(low, later)).toBeGreaterThan(fallRate(low, 0));
  });
});
