// Bakes where there's land on the half of the globe the launch looks down on
// into src/scripts/land.json, so the launchpad's planet is the real one: the
// pad stands at Canberra, with Australia below it. Run with `pnpm land`
// after changing the stations.
//
// The mask looks straight down on the pad from above: a grid over the
// scene's x and z, in planet radii, each cell the point on the upper
// hemisphere under it. The launch only ever sees the pad and the ground
// between it and the camera (+z), so z runs from just behind the pad.
// Stored a row at a time as alternating run lengths, sea first, to keep the
// file small.
//
// The frame is the sky page's (scripts/coastline.mjs), tipped the 8° it
// takes for up to run through Canberra itself rather than where Canberra
// falls on the chart's plane, which is out to sea south of Tasmania.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { feature } from "topojson-client";
import { FRAME, SITES, onGlobe } from "../src/lib/stations.ts";

const WIDTH = 512;
const NEAR = -0.25;
const HEIGHT = Math.round((WIDTH * (1 - NEAR)) / 2);

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => a.map((v) => v / Math.hypot(...a));
const canberra = SITES.find((s) => s.id === "canberra");
const up = onGlobe(canberra.lat, canberra.lon);
const out = unit(FRAME.z.map((v, k) => v - dot(FRAME.z, up) * up[k]));
const frame = { x: cross(up, out), y: up, z: out };

const require = createRequire(import.meta.url);
const topology = JSON.parse(readFileSync(require.resolve("world-atlas/land-50m.json"), "utf8"));
const polygons = feature(topology, topology.objects.land).features[0].geometry.coordinates;

// each ring unwrapped across the antimeridian, with its bounds
const rings = polygons.map((polygon) =>
  polygon.map((ring) => {
    const points = [];
    let shift = 0;
    let last = null;
    for (const [lon, lat] of ring) {
      if (last !== null && Math.abs(lon + shift - last) > 180) shift += lon + shift > last ? -360 : 360;
      points.push([lon + shift, lat]);
      last = lon + shift;
    }
    const lons = points.map((p) => p[0]);
    const lats = points.map((p) => p[1]);
    return { points, west: Math.min(...lons), east: Math.max(...lons), south: Math.min(...lats), north: Math.max(...lats) };
  }),
);

// even-odd ray casting, in longitude and latitude
function inRing({ points, west, east, south, north }, lon, lat) {
  if (lat < south || lat > north) return false;
  for (const l of [lon, lon - 360, lon + 360]) {
    if (l < west || l > east) continue;
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i];
      const [xj, yj] = points[j];
      if (yi > lat !== yj > lat && l < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}

// land is inside a polygon's outer ring and outside its holes
const isLand = (lon, lat) =>
  rings.some(([outer, ...holes]) => inRing(outer, lon, lat) && !holes.some((hole) => inRing(hole, lon, lat)));

const deg = 180 / Math.PI;
const rows = [];
let land = 0;
for (let j = 0; j < HEIGHT; j++) {
  const z = NEAR + ((j + 0.5) / HEIGHT) * (1 - NEAR);
  const runs = [];
  let current = false;
  let run = 0;
  for (let i = 0; i < WIDTH; i++) {
    const x = ((i + 0.5) / WIDTH) * 2 - 1;
    const y = Math.sqrt(Math.max(0, 1 - x * x - z * z));
    // the scene's point, on the globe
    const g = [0, 1, 2].map((k) => x * frame.x[k] + y * frame.y[k] + z * frame.z[k]);
    const here = x * x + z * z < 1 && isLand(Math.atan2(g[1], g[0]) * deg, Math.asin(g[2]) * deg);
    if (here) land++;
    if (here !== current) {
      runs.push(run);
      run = 0;
      current = here;
    }
    run++;
  }
  if (current) runs.push(run);
  rows.push(runs);
}

writeFileSync(new URL("../src/scripts/land.json", import.meta.url), JSON.stringify({ width: WIDTH, near: NEAR, rows }));
console.log(`${WIDTH}x${HEIGHT} land mask, ${((land / (WIDTH * HEIGHT)) * 100).toFixed(1)}% land`);
