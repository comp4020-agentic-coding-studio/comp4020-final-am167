import { describe, expect, it } from "vitest";
import { blame, couplet, headline, skyCount, type StoryParty } from "../src/lib/story.ts";

// How a collision is told on every screen and in the catalogue (ADR 0010):
// both sides named, neither singled out, debris passing the blame back to
// the satellites it came from, and the two beacons side by side. Pure
// wording, so it runs without the app.

let ids = 0;
const satellite = (callsign: string, beacon: string, operator: string | null = null): StoryParty => ({
  id: ++ids,
  kind: "satellite",
  callsign,
  beacon,
  operator,
  from: null,
});
const derelict: StoryParty = { id: 50, kind: "derelict", callsign: null, beacon: null, operator: null, from: null };
const debrisOf = (...roots: StoryParty[]): StoryParty => ({
  id: 99,
  kind: "debris",
  callsign: null,
  beacon: null,
  operator: null,
  from: roots.map(({ id, kind, callsign, operator }) => ({ id, kind, callsign, operator })),
});

const alpha = satellite("ALPHA", "hello from alpha");
const bravo = satellite("BRAVO", "bravo here", "skywriter");
const charlie = satellite("CHARLIE", "minding my business");

describe("telling a collision", () => {
  it("names both sides and blames neither", () => {
    expect(headline([alpha, bravo])).toBe("ALPHA and BRAVO collided");
    expect(headline([alpha, derelict])).toBe("ALPHA and a derelict collided");
  });

  it("passes the blame for debris back to the collision it came from", () => {
    expect(headline([debrisOf(alpha, bravo), charlie])).toBe("Debris from ALPHA and BRAVO's collision destroyed CHARLIE");
    expect(headline([charlie, debrisOf(alpha, derelict)])).toBe(
      "Debris from ALPHA and a derelict's collision destroyed CHARLIE",
    );
    expect(headline([debrisOf(alpha, bravo), debrisOf(charlie, derelict)])).toBe(
      "Debris from ALPHA and BRAVO's collision and debris from CHARLIE and a derelict's collision collided",
    );
  });

  it("names at most three in a cascade's lineage", () => {
    const many = ["A1", "B2", "C3", "D4", "E5"].map((c) => satellite(c, "x"));
    expect(headline([debrisOf(...many), charlie])).toBe(
      "Debris from A1, B2, C3 and 2 others' collision destroyed CHARLIE",
    );
    expect(headline([debrisOf(...many.slice(0, 4)), charlie])).toBe(
      "Debris from A1, B2, C3 and 1 other's collision destroyed CHARLIE",
    );
  });

  it("names who launched what, or says nobody claimed it", () => {
    expect(blame([alpha, bravo])).toBe("ALPHA: launched without a handle. BRAVO: skywriter.");
    expect(blame([debrisOf(alpha, bravo), charlie])).toBe(
      "ALPHA: launched without a handle. BRAVO: skywriter. CHARLIE: launched without a handle.",
    );
    expect(blame([alpha, derelict])).toBe("ALPHA: launched without a handle. The derelict was nobody's.");
    expect(blame([derelict, { ...derelict, id: 51 }])).toBe("The derelicts were nobody's.");
  });

  it("names everyone however their callsign reads: a callsign can't pass for a derelict", () => {
    const sly = satellite("The derelict x", "nothing to see", "griefer");
    const other = satellite("The derelict y", "me neither", "griefer2");
    const line = blame([debrisOf(sly, other), derelict]);
    expect(line).toContain("The derelict x: griefer.");
    expect(line).toContain("The derelict y: griefer2.");
    expect(line).toContain("The derelict was nobody's.");
  });

  it("puts the two beacons side by side, when both had one", () => {
    expect(couplet([alpha, bravo])).toEqual([
      { callsign: "ALPHA", beacon: "hello from alpha" },
      { callsign: "BRAVO", beacon: "bravo here" },
    ]);
    expect(couplet([alpha, derelict])).toEqual([{ callsign: "ALPHA", beacon: "hello from alpha" }]);
  });
});

describe("counting the sky", () => {
  it("counts people's satellites, derelicts and fragments apart", () => {
    const sky = [{ kind: "satellite" }, { kind: "satellite" }, { kind: "derelict" }, { kind: "debris" }] as const;
    expect(skyCount(sky)).toBe("2 satellites, 1 derelict and 1 fragment in orbit");
    expect(skyCount([{ kind: "satellite" }])).toBe("1 satellite in orbit");
    expect(skyCount([])).toBe("Nothing in orbit");
  });
});
