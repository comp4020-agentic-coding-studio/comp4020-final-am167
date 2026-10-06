import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  LineSegments,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Points,
  RingGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  WebGLRenderer,
} from "three";
import { BAND_SPREAD, BANDS, OVERHEAD_HALF_WIDTH, STATION_ANGLE, angleAt, isOverhead, type Band, type Orbit } from "../lib/orbit.ts";
import coastline from "./coastline.json";
import { countdown } from "./countdown.ts";
import { attachPerformanceProfiler } from "./performance-profiler.ts";
import { PLANET_COLOURS, STAR_COLOURS, seeded } from "./starfield.ts";

// The sky as seen from just above the station: the planet's limb along the
// bottom, the three bands stacked over it, and satellites rising in on the
// left, crossing the station's window and setting on the right. It zooms out
// to the whole planet, with every orbit in view.
//
// The simulation is still the flat chart of orbit.ts (PLAN.md, "Dimension"):
// every orbit lies in the screen's plane and the camera is orthographic, so
// this is the same 2D sky, drawn closer up. Three.js only does the drawing.

export interface SceneSatellite extends Orbit {
  id: number;
  callsign: string;
  band: Band;
  mine: boolean;
}

export interface SceneControls {
  // true for the whole planet, false for the horizon over the station
  zoom(out: boolean): void;
}

export interface SceneOptions {
  canvas: HTMLCanvasElement;
  overlay: HTMLElement;
  sky: () => Iterable<SceneSatellite>;
  now: () => number;
  // a satellite launched just before the page opened, to point out
  launched: number | null;
  reduced: boolean;
  // elements over the canvas that labels and the pointer keep clear of
  obstacles: HTMLElement[];
}

const TAU = Math.PI * 2;

// Over the station the planet is drawn six chart units across, but the orbits
// keep their heights above it, so the bands sit close over a gently curved
// horizon. Zoomed out, it shrinks back to the chart's own size.
const PLANET = 6;
const WHOLE = 1;
const display = (radius: number, planet = PLANET) => planet + (radius - 1);
// how long the zoom takes, and how much of it the stars follow (0 not at
// all, 1 as much as the planet)
const ZOOM_MS = 1400;
const STAR_DEPTH = 0.5;
// the top of the view, just above the high band
const TOP = display(BANDS.high.maxRadius) + 0.4;
// at least this much planet shows under the limb
const GROUND = 0.45;
// and at least this much of the orbit either side of the station
const MIN_HALF_ANGLE = (14 * Math.PI) / 180;
// on a tall screen, the share of the spare height given to the sky
const SPARE_SKY = 0.4;
// stars are scattered for this many pixels per scene unit (a desktop
// screen), and thinned where the view is zoomed further out
const STAR_SCALE = 400;

// How long a trail is, in time behind the satellite, and its longest arc.
const TRAIL_MS = 12_000;
const TRAIL_MAX = 0.35;
const TRAIL_STEPS = 28;

// Seen from the other side of the chart's plane, so satellites cross left to
// right; the station is at the top either way.
const place = (radius: number, angle: number, planet: number): [number, number] => {
  const d = display(radius, planet);
  return [-d * Math.cos(angle), d * Math.sin(angle)];
};

const AMBER = new Color("#f2a541");
const INK = new Color("#dbe4ef");

// The catalogue's swatch colour, oklch(0.8 0.13 hue), in linear sRGB.
export function satelliteColour(id: number): [number, number, number] {
  const h = (((id * 137.508) % 360) * Math.PI) / 180;
  const L = 0.8;
  const a = 0.13 * Math.cos(h);
  const b = 0.13 * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return [
    clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

// ── the backdrop: stars and the Milky Way ─────────────────────────────────

const STARFIELD = { left: -9, right: 9, bottom: 1, top: 10 };
// the Milky Way's band, as a line across the backdrop
const GALAXY = { x: -1.5, y: 7.2, angle: -0.5, width: 1.1 };

function stars(): Points {
  const random = seeded(4020);
  const palette = STAR_COLOURS.map(([hex, weight]) => ({ colour: new Color(hex), weight }));
  const pick = () => {
    let r = random();
    for (const p of palette) if ((r -= p.weight) <= 0) return p.colour;
    return palette[2].colour;
  };
  const { left, right, bottom, top } = STARFIELD;
  const field = 16_000;
  const galaxy = 18_000;
  const position = new Float32Array((field + galaxy) * 3);
  const colour = new Float32Array((field + galaxy) * 3);
  const size = new Float32Array(field + galaxy);
  const rank = new Float32Array(field + galaxy);
  const nx = Math.sin(GALAXY.angle);
  const ny = -Math.cos(GALAXY.angle);

  for (let i = 0; i < field + galaxy; i++) {
    let x = left + random() * (right - left);
    let y = bottom + random() * (top - bottom);
    if (i >= field) {
      // crowd the rest towards the galaxy's band (a rough normal spread)
      const off = (random() + random() + random() - 1.5) * GALAXY.width;
      const along = (random() - 0.5) * 24;
      x = GALAXY.x + along * Math.cos(GALAXY.angle) + off * nx;
      y = GALAXY.y + along * Math.sin(GALAXY.angle) + off * ny;
    }
    position.set([x, y, -50], i * 3);
    // brightness falls off steeply: a handful of bright stars, many faint
    const bright = i >= field ? random() ** 6 * 0.5 : random() ** 9;
    const c = pick();
    const glow = 0.25 + bright * 1.6;
    colour.set([c.r * glow, c.g * glow, c.b * glow], i * 3);
    size[i] = 1.2 + bright * 4.5;
    rank[i] = random();
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(position, 3));
  geometry.setAttribute("colour", new BufferAttribute(colour, 3));
  geometry.setAttribute("size", new BufferAttribute(size, 1));
  geometry.setAttribute("rank", new BufferAttribute(rank, 1));
  const material = new ShaderMaterial({
    uniforms: { ratio: { value: 1 }, density: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec3 colour;
      attribute float size;
      attribute float rank;
      uniform float ratio;
      uniform float density;
      varying vec3 vColour;
      void main() {
        vColour = colour;
        // the same number of stars per screen, however far out the view is
        gl_PointSize = rank < density ? size * ratio : 0.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColour;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = exp(-d * d * 5.0);
        gl_FragColor = vec4(vColour * a, 1.0);
        #include <colorspace_fragment>
      }`,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  return new Points(geometry, material);
}

// A faint, mottled glow along the galaxy's band, with a darker dust lane.
function milkyWay(): Mesh {
  const { left, right, bottom, top } = STARFIELD;
  const geometry = new PlaneGeometry(right - left, top - bottom);
  geometry.translate((left + right) / 2, (bottom + top) / 2, -60);
  const material = new ShaderMaterial({
    uniforms: {
      origin: { value: [GALAXY.x, GALAXY.y] },
      normal: { value: [Math.sin(GALAXY.angle), -Math.cos(GALAXY.angle)] },
      width: { value: GALAXY.width },
      tint: { value: new Color("#8fa6d8") },
      warm: { value: new Color("#d9c6a8") },
    },
    vertexShader: /* glsl */ `
      varying vec2 vPos;
      void main() {
        vPos = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec2 origin;
      uniform vec2 normal;
      uniform float width;
      uniform vec3 tint;
      uniform vec3 warm;
      varying vec2 vPos;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
        return v;
      }
      void main() {
        float d = dot(vPos - origin, normal) / width;
        float band = exp(-d * d * 1.6);
        float cloud = fbm(vPos * 1.3) * fbm(vPos * 0.6 + 7.0);
        float dust = smoothstep(0.35, 0.0, abs(d + 0.15 * fbm(vPos * 0.9) - 0.1)) * fbm(vPos * 2.2 + 3.0);
        float glow = band * cloud * 0.16 * (1.0 - dust * 0.85);
        vec3 colour = mix(tint, warm, smoothstep(0.2, 0.6, cloud));
        gl_FragColor = vec4(colour * glow, 1.0);
        #include <colorspace_fragment>
      }`,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  return new Mesh(geometry, material);
}

// ── the planet ─────────────────────────────────────────────────────────────

function globe(): Mesh {
  // poles towards the camera, so the limb is the sphere's finely cut equator
  const geometry = new SphereGeometry(PLANET, 512, 64);
  geometry.rotateX(Math.PI / 2);
  const material = new ShaderMaterial({
    uniforms: {
      deep: { value: new Color(PLANET_COLOURS.deep) },
      lit: { value: new Color(PLANET_COLOURS.lit) },
      rim: { value: new Color(PLANET_COLOURS.rim) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      void main() {
        vNormal = normal;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 deep;
      uniform vec3 lit;
      uniform vec3 rim;
      varying vec3 vNormal;
      void main() {
        vec3 n = normalize(vNormal);
        float light = clamp(dot(n, normalize(vec3(-0.35, 0.8, 0.5))), 0.0, 1.0);
        vec3 colour = mix(deep, lit, light * light);
        // the atmosphere, seen edge-on, brightens the planet's rim
        colour += rim * pow(1.0 - n.z, 6.0) * 0.55;
        gl_FragColor = vec4(colour, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  return new Mesh(geometry, material);
}

// Coastlines (baked by scripts/coastline.mjs), fading out towards the limb
// where they would crowd together.
function coastlines(): LineSegments {
  const lines = coastline as number[][];
  const segments: number[] = [];
  const lift = (PLANET * 1.0008) / 1e4;
  for (const line of lines) {
    for (let i = 0; i + 5 < line.length; i += 3) {
      for (let j = 0; j < 6; j++) segments.push(line[i + j] * lift);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(segments, 3));
  const material = new ShaderMaterial({
    uniforms: { colour: { value: new Color("#6f97d0") }, radius: { value: PLANET } },
    vertexShader: /* glsl */ `
      uniform float radius;
      varying float vFade;
      void main() {
        vFade = smoothstep(0.0, 0.3, position.z / radius);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 colour;
      varying float vFade;
      void main() {
        gl_FragColor = vec4(colour, 0.7 * vFade);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  });
  return new LineSegments(geometry, material);
}

// The thin green airglow line that hangs over the limb in photographs from
// orbit, over a softer blue haze.
function atmosphere(): Mesh {
  const geometry = new RingGeometry(WHOLE * 0.5, PLANET + 1.4, 512, 1);
  const material = new ShaderMaterial({
    uniforms: {
      radius: { value: PLANET },
      // thinner as the planet shrinks, so it stays a rim, not a halo
      thickness: { value: 1 },
      air: { value: new Color(PLANET_COLOURS.air) },
      haze: { value: new Color(PLANET_COLOURS.haze) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vPos;
      void main() {
        vPos = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float radius;
      uniform float thickness;
      uniform vec3 air;
      uniform vec3 haze;
      varying vec2 vPos;
      void main() {
        float h = (length(vPos) - radius) / thickness;
        if (h < 0.0 || h > 1.4) discard;
        float line = exp(-pow((h - 0.07) / 0.022, 2.0)) * 0.5;
        float glow = exp(-h / 0.1) * 0.5 + exp(-h / 0.45) * 0.03;
        gl_FragColor = vec4(air * line + haze * glow, 1.0);
        #include <colorspace_fragment>
      }`,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  return new Mesh(geometry, material);
}

// ── the chart over the horizon: bands and the station's window ────────────

// Each band is a soft glow, brightest at its middle and fading past its
// edges the way launches spread (orbit.ts), drawn by height above the planet
// so it follows the planet as the view zooms.
function bands(): Mesh {
  const geometry = new RingGeometry(WHOLE * 0.5, display(BANDS.high.maxRadius) + 0.5, 512, 1);
  const material = new ShaderMaterial({
    uniforms: {
      colour: { value: new Color("#3a5781") },
      radius: { value: PLANET },
      ranges: { value: Object.values(BANDS).map((b) => new Vector2(b.minRadius - 1, b.maxRadius - 1)) },
      spread: { value: BAND_SPREAD },
    },
    vertexShader: /* glsl */ `
      varying vec2 vPos;
      void main() {
        vPos = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 colour;
      uniform float radius;
      uniform vec2 ranges[3];
      uniform float spread;
      varying vec2 vPos;
      void main() {
        float h = length(vPos) - radius;
        float a = 0.0;
        for (int i = 0; i < 3; i++) {
          vec2 r = ranges[i];
          float sigma = (r.y - r.x) / 2.0 / spread;
          float z = (h - (r.x + r.y) / 2.0) / sigma;
          a = max(a, exp(-0.5 * z * z) * 0.2);
        }
        if (a < 0.002) discard;
        gl_FragColor = vec4(colour, a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  });
  return new Mesh(geometry, material);
}

// Anything inside this wedge is over the station, and its beacon is heard.
function stationWindow(): Mesh {
  const geometry = new RingGeometry(WHOLE * 0.5, TOP + 2, 64, 8, STATION_ANGLE - OVERHEAD_HALF_WIDTH, OVERHEAD_HALF_WIDTH * 2);
  const material = new ShaderMaterial({
    uniforms: {
      colour: { value: AMBER },
      radius: { value: PLANET },
      reach: { value: TOP - PLANET },
      halfWidth: { value: OVERHEAD_HALF_WIDTH },
    },
    vertexShader: /* glsl */ `
      varying vec2 vPos;
      void main() {
        vPos = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 colour;
      uniform float radius;
      uniform float reach;
      uniform float halfWidth;
      varying vec2 vPos;
      void main() {
        if (length(vPos) < radius) discard;
        float up = clamp((length(vPos) - radius) / reach, 0.0, 1.0);
        float off = abs(atan(vPos.x, vPos.y)) / halfWidth;
        float edge = smoothstep(0.96, 1.0, off) * 0.12;
        float a = (0.045 + edge) * (1.0 - up * 0.7);
        gl_FragColor = vec4(colour, a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  });
  return new Mesh(geometry, material);
}

// ── satellites and their trails ───────────────────────────────────────────

function glowPoints(): Points {
  const geometry = new BufferGeometry();
  const material = new ShaderMaterial({
    uniforms: { ratio: { value: 1 }, ring: { value: INK } },
    vertexShader: /* glsl */ `
      attribute vec3 colour;
      attribute float size;
      attribute float core;
      attribute float halo;
      uniform float ratio;
      varying vec3 vColour;
      varying float vSize;
      varying float vCore;
      varying float vHalo;
      void main() {
        vColour = colour;
        vSize = size;
        vCore = core;
        vHalo = halo;
        gl_PointSize = size * ratio;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 ring;
      varying vec3 vColour;
      varying float vSize;
      varying float vCore;
      varying float vHalo;
      void main() {
        // distance from the centre in CSS pixels
        float r = length(gl_PointCoord - 0.5) * vSize;
        float core = 1.0 - smoothstep(vCore - 0.8, vCore + 0.6, r);
        float glow = exp(-r * r / (vCore * vCore * 3.0)) * 0.7 * (1.0 - smoothstep(vSize * 0.3, vSize * 0.5, r));
        // yours wears a ring
        float band = vHalo > 0.0 ? (1.0 - smoothstep(0.6, 1.4, abs(r - vHalo))) * 0.9 : 0.0;
        vec3 colour = vColour * (core + glow) + vec3(1.0) * core * 0.35 + ring * band;
        gl_FragColor = vec4(colour, 1.0);
        #include <colorspace_fragment>
      }`,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  return new Points(geometry, material);
}

interface Placed {
  sat: SceneSatellite;
  angle: number;
  x: number;
  y: number;
  overhead: boolean;
}

export function createScene(options: SceneOptions): SceneControls | null {
  const { canvas, overlay, reduced } = options;
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "low-power" });
  } catch {
    return null;
  }
  renderer.setClearColor(PLANET_COLOURS.space);
  renderer.autoClear = false;
  // absent unless scripts/performance/run.ts asked for it
  const profiler = attachPerformanceProfiler(renderer, canvas, "sky");

  // The stars are a backdrop with their own camera, which zooms by less than
  // the planet's: a far-off sky the planet pulls back against.
  const backdropScene = new Scene();
  const backdropCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  backdropCamera.position.set(0, 0, 100);
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  camera.position.set(0, 0, 100);

  const starPoints = stars();
  const backdrop = milkyWay();
  const earth = globe();
  const coasts = coastlines();
  const air = atmosphere();
  const beam = stationWindow();
  const trails = new Mesh(new BufferGeometry(), new ShaderMaterial({
    vertexShader: /* glsl */ `
      attribute vec4 tint;
      varying vec4 vTint;
      void main() {
        vTint = tint;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec4 vTint;
      void main() {
        gl_FragColor = vec4(vTint.rgb * vTint.a, 1.0);
        #include <colorspace_fragment>
      }`,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    // the ribbon's winding depends on which way it curves
    side: DoubleSide,
  }));
  const satellites = glowPoints();
  const station = glowPoints();
  station.geometry.setAttribute("position", new Float32BufferAttribute([0, PLANET + 0.01, 8], 3));
  station.geometry.setAttribute("colour", new Float32BufferAttribute([AMBER.r, AMBER.g, AMBER.b], 3));
  station.geometry.setAttribute("size", new Float32BufferAttribute([30], 1));
  station.geometry.setAttribute("core", new Float32BufferAttribute([3], 1));
  station.geometry.setAttribute("halo", new Float32BufferAttribute([0], 1));

  // their geometry changes every frame, so its bounds go stale
  trails.frustumCulled = false;
  satellites.frustumCulled = false;

  // drawn back to front
  backdrop.renderOrder = 0;
  starPoints.renderOrder = 1;
  backdropScene.add(backdrop, starPoints);
  const bandRings = bands();
  const layers = [earth, coasts, air, bandRings, beam, trails, station, satellites];
  layers.forEach((layer, i) => {
    layer.renderOrder = i;
    if (layer !== earth && layer !== coasts) layer.position.z = 8;
    scene.add(layer);
  });
  const sized = [air, bandRings, beam].map((layer) => (layer.material as ShaderMaterial).uniforms.radius);

  // ── the labels over the canvas ──
  const bandLabels = (Object.values(BANDS) as (typeof BANDS)[Band][]).map((band) => {
    const el = document.createElement("span");
    el.className = "band-label";
    el.textContent = band.label;
    overlay.append(el);
    return { band, el };
  });
  const stationLabel = document.createElement("span");
  stationLabel.className = "station-label";
  stationLabel.textContent = "Station";
  const pointer = document.createElement("span");
  pointer.className = "your-pointer";
  pointer.hidden = true;
  const pulse = document.createElement("span");
  pulse.className = "launch-pulse";
  pulse.hidden = true;
  overlay.append(stationLabel, pointer, pulse);
  const labels = new Map<number, { el: HTMLSpanElement; width: number; shown: boolean; at: string }>();
  type Box = [number, number, number, number];
  const LABEL_HEIGHT = 18;
  const overlaps = (a: Box, b: Box) => !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
  const boxOf = (el: Element): Box => {
    const r = el.getBoundingClientRect();
    const o = overlay.getBoundingClientRect();
    return [r.left - o.left, r.top - o.top, r.right - o.left, r.bottom - o.top];
  };
  // labels that never move, which satellite labels keep clear of
  let fixed: Box[] = [];

  // ── sizing ──
  let width = 0;
  let height = 0;
  let half = 1; // half the view's width, in scene units
  let top = TOP;
  let bottom = 0;
  let planet = PLANET;
  // 0 is the horizon over the station, 1 the whole planet
  let zoom = 0;
  let zoomFrom = 0;
  let zoomTo = 0;
  let zoomStart = 0;

  // The view at a zoom level: the planet's size and the camera's edges.
  function frameAt(level: number) {
    const aspect = width / height;
    const size = PLANET + (WHOLE - PLANET) * level;
    // the horizon: the limb along the bottom, the bands just over it
    const sky = display(BANDS.high.maxRadius, size) + 0.4;
    const minHalf = display(BANDS.mid.minRadius, size) * Math.sin(MIN_HALF_ANGLE);
    const minHalfHeight = (sky - (size - GROUND)) / 2;
    const horizonHalf = Math.max(minHalf, minHalfHeight * aspect) / aspect;
    const spare = 2 * horizonHalf - 2 * minHalfHeight;
    const horizonCentre = sky + spare * SPARE_SKY - horizonHalf;
    // the whole planet, centred, with every orbit in view
    const fit = display(BANDS.high.maxRadius, size) + 0.3;
    const wholeHalf = aspect >= 1 ? fit : fit / aspect;
    // move the centre evenly, but scale the size geometrically, so the zoom
    // feels steady
    const centre = horizonCentre * (1 - level);
    const halfHeight = horizonHalf * (wholeHalf / horizonHalf) ** level;
    return { size, half: halfHeight * aspect, top: centre + halfHeight, bottom: centre - halfHeight };
  }

  // Puts the camera, the planet and the fixed labels where a zoom level has them.
  function apply(level: number) {
    ({ size: planet, half, top, bottom } = frameAt(level));
    Object.assign(camera, { left: -half, right: half, top, bottom });
    camera.updateProjectionMatrix();
    // the stars are far away, so they follow the camera only part of the way
    const near = frameAt(0);
    const far = frameAt(1);
    const depth = ((far.top - far.bottom) / (near.top - near.bottom)) ** (level * STAR_DEPTH);
    const nearCentre = (near.top + near.bottom) / 2;
    const centre = nearCentre + ((far.top + far.bottom) / 2 - nearCentre) * level * STAR_DEPTH * 0.3;
    const reach = ((near.top - near.bottom) / 2) * depth;
    Object.assign(backdropCamera, {
      left: -near.half * depth,
      right: near.half * depth,
      top: centre + reach,
      bottom: centre - reach,
    });
    backdropCamera.updateProjectionMatrix();
    const scale = planet / PLANET;
    earth.scale.setScalar(scale);
    coasts.scale.setScalar(scale);
    for (const uniform of sized) uniform.value = planet;
    (air.material as ShaderMaterial).uniforms.thickness.value = Math.sqrt(scale);
    station.position.y = planet - PLANET;
    // band names on their arcs at the right-hand edge; zoomed out the bands
    // sit too close together to name, so the names fade away
    for (const { band, el } of bandLabels) {
      el.style.opacity = String(Math.max(0, 1 - level * 2));
      const r = display((band.minRadius + band.maxRadius) / 2, planet);
      const x = Math.min(half * 0.96, r * Math.cos(0.3));
      const [sx, sy] = screen(x, Math.sqrt(r * r - x * x));
      el.style.transform = `translate(${sx}px, ${sy}px) translate(-100%, -50%)`;
    }
    const [sx, sy] = screen(0, planet);
    stationLabel.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, 0.6rem)`;
    measure();
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    if (width === 0 || height === 0) return;
    // read each time: zoom or a move to another screen changes it
    const shipped = Math.min(window.devicePixelRatio || 1, 2);
    const ratio = profiler?.drawingPixelRatio(width, height, shipped) ?? shipped;
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    for (const layer of [starPoints, satellites, station]) {
      (layer.material as ShaderMaterial).uniforms.ratio.value = ratio;
    }
    // stars are thinned for the horizon view's scale
    const density = width / (2 * frameAt(0).half) / STAR_SCALE;
    (starPoints.material as ShaderMaterial).uniforms.density.value = Math.min(1, density * density);
    apply(zoom);
  }

  // Label sizes, read again once the webfont has loaded.
  function measure() {
    const named = bandLabels.filter(({ el }) => el.style.opacity !== "0").map(({ el }) => el);
    fixed = [...named, stationLabel].map(boxOf);
    for (const entry of labels.values()) entry.width = entry.el.offsetWidth;
  }
  document.fonts?.ready.then(measure);

  const screen = (x: number, y: number): [number, number] => [
    ((x + half) / (2 * half)) * width,
    ((top - y) / (top - bottom)) * height,
  ];

  new ResizeObserver(resize).observe(canvas);
  resize();

  // ── per-frame buffers, grown as the sky fills ──
  let capacity = 0;
  let pointBuffers: { position: Float32Array; colour: Float32Array; size: Float32Array; core: Float32Array; halo: Float32Array };
  let trailBuffers: { position: Float32Array; tint: Float32Array };

  function grow(needed: number) {
    if (needed <= capacity) return;
    capacity = Math.max(needed, capacity * 2, 32);
    pointBuffers = {
      position: new Float32Array(capacity * 3),
      colour: new Float32Array(capacity * 3),
      size: new Float32Array(capacity),
      core: new Float32Array(capacity),
      halo: new Float32Array(capacity),
    };
    // free the old GPU buffers before replacing them
    const g = satellites.geometry;
    g.dispose();
    g.setAttribute("position", new BufferAttribute(pointBuffers.position, 3).setUsage(DynamicDrawUsage));
    g.setAttribute("colour", new BufferAttribute(pointBuffers.colour, 3).setUsage(DynamicDrawUsage));
    g.setAttribute("size", new BufferAttribute(pointBuffers.size, 1).setUsage(DynamicDrawUsage));
    g.setAttribute("core", new BufferAttribute(pointBuffers.core, 1).setUsage(DynamicDrawUsage));
    g.setAttribute("halo", new BufferAttribute(pointBuffers.halo, 1).setUsage(DynamicDrawUsage));

    const verts = capacity * TRAIL_STEPS * 2;
    trailBuffers = { position: new Float32Array(verts * 3), tint: new Float32Array(verts * 4) };
    const index = new Uint32Array(capacity * (TRAIL_STEPS - 1) * 6);
    for (let s = 0, k = 0; s < capacity; s++) {
      for (let i = 0; i < TRAIL_STEPS - 1; i++) {
        const v = (s * TRAIL_STEPS + i) * 2;
        index.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], k);
        k += 6;
      }
    }
    const t = trails.geometry;
    t.dispose();
    t.setAttribute("position", new BufferAttribute(trailBuffers.position, 3).setUsage(DynamicDrawUsage));
    t.setAttribute("tint", new BufferAttribute(trailBuffers.tint, 4).setUsage(DynamicDrawUsage));
    t.setIndex(new BufferAttribute(index, 1));
  }
  // the buffers exist before the first frame, even for an empty sky
  grow(1);

  const colours = new Map<number, [number, number, number]>();
  const colourOf = (id: number) => {
    let c = colours.get(id);
    if (!c) colours.set(id, (c = satelliteColour(id)));
    return c;
  };
  const amber: [number, number, number] = [AMBER.r, AMBER.g, AMBER.b];

  // Only draw while the scene is on screen; scrolled down to the catalogue,
  // or in a background tab, it rests.
  let onScreen = true;
  new IntersectionObserver(([entry]) => {
    const was = onScreen;
    onScreen = entry.isIntersecting;
    if (onScreen && !was) requestAnimationFrame(frame);
  }).observe(canvas);

  const opened = performance.now();
  const placed: Placed[] = [];
  const ids = new Set<number>();

  // in view, as opposed to near enough that its trail might be
  const inView = (p: Placed) => Math.abs(p.x) <= half && p.y > bottom;

  function frame() {
    if (!onScreen) return;
    requestAnimationFrame(frame);
    if (width === 0 || height === 0) return;
    const time = options.now();

    if (zoom !== zoomTo) {
      const t = reduced ? 1 : Math.min(1, (performance.now() - zoomStart) / ZOOM_MS);
      const eased = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      zoom = t === 1 ? zoomTo : zoomFrom + (zoomTo - zoomFrom) * eased;
      apply(zoom);
    }

    const margin = TRAIL_MAX * display(BANDS.high.maxRadius, planet);
    placed.length = 0;
    ids.clear();
    let mine: Placed | null = null;
    let count = 0;
    for (const sat of options.sky()) {
      count++;
      ids.add(sat.id);
      const angle = angleAt(sat, time);
      const [x, y] = place(sat.radius, angle, planet);
      const p = { sat, angle, x, y, overhead: isOverhead(sat, time) };
      if (sat.mine) mine = p;
      if (Math.abs(x) <= half + margin && y > bottom) placed.push(p);
    }
    grow(count);

    // the points
    const { position, colour, size, core, halo } = pointBuffers;
    for (let i = 0; i < placed.length; i++) {
      const p = placed[i];
      const c = p.overhead ? amber : colourOf(p.sat.id);
      position[i * 3] = p.x;
      position[i * 3 + 1] = p.y;
      position[i * 3 + 2] = 0;
      colour[i * 3] = c[0];
      colour[i * 3 + 1] = c[1];
      colour[i * 3 + 2] = c[2];
      core[i] = p.sat.mine ? 3.6 : p.overhead ? 3.2 : 2.4;
      halo[i] = p.sat.mine ? 10 : 0;
      size[i] = p.sat.mine ? 26 : 22;
    }
    const g = satellites.geometry;
    for (const name of ["position", "colour", "size", "core", "halo"]) g.getAttribute(name).needsUpdate = true;
    g.setDrawRange(0, placed.length);

    // the trails: ribbons that taper and fade behind each satellite
    const thick = 3 * ((2 * half) / width);
    const tp = trailBuffers.position;
    const tt = trailBuffers.tint;
    for (let s = 0; s < placed.length; s++) {
      const p = placed[s];
      const arc = Math.min(TRAIL_MAX, (TAU * TRAIL_MS) / p.sat.period);
      const c = colourOf(p.sat.id);
      const d = display(p.sat.radius, planet);
      for (let i = 0; i < TRAIL_STEPS; i++) {
        const t = i / (TRAIL_STEPS - 1);
        const a = p.angle - t * arc;
        const ux = -Math.cos(a);
        const uy = Math.sin(a);
        const w = (thick / 2) * (1 - t * 0.7);
        const v = (s * TRAIL_STEPS + i) * 2;
        tp[v * 3] = ux * (d + w);
        tp[v * 3 + 1] = uy * (d + w);
        tp[v * 3 + 2] = 0;
        tp[v * 3 + 3] = ux * (d - w);
        tp[v * 3 + 4] = uy * (d - w);
        tp[v * 3 + 5] = 0;
        const alpha = 0.5 * (1 - t) ** 1.6;
        for (let k = 0; k < 2; k++) {
          tt[v * 4 + k * 4] = c[0];
          tt[v * 4 + k * 4 + 1] = c[1];
          tt[v * 4 + k * 4 + 2] = c[2];
          tt[v * 4 + k * 4 + 3] = alpha;
        }
      }
    }
    const tg = trails.geometry;
    tg.getAttribute("position").needsUpdate = true;
    tg.getAttribute("tint").needsUpdate = true;
    tg.setDrawRange(0, placed.length * (TRAIL_STEPS - 1) * 6);

    if (profiler) profiler.render(draw);
    else draw();
    // read the panels' boxes before any label is moved, so layout runs once
    const blocked = [...fixed, ...options.obstacles.map(boxOf)];
    label(blocked);
    point(mine, blocked);
  }

  function draw() {
    renderer.clear();
    renderer.render(backdropScene, backdropCamera);
    renderer.render(scene, camera);
  }

  // Every satellite in view is named, unless its label would sit on one
  // already placed, or under the panel: yours first, then those overhead,
  // then those already showing (so labels don't flicker as satellites pass).
  function label(blocked: Box[]) {
    for (const [id, entry] of labels) {
      if (!ids.has(id)) {
        entry.el.remove();
        labels.delete(id);
      }
    }
    const rank = (p: Placed) =>
      (p.sat.mine ? 4 : 0) + (p.overhead ? 2 : 0) + (labels.get(p.sat.id)?.shown ? 1 : 0);
    const order = placed.filter(inView).sort((a, b) => rank(b) - rank(a));
    const taken = [...blocked];
    const visible = new Set<number>();
    for (const p of order) {
      const [x, y] = screen(p.x, p.y);
      let entry = labels.get(p.sat.id);
      if (!entry) {
        const el = document.createElement("span");
        el.className = "sat-label";
        el.textContent = p.sat.callsign;
        overlay.append(el);
        entry = { el, width: el.offsetWidth, shown: false, at: "" };
        labels.set(p.sat.id, entry);
      }
      // to the right of the point, or to its left near the right-hand edge
      const left = x + 14 + entry.width > width ? x - 14 - entry.width : x + 8;
      const box: Box = [left, y - 6 - LABEL_HEIGHT, left + entry.width + 6, y - 6];
      if (taken.some((t) => overlaps(box, t))) continue;
      taken.push(box);
      visible.add(p.sat.id);
      const at = `translate(${Math.round(box[0])}px, ${Math.round(box[1])}px)`;
      if (at !== entry.at) entry.el.style.transform = entry.at = at;
      entry.el.classList.toggle("overhead", p.overhead);
      entry.el.classList.toggle("mine", p.sat.mine);
    }
    for (const [id, entry] of labels) {
      const show = visible.has(id);
      if (show !== entry.shown) {
        entry.shown = show;
        entry.el.classList.toggle("shown", show);
      }
    }
  }

  // Your satellite, when it's out of view: a pointer at the left edge, where
  // it will rise (moved below the panel if that's in the way). Plus a pulse
  // on a satellite you've only just launched.
  let pointed = "";
  function point(mine: Placed | null, blocked: Box[]) {
    if (!mine || inView(mine)) {
      pointer.hidden = true;
    } else {
      pointer.hidden = false;
      const d = display(mine.sat.radius, planet);
      const rise = Math.acos(Math.min(1, half / d));
      const gap = (rise - mine.angle + TAU) % TAU;
      const text = `‹ ${mine.sat.callsign} rises in ${countdown((gap / TAU) * mine.sat.period)}`;
      const [, edge] = screen(-half, Math.sqrt(d * d - half * half));
      let y = edge - 8 - pointer.offsetHeight;
      const box = (at: number): Box => [8, at, 8 + pointer.offsetWidth, at + pointer.offsetHeight];
      for (const b of blocked) if (overlaps(box(y), b)) y = b[3] + 8;
      const state = `${text}|${Math.round(y)}`;
      if (state !== pointed) {
        pointed = state;
        pointer.textContent = text;
        pointer.style.transform = `translate(0.5rem, ${Math.round(y)}px)`;
      }
    }

    const age = performance.now() - opened;
    const show = !reduced && mine !== null && mine.sat.id === options.launched && age < 6000 && inView(mine);
    pulse.hidden = !show;
    if (show && mine) {
      const [x, y] = screen(mine.x, mine.y);
      pulse.style.transform = `translate(${x}px, ${y}px)`;
    }
  }

  requestAnimationFrame(frame);
  return {
    zoom(out: boolean) {
      zoomFrom = zoom;
      zoomTo = out ? 1 : 0;
      zoomStart = performance.now();
    },
  };
}
