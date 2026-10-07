import { describe, expect, it } from "vitest";
import { TURN, onAir, turnAt, turnLength } from "../src/lib/airtime.ts";

// Taking turns at a station (ADR 0016): when more than one beacon is
// overhead, each holds the station long enough to read it, a longer line a
// longer turn, round and round by the server's clock, so every screen shows
// the same one at the same moment.

describe("a turn at a station", () => {
  it("is long enough to read, longer for a longer line, within bounds", () => {
    expect(turnLength("hi")).toBe(TURN.min);
    expect(turnLength("x".repeat(60))).toBeGreaterThan(turnLength("x".repeat(20)));
    expect(turnLength("x".repeat(140))).toBeLessThanOrEqual(TURN.max);
    expect(turnLength("x".repeat(140))).toBeGreaterThan(8000);
  });

  it("goes round in order, each for its own length", () => {
    const lengths = [4000, 10000, 6000];
    expect(turnAt(lengths, 0)).toBe(0);
    expect(turnAt(lengths, 3999)).toBe(0);
    expect(turnAt(lengths, 4000)).toBe(1);
    expect(turnAt(lengths, 13999)).toBe(1);
    expect(turnAt(lengths, 14000)).toBe(2);
    expect(turnAt(lengths, 20000)).toBe(0);
    // the same moment on any screen is the same turn
    const t = 1_791_373_940_780;
    expect(turnAt(lengths, t)).toBe(turnAt([...lengths], t));
  });

  it("is the only one's when there's one", () => {
    expect(turnAt([7000], 123_456)).toBe(0);
  });
});

// Who is on air (review, 2026-10-07): each beacon overhead takes its own
// turn, and all the static overhead shares one, so a cascade's fragments
// can crowd a station but never drown it.
describe("who is on air at a station", () => {
  const beacon = (id: number, text = "a line") => ({ id, text, static: false });
  const fragment = (id: number) => ({ id, text: "pieces … of two lines", static: true });

  it("is nobody when nothing is overhead", () => {
    expect(onAir([], 1234)).toBeNull();
  });

  it("is each beacon in turn, by id, whatever order they're given in", () => {
    const heard = new Set<number>();
    for (let t = 0; t < 60_000; t += 500) heard.add(onAir([beacon(3), beacon(1), beacon(2)], t)!.speaker.id);
    expect([...heard].sort()).toEqual([1, 2, 3]);
    expect(onAir([beacon(2), beacon(1)], 0)!.speaker.id).toBe(1);
  });

  it("gives all the static one turn between them, so beacons still get through", () => {
    const overhead = [beacon(1), ...[10, 11, 12, 13, 14, 15].map(fragment)];
    let beaconTime = 0;
    let staticTime = 0;
    for (let t = 0; t < 600_000; t += 100) {
      const now = onAir(overhead, t)!;
      expect(now.of).toBe(2);
      if (now.speaker.static) staticTime += 100;
      else beaconTime += 100;
    }
    // one beacon and one shared slot of static: about half each
    expect(beaconTime / (beaconTime + staticTime)).toBeGreaterThan(0.4);
    // and every fragment gets a go in time
    const heard = new Set<number>();
    for (let t = 0; t < 600_000; t += 500) {
      const now = onAir(overhead, t)!;
      if (now.speaker.static) heard.add(now.speaker.id);
    }
    expect(heard.size).toBe(6);
  });

  it("is the static alone when no beacon is overhead", () => {
    expect(onAir([fragment(4), fragment(9)], 777)!.speaker.static).toBe(true);
  });
});
