// What the launchpad and the sky share, so the stars over the pad are the
// same stars the sky page draws.

// The same stars on every visit.
export function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Spectral colours from hot blue-white to cool orange, weighted as the
// naked-eye sky is: mostly white, a few blue, some yellow and orange.
export const STAR_COLOURS: [string, number][] = [
  ["#9bb0ff", 0.06],
  ["#cad7ff", 0.18],
  ["#f8f7ff", 0.36],
  ["#fff4ea", 0.2],
  ["#ffe2b8", 0.12],
  ["#ffc787", 0.08],
];

// The planet as both pages draw it: a deep blue sphere, its rim brightened by
// the atmosphere seen edge-on, the green airglow line over a blue haze.
export const PLANET_COLOURS = {
  deep: "#050b1a",
  lit: "#11264a",
  rim: "#3f8fd6",
  air: "#86eab0",
  haze: "#3d86dc",
  space: "#03060e",
};
