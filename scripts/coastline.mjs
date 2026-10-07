// Bakes the coastlines the sky view can see into src/scripts/coastline.json,
// so the browser doesn't download the whole world. Run with
// `pnpm coastline` after changing the stations or the visible region.
//
// The chart's plane is the great circle closest to the three ground
// stations (src/lib/stations.ts, ADR 0013), and the coastlines are baked in
// its frame, so each station sits on its own coast. Only the hemisphere
// facing the camera is ever on screen, and up close only the part around a
// station. Coordinates are in the scene's frame, in planet radii: +y is up
// at Canberra, +z points out of the plane towards the camera, and +x
// completes a right-handed frame.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { feature } from "topojson-client";
import { FRAME, STATIONS, onGlobe } from "../src/lib/stations.ts";

// Close to a station, what the horizon view can show, at 1:50m; the rest of
// the near hemisphere, only seen zoomed out, at 1:110m.
const NEAR = 0.75;
const MIN_Z = -0.02;

const require = createRequire(import.meta.url);
const land = (scale) => {
  const topology = JSON.parse(readFileSync(require.resolve(`world-atlas/land-${scale}.json`), "utf8"));
  return feature(topology, topology.objects.land);
};

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const toScene = ([lon, lat]) => {
  const p = onGlobe(lat, lon);
  return [dot(p, FRAME.x), dot(p, FRAME.y), dot(p, FRAME.z)];
};
// each station's way up, in the scene (it's the chart seen mirrored)
const ups = STATIONS.map((s) => [-Math.cos(s.angle), Math.sin(s.angle)]);
const nearStation = ([x, y]) => ups.some(([ux, uy]) => x * ux + y * uy >= NEAR);

// stored as integers in 1/10000ths of a radius, to keep the file small
const fixed = (n) => Math.round(n * 1e4);
const far = (a, b, step) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) >= step;

// every ring, cut into runs of points inside the region, skipping points
// closer than `step` to the last one kept (they add nothing on screen)
function bake(scale, inside, step) {
  const lines = [];
  for (const polygon of land(scale).features[0].geometry.coordinates) {
    for (const ring of polygon) {
      let run = [];
      let last = null;
      const end = () => {
        if (run.length >= 6) lines.push(run);
        run = [];
        last = null;
      };
      for (const point of ring.map(toScene)) {
        if (!inside(point)) end();
        else if (!last || far(point, last, step)) {
          run.push(...point.map(fixed));
          last = point;
        }
      }
      end();
    }
  }
  return lines;
}

const lines = [
  ...bake("50m", (p) => nearStation(p) && p[2] >= MIN_Z, 2.4e-3),
  ...bake("110m", (p) => !nearStation(p) && p[2] >= MIN_Z, 4e-3),
];

writeFileSync(new URL("../src/scripts/coastline.json", import.meta.url), JSON.stringify(lines));
const points = lines.reduce((n, line) => n + line.length / 3, 0);
console.log(`${lines.length} coastlines, ${points} points`);
