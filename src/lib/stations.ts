// The ground stations (ADR 0014): where beacons are heard. Three, at the
// Deep Space Network's sites, and all heard by everyone, so everyone still
// reads the same line at the same moment.
//
// The chart is one flat orbit plane (orbit.ts), and three points on a globe
// don't lie on one great circle; these three come within 8° of one. The
// chart's plane is that circle, and each station sits where its site falls
// on it. scripts/coastline.mjs bakes the coastlines in the same frame, so a
// station sits on its own coast: change a site or the pole, and re-bake.

import { angleAt, burnAt, turnedAt, type Orbit } from "./orbit.ts";

const TAU = 2 * Math.PI;
const rad = Math.PI / 180;

export const SITES = [
  { id: "canberra", name: "Canberra", lat: -35.4, lon: 148.98 },
  { id: "goldstone", name: "Goldstone", lat: 35.43, lon: -116.89 },
  { id: "madrid", name: "Madrid", lat: 40.43, lon: -4.25 },
] as const;

// The pole of the great circle closest to all three (a least-squares fit).
const POLE = { lat: 41.75, lon: 118.25 };

type Vector = [number, number, number];
// a point on the unit globe: x through 0° longitude on the equator, z north
export const onGlobe = (lat: number, lon: number): Vector => [
  Math.cos(lat * rad) * Math.cos(lon * rad),
  Math.cos(lat * rad) * Math.sin(lon * rad),
  Math.sin(lat * rad),
];
const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vector, b: Vector): Vector => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

// The scene's frame, in the globe's: y up through Canberra (as it falls on
// the plane), z out of the plane towards the camera, x completing a
// right-handed frame. The scene is the chart seen mirrored (scene.ts), so a
// chart angle is atan2(y, -x).
export const FRAME = (() => {
  const z = onGlobe(POLE.lat, POLE.lon);
  const c = onGlobe(SITES[0].lat, SITES[0].lon);
  const up = c.map((v, i) => v - dot(c, z) * z[i]) as Vector;
  const length = Math.hypot(...up);
  const y = up.map((v) => v / length) as Vector;
  return { x: cross(y, z), y, z };
})();

export type StationId = (typeof SITES)[number]["id"];
export interface Station {
  id: StationId;
  name: string;
  // where it is on the chart, anticlockwise from the right
  angle: number;
}

export const STATIONS: readonly Station[] = SITES.map(({ id, name, lat, lon }) => {
  const p = onGlobe(lat, lon);
  const angle = Math.atan2(dot(p, FRAME.y), -dot(p, FRAME.x));
  return { id, name, angle: (angle + TAU) % TAU };
});

export const CANBERRA = STATIONS[0];

// How far either side of a station a satellite counts as overhead.
export const OVERHEAD_HALF_WIDTH = (12 * Math.PI) / 180;

// an angle, wrapped to between -π and π
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

// The station a satellite is over now, if any.
export function stationOver(orbit: Orbit, time: number): Station | null {
  const angle = angleAt(orbit, time);
  return STATIONS.find((s) => Math.abs(wrap(angle - s.angle)) <= OVERHEAD_HALF_WIDTH) ?? null;
}

export const isOverhead = (orbit: Orbit, time: number): boolean => stationOver(orbit, time) !== null;

// How long until a satellite next comes into a station's window, or null if
// it burns up first. Its unwrapped angle only ever grows the way it goes
// (orbit.ts, turnedAt), so the moment it reaches the window's near edge is
// found by halving the time until it burns up, however its period changes
// as it falls.
export function untilStation(orbit: Orbit, time: number, station: Station): number | null {
  const burn = burnAt(orbit);
  if (time >= burn) return null;
  const direction = orbit.direction ?? 1;
  // how far it has gone, the way it goes
  const gone = (t: number) => direction * turnedAt(orbit, t);
  // where it comes in: the window's near edge, the way it goes
  const edge = station.angle - direction * OVERHEAD_HALF_WIDTH;
  const target = gone(time) + ((direction * (edge - angleAt(orbit, time)) + 2 * TAU) % TAU);
  if (gone(burn) < target) return null;
  let lo = 0;
  let hi = burn - time;
  while (hi - lo > 1) {
    const mid = (lo + hi) / 2;
    if (gone(time + mid) >= target) hi = mid;
    else lo = mid;
  }
  return hi;
}

// The next station whose window a satellite comes into, and how long until
// it does, or null if it burns up first.
export function nextStation(orbit: Orbit, time: number): { station: Station; in: number } | null {
  let next: { station: Station; in: number } | null = null;
  for (const station of STATIONS) {
    const ms = untilStation(orbit, time, station);
    if (ms !== null && (!next || ms < next.in)) next = { station, in: ms };
  }
  return next;
}
