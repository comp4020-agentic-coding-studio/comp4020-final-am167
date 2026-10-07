import { describe, expect, it } from "vitest";
import { TURN, turnAt, turnLength } from "../src/lib/airtime.ts";

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
