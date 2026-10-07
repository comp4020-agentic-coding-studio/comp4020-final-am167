import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  LineSegments,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Points,
  RingGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from "three";
import {
  BAND_EDGES,
  BANDS,
  angleAt,
  burnAt,
  periodNow,
  radiusAt,
  reentryAt,
  type Band,
  type Orbit,
} from "../lib/orbit.ts";
import { OVERHEAD_HALF_WIDTH, STATIONS, isOverhead, type Station, type StationId } from "../lib/stations.ts";
import coastline from "./coastline.json";
import { countdown } from "./countdown.ts";
import { attachPerformanceProfiler } from "./performance-profiler.ts";
import { createReentry } from "./reentry.ts";
import { PLANET_COLOURS, STAR_COLOURS, seeded } from "./starfield.ts";

// The whole planet, with every orbit in view and the three ground stations'
// windows on it (ADR 0014); or the sky as seen from just above one station:
// the planet's limb along the bottom, the three bands stacked over it, and
// satellites rising in on the left, crossing the station's window and
// setting on the right. One continuous zoom between the two.
//
// The simulation is still the flat chart of orbit.ts (PLAN.md, "Dimension"):
// every orbit lies in the screen's plane and the camera is orthographic, so
// this is the same 2D sky, drawn closer up. Three.js only does the drawing.

export interface SceneSatellite extends Orbit {
  id: number;
  // people's satellites are named and coloured; derelicts and debris are
  // grey and unnamed (ADR 0008)
  kind?: "satellite" | "derelict" | "debris";
  callsign: string | null;
  band: Band;
  mine: boolean;
}

// A collision, coming or just happened: when, and where on the chart.
export interface SceneImpact {
  at: number;
  angle: number;
  radius: number;
  // one of the two is the viewer's: the view always follows it
  mine?: boolean;
}

export interface SceneControls {
  // the horizon over a station, or null for the whole planet
  view(station: StationId | null): void;
  // the object drawn nearest a point on the page (a click), if one is close
  // enough to mean it
  pick(clientX: number, clientY: number, reach: number): number | null;
}

export interface SceneOptions {
  canvas: HTMLCanvasElement;
  overlay: HTMLElement;
  sky: () => Iterable<SceneSatellite>;
  now: () => number;
  // a satellite launched just before the page opened, to point out
  launched: number | null;
  // the view it opens on: the horizon over a station, or null for the
  // whole planet
  initial: StationId | null;
  reduced: boolean;
  // elements over the canvas that labels and the pointer keep clear of
  obstacles: HTMLElement[];
  // collisions coming and just past, drawn at their moment on every screen
  impacts?: () => Iterable<SceneImpact>;
  // the object whose history is open (ADR 0012): it wears a wider ring
  selected?: () => number | null;
}

const TAU = Math.PI * 2;

// Over a station the planet is drawn six chart units across, but the orbits
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

// A satellite glows as it nears the top of the atmosphere, over this long
// before its plunge begins.
const HEATING_MS = 150_000;
const EMBER: [number, number, number] = [1, 0.16, 0.02];

// How long a trail is, in time behind the satellite, and its longest arc.
const TRAIL_MS = 36_000;
const TRAIL_MAX = 0.35;
const TRAIL_STEPS = 28;

// Seen from the other side of the chart's plane, so satellites cross left to
// right; Canberra is at the top either way.
const place = (radius: number, angle: number, planet: number): [number, number] => {
  const d = display(radius, planet);
  return [-d * Math.cos(angle), d * Math.sin(angle)];
};

// A collision: a pulsing ring where it will happen, over the last WARN_MS
// before it, then a flash, rings and sparks over FLASH_MS (sparks SPARK_MS).
const WARN_MS = 30_000;
const FLASH_MS = 6_000;
const SPARK_MS = 2_600;
const SPARKS = 40;
const EMBER_GLOW: [number, number, number] = [1, 0.45, 0.12];
// following a collision: how long before it the view turns, how long it
// holds after, how quickly it turns (ms), and how often for others'
const PAN = { lead: 5_000, hold: 5_000, ease: 380, every: 30_000 };
const GREY: [number, number, number] = [0.42, 0.45, 0.5];
const DERELICT: [number, number, number] = [0.55, 0.5, 0.44];
const FLASH: [number, number, number] = [1, 0.92, 0.8];

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

// ── the chart over the horizon: bands and the stations' windows ────────────

// The bands are ranges of one continuous height (ADR 0007): each is a faint
// wash from where it meets the band below to where it meets the one above,
// with a soft line where they meet, so a falling orbit is seen to cross from
// one into the next. Drawn by height above the planet, so they follow it as
// the view zooms.
function bands(): Mesh {
  const geometry = new RingGeometry(WHOLE * 0.5, display(BANDS.high.maxRadius) + 0.5, 512, 1);
  const material = new ShaderMaterial({
    uniforms: {
      colour: { value: new Color("#3a5781") },
      radius: { value: PLANET },
      // the heights where low meets mid and mid meets high, and the top of
      // the high band's reach
      edges: { value: new Vector3(BAND_EDGES.lowTop - 1, BAND_EDGES.midTop - 1, BANDS.high.maxRadius - 1) },
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
      uniform vec3 edges;
      varying vec2 vPos;
      void main() {
        float h = length(vPos) - radius;
        if (h < 0.0) discard;
        // low, mid and high washes, the middle one a touch stronger so the
        // three read apart, fading out over the top of the high band
        float wash = h < edges.x ? 0.07 : h < edges.y ? 0.11 : 0.07 * (1.0 - smoothstep(edges.z - 0.2, edges.z + 0.4, h));
        // soft lines where they meet
        float line = exp(-pow((h - edges.x) / 0.012, 2.0)) + exp(-pow((h - edges.y) / 0.012, 2.0));
        float a = wash + line * 0.22;
        if (a < 0.002) discard;
        gl_FragColor = vec4(colour, a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  });
  return new Mesh(geometry, material);
}

// The way up from a station, as drawn (the chart is seen mirrored).
const upAt = (station: Station) => Math.PI - station.angle;

// Anything inside this wedge is over the station, and its beacon is heard.
function stationWindow(station: Station): Mesh {
  const up = upAt(station);
  const geometry = new RingGeometry(WHOLE * 0.5, TOP + 2, 64, 8, up - OVERHEAD_HALF_WIDTH, OVERHEAD_HALF_WIDTH * 2);
  const material = new ShaderMaterial({
    uniforms: {
      colour: { value: AMBER },
      radius: { value: PLANET },
      reach: { value: TOP - PLANET },
      halfWidth: { value: OVERHEAD_HALF_WIDTH },
      up: { value: up },
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
      uniform float up;
      varying vec2 vPos;
      void main() {
        if (length(vPos) < radius) discard;
        float height = (length(vPos) - radius) / reach;
        float rise = clamp(height, 0.0, 1.0);
        float turn = atan(vPos.y, vPos.x) - up;
        float off = abs(atan(sin(turn), cos(turn))) / halfWidth;
        float edge = smoothstep(0.96, 1.0, off) * 0.12;
        // gone a little above the high band, so zoomed out it's a wedge
        // over the orbits, not a beam to the edge of the screen
        float a = (0.045 + edge) * (1.0 - rise * 0.7) * (1.0 - smoothstep(0.85, 1.15, height));
        gl_FragColor = vec4(colour, a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  });
  return new Mesh(geometry, material);
}

// ── satellites and their trails ───────────────────────────────────────────

// With tintedRing, the ring takes the point's colour (and fades with it)
// instead of the fixed ink.
function glowPoints(tintedRing = false): Points {
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
        vec3 colour = vColour * (core + glow) + vec3(1.0) * core * 0.35 + ${tintedRing ? "vColour" : "ring"} * band;
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
  radius: number;
  x: number;
  y: number;
  overhead: boolean;
  // in its last plunge, drawn by reentry.ts
  burning: boolean;
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
  const beams = STATIONS.map(stationWindow);
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
  const impacts = glowPoints(true);
  impacts.frustumCulled = false;
  const sparks = glowPoints();
  sparks.frustumCulled = false;
  const reentry = createReentry(reduced);
  // the stations themselves, on the ground under their windows (placed by
  // apply(), as the planet's size changes)
  const station = glowPoints();
  const each = (values: number[]) => STATIONS.flatMap(() => values);
  station.geometry.setAttribute("position", new Float32BufferAttribute(each([0, 0, 0]), 3));
  station.geometry.setAttribute("colour", new Float32BufferAttribute(each([AMBER.r, AMBER.g, AMBER.b]), 3));
  station.geometry.setAttribute("size", new Float32BufferAttribute(each([30]), 1));
  station.geometry.setAttribute("core", new Float32BufferAttribute(each([3]), 1));
  station.geometry.setAttribute("halo", new Float32BufferAttribute(each([0]), 1));
  station.frustumCulled = false;

  // their geometry changes every frame, so its bounds go stale
  trails.frustumCulled = false;
  satellites.frustumCulled = false;

  // drawn back to front
  backdrop.renderOrder = 0;
  starPoints.renderOrder = 1;
  backdropScene.add(backdrop, starPoints);
  const bandRings = bands();
  const layers = [earth, coasts, air, bandRings, ...beams, trails, ...reentry.layers, station, satellites, impacts, sparks];
  // the ground turns to bring a station to the top, and when the view
  // follows a collision; the orbits are placed turned (place(), with
  // `turn`), and the bands are circles
  const ground = new Group();
  scene.add(ground);
  layers.forEach((layer, i) => {
    layer.renderOrder = i;
    if (layer !== earth && layer !== coasts) layer.position.z = 8;
    if ([earth, coasts, ...beams, station].includes(layer)) ground.add(layer);
    else scene.add(layer);
  });
  const sized = [air, bandRings, ...beams].map((layer) => (layer.material as ShaderMaterial).uniforms.radius);

  // ── the labels over the canvas ──
  type Box = [number, number, number, number];
  const bandLabels = (Object.values(BANDS) as (typeof BANDS)[Band][]).map((band) => {
    const el = document.createElement("span");
    el.className = "band-label";
    el.textContent = band.label;
    overlay.append(el);
    return { band, el };
  });
  const stationLabels = STATIONS.map((s) => {
    const el = document.createElement("span");
    el.className = "station-label";
    el.textContent = s.name;
    overlay.append(el);
    return { station: s, el, width: 0, height: 0, box: null as Box | null, at: "" };
  });
  const pointer = document.createElement("span");
  pointer.className = "your-pointer";
  pointer.hidden = true;
  const pulse = document.createElement("span");
  pulse.className = "launch-pulse";
  pulse.hidden = true;
  overlay.append(pointer, pulse);
  const labels = new Map<number, { el: HTMLSpanElement; width: number; shown: boolean; at: string }>();
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
  let pixelRatio = 1;
  let top = TOP;
  let bottom = 0;
  let planet = PLANET;
  // 0 is the horizon over a station, 1 the whole planet
  let zoom = options.initial ? 0 : 1;
  let zoomFrom = zoom;
  let zoomTo = zoom;
  let zoomStart = 0;
  // the station the horizon is over (and, zoomed out, at the top)
  let viewed = STATIONS.find((s) => s.id === options.initial) ?? STATIONS[0];
  // how far the ground turns to bring it to the top
  const turnFor = (station: Station) => station.angle - Math.PI / 2;

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
    const at = station.geometry.getAttribute("position");
    STATIONS.forEach((s, i) => at.setXYZ(i, (planet + 0.01) * Math.cos(upAt(s)), (planet + 0.01) * Math.sin(upAt(s)), 0));
    at.needsUpdate = true;
    // band names on their arcs at the right-hand edge; zoomed out the bands
    // sit too close together to name, so the names fade away
    for (const { band, el } of bandLabels) {
      el.style.opacity = String(Math.max(0, 1 - level * 2));
      const r = display((band.minRadius + band.maxRadius) / 2, planet);
      const x = Math.min(half * 0.96, r * Math.cos(0.3));
      const [sx, sy] = screen(x, Math.sqrt(r * r - x * x));
      el.style.transform = `translate(${sx}px, ${sy}px) translate(-100%, -50%)`;
    }
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
    pixelRatio = ratio;
    renderer.setSize(width, height, false);
    for (const layer of [starPoints, satellites, station, impacts, sparks]) {
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
    fixed = named.map(boxOf);
    for (const entry of labels.values()) entry.width = entry.el.offsetWidth;
    // (a hidden one reads as no size, and is measured when it shows)
    for (const entry of stationLabels) {
      entry.width = entry.el.offsetWidth;
      entry.height = entry.el.offsetHeight;
    }
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
  const kindOf = (sat: SceneSatellite) => sat.kind ?? "satellite";
  const tintOf = (sat: SceneSatellite) =>
    kindOf(sat) === "debris" ? GREY : kindOf(sat) === "derelict" ? DERELICT : colourOf(sat.id);

  // A layer of glowing points whose buffers grow as needed: the collisions'
  // flashes and rings, and their sparks.
  function glowBuffers(layer: Points) {
    let capacity = 0;
    let buffers = { position: new Float32Array(0), colour: new Float32Array(0), size: new Float32Array(0), core: new Float32Array(0), halo: new Float32Array(0) };
    const names = [["position", 3], ["colour", 3], ["size", 1], ["core", 1], ["halo", 1]] as const;
    return {
      ensure(needed: number) {
        if (needed > capacity) {
          capacity = Math.max(needed, capacity * 2, 8);
          buffers = {
            position: new Float32Array(capacity * 3),
            colour: new Float32Array(capacity * 3),
            size: new Float32Array(capacity),
            core: new Float32Array(capacity),
            halo: new Float32Array(capacity),
          };
          layer.geometry.dispose();
          for (const [name, n] of names) {
            layer.geometry.setAttribute(name, new BufferAttribute(buffers[name], n).setUsage(DynamicDrawUsage));
          }
        }
        return buffers;
      },
      commit(count: number) {
        for (const [name] of names) layer.geometry.getAttribute(name).needsUpdate = true;
        layer.geometry.setDrawRange(0, count);
      },
    };
  }
  const impactGlow = glowBuffers(impacts);
  const sparkGlow = glowBuffers(sparks);
  impactGlow.ensure(1);
  sparkGlow.ensure(1);

  // Sparks thrown out of a collision: most along the two orbits that met,
  // the rest any way. From a generator seeded by the collision, so every
  // screen throws the same spray.
  const sprays = new Map<number, { angle: number; speed: number; size: number; hot: number }[]>();
  function sprayOf(at: number) {
    let spray = sprays.get(at);
    if (spray) return spray;
    const random = seeded(Math.floor(at) % 2_147_483_647);
    spray = Array.from({ length: SPARKS }, () => {
      const along = random() < 0.7;
      const spread = (random() - 0.5) * (along ? 0.9 : 2 * Math.PI);
      return {
        // relative to the orbit's way, either way along it
        angle: (along ? (random() < 0.5 ? 0 : Math.PI) : 0) + spread,
        speed: 60 + random() * 200,
        size: 5 + random() * 6,
        hot: random(),
      };
    });
    if (sprays.size > 50) sprays.clear();
    sprays.set(at, spray);
    return spray;
  }

  // Collisions coming (a ring pulsing where they'll meet) and just happened:
  // a white-hot flash that cools to orange, two shock rings racing out, and
  // a spray of sparks. All from the predicted moment, so every screen sees
  // it at once.
  function drawImpacts(time: number) {
    const px = (2 * half) / width;
    const glows: { x: number; y: number; colour: number[]; core: number; halo: number; size: number }[] = [];
    const sparksShown: { x: number; y: number; colour: number[]; size: number }[] = [];
    flashAt = null;
    for (const impact of options.impacts?.() ?? []) {
      const since = time - impact.at;
      if (since <= -WARN_MS || since >= FLASH_MS) continue;
      const angle = impact.angle - turn;
      const [x, y] = place(impact.radius, angle, planet);
      if (since < 0) {
        // coming: a ring, pulsing faster and brighter as it nears
        const near = 1 + since / WARN_MS;
        const beat = reduced ? 0.6 : 0.5 + 0.5 * Math.sin(time / (260 - 180 * near));
        glows.push({ x, y, colour: amber.map((v) => v * (0.3 + 0.7 * near) * beat), core: 0.01, halo: 10, size: 26 });
        continue;
      }
      const t = since / FLASH_MS;
      // the flash: white-hot for an instant, cooling to an orange glow
      const white = Math.max(0, 1 - since / 900);
      const glow = (1 - t) ** 2;
      const hot = FLASH.map((v, k) => (v * white + EMBER_GLOW[k] * (1 - white)) * (1.4 + 4 * white) * glow);
      glows.push({ x, y, colour: hot, core: reduced ? 6 : 5 + 40 * white ** 1.5 + 5 * glow, halo: 0, size: reduced ? 40 : 80 + 220 * white });
      if (!reduced) {
        // a fast shock ring, and a slower, fainter one behind it
        const fast = Math.min(1, since / 1400);
        if (fast < 1) {
          glows.push({ x, y, colour: FLASH.map((v) => v * 1.4 * (1 - fast) ** 1.5), core: 0.01, halo: 12 + 130 * Math.sqrt(fast), size: 2 * (12 + 130 * Math.sqrt(fast)) + 20 });
        }
        glows.push({ x, y, colour: EMBER_GLOW.map((v) => v * 0.9 * glow), core: 0.01, halo: 10 + 70 * Math.sqrt(t), size: 2 * (10 + 70 * Math.sqrt(t)) + 20 });
        // and the sparks, slowing as they go, cooling from white to red
        if (since < SPARK_MS) {
          const s = since / SPARK_MS;
          // the orbit's way here, on screen (the chart is seen mirrored)
          const way = Math.PI / 2 - angle;
          const travelled = (1 - Math.exp(-since / 600)) * 0.6;
          for (const spark of sprayOf(impact.at)) {
            const dir = way + spark.angle;
            const d = spark.speed * travelled * px;
            const fade = (1 - s) ** 1.5;
            const cool = Math.min(1, s * 1.5 + spark.hot * 0.3);
            const c = FLASH.map((v, k) => (v * (1 - cool) + EMBER[k] * cool) * fade * 1.8);
            sparksShown.push({ x: x + d * Math.cos(dir), y: y + d * Math.sin(dir), colour: c, size: spark.size * (1 - 0.5 * s) });
          }
        }
        if (since < 900) flashAt = { x, y, strength: (1 - since / 900) ** 2 };
      }
    }
    const g = impactGlow.ensure(glows.length);
    glows.forEach((p, i) => {
      g.position.set([p.x, p.y, 0], i * 3);
      g.colour.set(p.colour, i * 3);
      g.core[i] = p.core;
      g.halo[i] = p.halo;
      g.size[i] = p.size;
    });
    impactGlow.commit(glows.length);
    const sp = sparkGlow.ensure(sparksShown.length);
    sparksShown.forEach((p, i) => {
      sp.position.set([p.x, p.y, 0], i * 3);
      sp.colour.set(p.colour, i * 3);
      sp.core[i] = 1.6;
      sp.halo[i] = 0;
      sp.size[i] = p.size;
    });
    sparkGlow.commit(sparksShown.length);
  }

  // ── following a collision ──
  // A few seconds before a collision out of view, the planet turns to bring
  // it over the middle of the screen, holds through the flash, then turns
  // back to the station in view. Yours always; anyone else's at most once every
  // PAN.every, so a busy sky doesn't keep swinging. Not when zoomed out
  // (it's all in view) or for reduced motion.
  let turn = turnFor(viewed);
  let following: SceneImpact | null = null;
  let lastFollowed = -Infinity;
  let lastFrame = performance.now();
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  function follow(time: number) {
    const now = performance.now();
    const dt = Math.min(100, now - lastFrame);
    lastFrame = now;
    if (following && time > following.at + PAN.hold) following = null;
    if (!following && !reduced && zoomTo === 0) {
      for (const impact of options.impacts?.() ?? []) {
        const until = impact.at - time;
        if (until < 0 || until > PAN.lead) continue;
        // in view already, over the station in view?
        const d = display(impact.radius, planet);
        const seen = Math.asin(Math.min(1, (half * 0.8) / d));
        if (Math.abs(wrap(impact.angle - viewed.angle)) < seen) continue;
        if (!impact.mine && time - lastFollowed < PAN.every) continue;
        following = impact;
        lastFollowed = time;
        if (impact.mine) break;
      }
    }
    // with reduced motion the view stays put, and an arrow at the edge says
    // where a collision is about to happen
    if (reduced) {
      let off: SceneImpact | null = null;
      for (const impact of zoomTo === 0 ? (options.impacts?.() ?? []) : []) {
        const until = impact.at - time;
        const d = display(impact.radius, planet);
        const seen = Math.asin(Math.min(1, (half * 0.8) / d));
        if (until > -2_000 && until < PAN.lead && Math.abs(wrap(impact.angle - viewed.angle)) >= seen) off = impact;
      }
      aside.hidden = !off;
      if (off) {
        const right = wrap(off.angle - viewed.angle) > 0;
        aside.textContent = right ? "Collision out of view ›" : "‹ Collision out of view";
        aside.style.transform = right
          ? `translate(${Math.round(width - 8 - aside.offsetWidth)}px, 3.5rem)`
          : "translate(0.5rem, 3.5rem)";
      }
    }
    // back to the station in view when it isn't following one
    const target = wrap(following ? following.angle - Math.PI / 2 : turnFor(viewed));
    const step = 1 - Math.exp(-dt / PAN.ease);
    turn = reduced || Math.abs(wrap(target - turn)) < 1e-4 ? target : wrap(turn + wrap(target - turn) * step);
    ground.rotation.z = turn;
    nameStations();
  }

  // Each station's name, just inside the planet under its window, going
  // round with the ground. Hidden while off screen.
  function nameStations() {
    for (const entry of stationLabels) {
      const up = upAt(entry.station) + turn;
      const [rx, ry] = screen(planet * Math.cos(up), planet * Math.sin(up));
      // in from the rim, towards the planet's centre (y is down on screen)
      const gap = 10 + entry.height / 2;
      const x = rx - Math.cos(up) * gap - entry.width / 2;
      const y = ry + Math.sin(up) * gap - entry.height / 2;
      const shown = x > -entry.width && x < width && y > -entry.height && y < height;
      entry.box = shown ? [x, y, x + entry.width, y + entry.height] : null;
      const at = shown ? `translate(${Math.round(x)}px, ${Math.round(y)}px)` : "hidden";
      if (at === entry.at) continue;
      entry.at = at;
      entry.el.hidden = !shown;
      if (!shown) continue;
      entry.el.style.transform = at;
      // a name measured while hidden has no size: measure it now it shows
      if (entry.width === 0) {
        entry.width = entry.el.offsetWidth;
        entry.height = entry.el.offsetHeight;
        entry.at = "";
      }
    }
  }

  const aside = document.createElement("span");
  aside.className = "impact-pointer";
  aside.hidden = true;
  overlay.append(aside);

  // a brief brightening of the whole view, around a collision in it
  let flashAt: { x: number; y: number; strength: number } | null = null;
  const veil = document.createElement("span");
  veil.className = "impact-veil";
  veil.hidden = true;
  overlay.prepend(veil);
  function brighten() {
    if (!flashAt) {
      veil.hidden = true;
      return;
    }
    const [vx, vy] = screen(flashAt.x, flashAt.y);
    veil.hidden = false;
    veil.style.background = `radial-gradient(circle at ${vx}px ${vy}px, rgb(255 246 228 / ${0.7 * flashAt.strength}), rgb(255 170 90 / ${0.22 * flashAt.strength}) 22%, rgb(255 120 60 / ${0.06 * flashAt.strength}) 50%, transparent 75%)`;
  }

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
  const burning: SceneSatellite[] = [];
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
    burning.length = 0;
    let mine: Placed | null = null;
    let count = 0;
    for (const sat of options.sky()) {
      const falling = reentry.owns(sat, time);
      if (falling) burning.push(sat);
      // burned up: only its wake is left, drawn by reentry.ts
      if (time > reentryAt(sat)) continue;
      count++;
      ids.add(sat.id);
      // as seen while the view is turned to follow a collision
      const angle = angleAt(sat, time) - turn;
      const radius = radiusAt(sat, time);
      const [x, y] = place(radius, angle, planet);
      const p = { sat, angle, radius, x, y, overhead: isOverhead(sat, time), burning: falling };
      if (sat.mine) mine = p;
      if (Math.abs(x) <= half + margin && y > bottom) placed.push(p);
    }
    grow(count);
    // the burning ones are drawn by reentry.ts; the rest as points
    const flying = placed.filter((p) => !p.burning);

    // the points
    const { position, colour, size, core, halo } = pointBuffers;
    const chosen = options.selected?.() ?? null;
    for (let i = 0; i < flying.length; i++) {
      const p = flying[i];
      const kind = kindOf(p.sat);
      const c = p.overhead && kind === "satellite" ? amber : tintOf(p.sat);
      // glowing red as it skims the top of the atmosphere
      const heat = Math.max(0, 1 - (burnAt(p.sat) - time) / HEATING_MS) ** 2;
      position[i * 3] = p.x;
      position[i * 3 + 1] = p.y;
      position[i * 3 + 2] = 0;
      for (let k = 0; k < 3; k++) colour[i * 3 + k] = c[k] + (EMBER[k] - c[k]) * heat;
      // debris is small, a derelict a little smaller than a working satellite
      const small = kind === "debris" ? 0.5 : kind === "derelict" ? 0.8 : 1;
      core[i] = ((p.sat.mine ? 3.6 : p.overhead ? 3.2 : 2.4) + heat) * small;
      halo[i] = p.sat.id === chosen ? 13 : p.sat.mine ? 10 : 0;
      size[i] = p.sat.id === chosen ? 32 + heat * 8 : ((p.sat.mine ? 26 : 22) + heat * 8) * small;
    }
    const g = satellites.geometry;
    for (const name of ["position", "colour", "size", "core", "halo"]) g.getAttribute(name).needsUpdate = true;
    g.setDrawRange(0, flying.length);

    // the trails: ribbons that taper and fade behind each satellite
    const thick = 3 * ((2 * half) / width);
    const tp = trailBuffers.position;
    const tt = trailBuffers.tint;
    for (let s = 0; s < flying.length; s++) {
      const p = flying[s];
      const arc = Math.min(TRAIL_MAX, (TAU * TRAIL_MS) / periodNow(p.sat, time));
      const base = tintOf(p.sat);
      // the light trails are people's; wreckage leaves a faint grey scratch
      const faint = kindOf(p.sat) === "debris" ? 0.35 : kindOf(p.sat) === "derelict" ? 0.5 : 1;
      const heat = Math.max(0, 1 - (burnAt(p.sat) - time) / HEATING_MS) ** 2;
      const c = heat > 0 ? base.map((v, k) => v + (EMBER[k] - v) * heat) : base;
      const d = display(p.radius, planet);
      // behind it, whichever way round it goes (ADR 0008)
      const back = arc * (p.sat.direction ?? 1);
      for (let i = 0; i < TRAIL_STEPS; i++) {
        const t = i / (TRAIL_STEPS - 1);
        const a = p.angle - t * back;
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
        const alpha = 0.5 * faint * (1 - t) ** 1.6;
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
    tg.setDrawRange(0, flying.length * (TRAIL_STEPS - 1) * 6);

    follow(time);
    drawImpacts(time);
    brighten();

    reentry.draw(burning, {
      turn,
      time,
      planet,
      unit: (2 * half) / width,
      // smaller with the planet as the view zooms out
      scale: 1 - 0.5 * zoom,
      ratio: pixelRatio,
    });

    if (profiler) profiler.render(draw);
    else draw();
    // read the panels' boxes before any label is moved, so layout runs once
    const blocked = [
      ...fixed,
      ...stationLabels.flatMap((entry) => (entry.box ? [entry.box] : [])),
      ...options.obstacles.map(boxOf),
    ];
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
    // only people's satellites are named
    const order = placed
      .filter((p) => inView(p) && kindOf(p.sat) === "satellite" && p.sat.callsign)
      .sort((a, b) => rank(b) - rank(a));
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
      entry.el.classList.toggle("burning", p.burning);
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

  // Your satellite, when it's out of view: a pointer at the edge where it
  // will rise, the left for most, the right for one going the other way
  // (moved below the panel if that's in the way). Plus a pulse on a
  // satellite you've only just launched.
  let pointed = "";
  function point(mine: Placed | null, blocked: Box[]) {
    if (!mine || inView(mine)) {
      pointer.hidden = true;
    } else {
      pointer.hidden = false;
      const d = display(mine.radius, planet);
      const rise = Math.acos(Math.min(1, half / d));
      const retrograde = mine.sat.direction === -1;
      // a retrograde orbit rises at the mirror image of the prograde rise
      const gap = retrograde ? (mine.angle - (Math.PI - rise) + TAU) % TAU : (rise - mine.angle + TAU) % TAU;
      const time = options.now();
      const rises = (gap / TAU) * periodNow(mine.sat, time);
      const what = mine.burning
        ? `${mine.sat.callsign} is burning up out of view`
        : time + rises >= burnAt(mine.sat)
          ? `${mine.sat.callsign} burns up before it rises`
          : `${mine.sat.callsign} rises in ${countdown(rises)}`;
      const text = retrograde ? `${what} ›` : `‹ ${what}`;
      const [, edge] = screen(-half, Math.sqrt(d * d - half * half));
      let y = edge - 8 - pointer.offsetHeight;
      const x = retrograde ? width - 8 - pointer.offsetWidth : 8;
      const box = (at: number): Box => [x, at, x + pointer.offsetWidth, at + pointer.offsetHeight];
      for (const b of blocked) if (overlaps(box(y), b)) y = b[3] + 8;
      const state = `${text}|${Math.round(x)}|${Math.round(y)}`;
      if (state !== pointed) {
        pointed = state;
        pointer.textContent = text;
        pointer.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
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
    view(id: StationId | null) {
      const station = STATIONS.find((s) => s.id === id);
      // zoomed out, the planet keeps whichever station was last at the top
      if (station) viewed = station;
      following = null;
      zoomFrom = zoom;
      zoomTo = station ? 0 : 1;
      zoomStart = performance.now();
    },
    pick(clientX, clientY, reach) {
      const rect = canvas.getBoundingClientRect();
      let best: { id: number; d: number } | null = null;
      // what the last frame drew, burning ones included
      for (const p of placed) {
        if (!inView(p)) continue;
        const [x, y] = screen(p.x, p.y);
        const d = Math.hypot(x - (clientX - rect.left), y - (clientY - rect.top));
        if (d <= reach && (!best || d < best.d)) best = { id: p.sat.id, d };
      }
      return best?.id ?? null;
    },
  };
}
