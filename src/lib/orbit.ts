// Orbits on the 2D chart, shared by the server and the browser. A position is
// a pure function of an object's elements and the time, so every session that
// agrees on the server's clock draws the same sky (ADR 0004).
//
// Distances are in planet radii. Angles are radians, anticlockwise from the
// right, with y up; the shared ground station is at the top of the planet.

export const BANDS = {
  low: { label: "Low", minRadius: 1.2, maxRadius: 1.4, period: 60_000 },
  mid: { label: "Mid", minRadius: 1.6, maxRadius: 1.9, period: 180_000 },
  high: { label: "High", minRadius: 2.2, maxRadius: 2.6, period: 480_000 },
} as const;

export type Band = keyof typeof BANDS;

export const isBand = (value: unknown): value is Band =>
  typeof value === "string" && Object.hasOwn(BANDS, value);

export const STATION_ANGLE = Math.PI / 2;

// How far either side of the station a satellite counts as overhead.
export const OVERHEAD_HALF_WIDTH = (12 * Math.PI) / 180;

export interface Orbit {
  radius: number;
  // angle at the epoch
  phase: number;
  // milliseconds per orbit
  period: number;
  // server time, in ms, that the phase is measured from
  epoch: number;
}

const TAU = 2 * Math.PI;

export function angleAt(orbit: Orbit, time: number): number {
  const turns = (time - orbit.epoch) / orbit.period;
  return (((orbit.phase + turns * TAU) % TAU) + TAU) % TAU;
}

export function positionAt(orbit: Orbit, time: number): { x: number; y: number } {
  const angle = angleAt(orbit, time);
  return { x: orbit.radius * Math.cos(angle), y: orbit.radius * Math.sin(angle) };
}

export function isOverhead(orbit: Orbit, time: number): boolean {
  const off = Math.abs(angleAt(orbit, time) - STATION_ANGLE);
  return Math.min(off, TAU - off) <= OVERHEAD_HALF_WIDTH;
}

// A new orbit somewhere in the band: the band sets the rough period, the
// radius and phase are jittered so no two orbits are the same, and within a
// band a higher orbit is slower (period grows with radius^1.5, as Kepler has it).
export function placeInBand(band: Band, epoch: number, random = Math.random): Orbit {
  const { minRadius, maxRadius, period } = BANDS[band];
  const radius = minRadius + random() * (maxRadius - minRadius);
  const middle = (minRadius + maxRadius) / 2;
  return {
    radius,
    phase: random() * TAU,
    period: Math.round(period * (radius / middle) ** 1.5),
    epoch,
  };
}
