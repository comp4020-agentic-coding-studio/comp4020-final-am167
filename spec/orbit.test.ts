import { describe, expect, it } from "vitest";
import { BANDS, bandReach, placeInBand, type Band } from "../src/lib/orbit.ts";

// Where a launch lands in its band. The bands have soft edges: most
// satellites land well inside the band you chose, some stray past its edges,
// but none crosses into a neighbouring band. Pure maths, so it runs without
// the app.

// a repeatable stand-in for Math.random
function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const bands = Object.keys(BANDS) as Band[];
const draws = (band: Band, n = 2000) => {
  const random = seeded(bands.indexOf(band) + 7);
  return Array.from({ length: n }, () => placeInBand(band, 0, random).radius);
};

describe("launching into a band", () => {
  for (const band of bands) {
    const { minRadius, maxRadius } = BANDS[band];

    it(`${band}: mostly lands inside the band, and some past its edges`, () => {
      const radii = draws(band);
      const inside = radii.filter((r) => r >= minRadius && r <= maxRadius).length / radii.length;
      expect(inside).toBeGreaterThan(0.7);
      expect(inside).toBeLessThan(0.97);
      expect(radii.some((r) => r < minRadius)).toBe(true);
      expect(radii.some((r) => r > maxRadius)).toBe(true);
    });

    it(`${band}: never strays beyond the band's reach`, () => {
      const { min, max } = bandReach(band);
      for (const r of draws(band)) {
        expect(r).toBeGreaterThanOrEqual(min);
        expect(r).toBeLessThanOrEqual(max);
      }
    });
  }

  it("keeps each band's reach clear of its neighbours' and above the planet", () => {
    const reaches = bands.map(bandReach);
    expect(reaches[0].min).toBeGreaterThan(1);
    for (let i = 1; i < reaches.length; i++) expect(reaches[i].min).toBeGreaterThan(reaches[i - 1].max);
  });

  it("still gives a higher orbit a longer period", () => {
    const random = seeded(3);
    const orbits = Array.from({ length: 200 }, () => placeInBand("mid", 0, random)).sort((a, b) => a.radius - b.radius);
    for (let i = 1; i < orbits.length; i++) expect(orbits[i].period).toBeGreaterThanOrEqual(orbits[i - 1].period);
  });
});
