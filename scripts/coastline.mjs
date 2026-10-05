// Bakes the coastlines the sky view can see into src/scripts/coastline.json,
// so the browser doesn't download the whole world. Run with
// `pnpm coastline` after changing the station or the visible region.
//
// The planet never turns under the station (PLAN.md, "Overhead"), so only the
// part of the globe around the station is ever on screen. The station sits on
// Canberra. Coordinates are in the scene's frame, in planet radii: +y is up
// at the station, +z points north towards the camera (so the near side of
// the planet is Australia), and +x completes a right-handed frame (west).
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { feature } from "topojson-client";

const STATION = { lat: -35.28, lon: 149.13 };
// what can come on screen: the near hemisphere, down to well below the limb
const MIN_Y = 0.45;
const MIN_Z = -0.02;

const require = createRequire(import.meta.url);
const topology = JSON.parse(readFileSync(require.resolve("world-atlas/land-50m.json"), "utf8"));
const land = feature(topology, topology.objects.land);

const rad = Math.PI / 180;
const φ = STATION.lat * rad;
const λ = STATION.lon * rad;
const up = [Math.cos(φ) * Math.cos(λ), Math.cos(φ) * Math.sin(λ), Math.sin(φ)];
const north = [-Math.sin(φ) * Math.cos(λ), -Math.sin(φ) * Math.sin(λ), Math.cos(φ)];
const west = [Math.sin(λ), -Math.cos(λ), 0];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function toScene([lon, lat]) {
  const p = [
    Math.cos(lat * rad) * Math.cos(lon * rad),
    Math.cos(lat * rad) * Math.sin(lon * rad),
    Math.sin(lat * rad),
  ];
  return [dot(p, west), dot(p, up), dot(p, north)];
}

const visible = ([, y, z]) => y >= MIN_Y && z >= MIN_Z;
// stored as integers in 1/10000ths of a radius, to keep the file small
const fixed = (n) => Math.round(n * 1e4);
// points closer than this to the last kept one add nothing on screen
const MIN_STEP = 8e-4;
const far = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) >= MIN_STEP;

// every ring, cut into runs of visible points
const lines = [];
for (const polygon of land.features[0].geometry.coordinates) {
  for (const ring of polygon) {
    let run = [];
    let last = null;
    const end = () => {
      if (run.length >= 6) lines.push(run);
      run = [];
      last = null;
    };
    for (const point of ring.map(toScene)) {
      if (!visible(point)) end();
      else if (!last || far(point, last)) {
        run.push(...point.map(fixed));
        last = point;
      }
    }
    end();
  }
}

writeFileSync(new URL("../src/scripts/coastline.json", import.meta.url), JSON.stringify(lines));
const points = lines.reduce((n, line) => n + line.length / 3, 0);
console.log(`${lines.length} coastlines, ${points} points`);
