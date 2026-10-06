import {
  AdditiveBlending,
  BufferAttribute,
  CustomBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Mesh,
  Points,
  ShaderMaterial,
} from "three";
import { DECAY, angleAt, burnAt, radiusAt, type Orbit } from "../lib/orbit.ts";
import { seeded } from "./starfield.ts";

// A satellite burning up: what the sky draws for an orbit's last plunge
// through the atmosphere (ADR 0007). Modelled on photographs of real
// re-entries (ATV-1 from a chase plane, Starlink and Long March stages over
// the Americas, Soyuz seen from the ISS): a hot head with a bow-shock glow,
// a long wake that cools from white through orange to red, a breakup into a
// string of fragments that each carry their own tail, sparks shed behind,
// a flare as each piece burns out, and a faint persistent train left hanging
// in the air after the fire has gone.
//
// Everything is a function of the orbit and the server's time, like the rest
// of the sky, so every screen sees the same breakup at the same moment.

export interface BurningOrbit extends Orbit {
  id: number;
}

const PLUNGE = DECAY.plungeMs;
// the wake reaches this far back in time behind a burning piece, in ms
const WAKE_MS = 7_000;
// samples along each wake, denser near the head
const WAKE_STEPS = 44;
// sparks each piece sheds over its life
const SPARKS = { body: 90, fragment: 26 };

// ── what breaks off, and when ─────────────────────────────────────────────

// A piece of the burning object: the body, or a fragment that broke off it.
// Positions are the body's, offset by how much more each fragment slows (it
// falls behind) and sinks.
interface Piece {
  // the share of the plunge (0 to 1) at which it appears and burns out
  start: number;
  end: number;
  // how far it falls behind the body, in radians at the end of the plunge
  lag: number;
  // how much faster it sinks, in planet radii
  sink: number;
  // its size and how hot it burns (0 a dull orange, 1 white)
  size: number;
  heat: number;
  // a little copper or magnesium in it, burning green
  green: boolean;
  seed: number;
}

interface Breakup {
  at: number;
  pieces: Piece[];
}

const breakups = new Map<number, Breakup>();

function breakupOf(id: number): Breakup {
  let found = breakups.get(id);
  if (found) return found;
  const random = seeded(id * 7_919 + 17);
  const between = (a: number, b: number) => a + random() * (b - a);
  // the main breakup, when the heating peaks
  const at = between(0.44, 0.54);
  const pieces: Piece[] = [
    { start: 0, end: 1, lag: 0, sink: 0, size: 1, heat: 1, green: false, seed: random() * 100 },
  ];
  // a few large pieces at the breakup, then smaller ones shed as it goes on
  const large = 3 + Math.floor(random() * 3);
  const small = 4 + Math.floor(random() * 5);
  for (let i = 0; i < large + small; i++) {
    const big = i < large;
    const start = big ? at + between(0, 0.02) : between(at + 0.04, 0.82);
    const size = big ? between(0.55, 0.8) : between(0.25, 0.5);
    pieces.push({
      start,
      // bigger pieces survive longer
      end: Math.min(0.99, start + (big ? between(0.22, 0.42) : between(0.08, 0.2))),
      lag: big ? between(0.12, 0.45) : between(0.3, 0.8),
      sink: between(-0.002, 0.006),
      size,
      heat: between(0.35, 0.85),
      green: random() < 0.12,
      seed: random() * 100,
    });
  }
  found = { at, pieces };
  breakups.set(id, found);
  return found;
}

// How brightly a piece burns at a share s of the plunge: the body heats as
// the air thickens, peaks around the breakup, and fades as it slows; each
// fragment flares just before it's gone.
function glowOf(piece: Piece, breakup: Breakup, s: number): number {
  if (s < piece.start || s > piece.end) return 0;
  const smooth = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const heating = smooth(0, 0.38, s) ** 1.5 * (1 - smooth(0.8, 1, s));
  // the breakup's flash
  const pop = Math.exp(-(((s - breakup.at) / 0.02) ** 2)) * 0.8;
  if (piece.start === 0) return heating * (1 + pop * 0.6);
  const born = smooth(piece.start, piece.start + 0.015, s);
  const dying = 1 - smooth(piece.end - 0.05, piece.end, s);
  const flare = Math.exp(-(((s - (piece.end - 0.025)) / 0.015) ** 2)) * 0.9;
  return Math.max(heating, 0.5) * (0.4 + 0.6 * piece.size) * born * (dying + flare);
}

// ── the colour of hot metal and air ───────────────────────────────────────

// Blackbody-ish, from a deep red through orange and yellow to white, in
// linear light (the renderer turns it into screen colour).
const RAMP: [number, number, number, number][] = [
  [0, 0.25, 0.004, 0.0],
  [0.3, 1.0, 0.12, 0.004],
  [0.6, 1.0, 0.42, 0.06],
  [0.85, 1.0, 0.75, 0.38],
  [1, 1.0, 0.92, 0.8],
];
function hot(t: number, out: number[]): void {
  t = Math.min(1, Math.max(0, t));
  let i = 1;
  while (i < RAMP.length - 1 && RAMP[i][0] < t) i++;
  const [a, ar, ag, ab] = RAMP[i - 1];
  const [b, br, bg, bb] = RAMP[i];
  const k = (t - a) / (b - a);
  out[0] = ar + (br - ar) * k;
  out[1] = ag + (bg - ag) * k;
  out[2] = ab + (bb - ab) * k;
}

// the faint train left in the air, glowing green like an aurora, and the
// green of a fragment with copper in it
const TRAIN = [0.03, 0.2, 0.07];
const GREEN = [0.1, 1.0, 0.2];

// ── drawing ───────────────────────────────────────────────────────────────

// Premultiplied: each fragment adds its light and hides as much of what's
// behind it as its alpha says, so fire over the bright haze stays orange
// instead of washing out to white.
const glowing = {
  blending: CustomBlending,
  blendSrc: OneFactor,
  blendDst: OneMinusSrcAlphaFactor,
  transparent: true,
  depthWrite: false,
  side: DoubleSide,
} as const;

const vertexShared = /* glsl */ `
  attribute vec4 tint;
  attribute vec3 shape;
  varying vec4 vTint;
  varying vec3 vShape;
  void main() {
    vTint = tint;
    vShape = shape;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

// The wakes: ribbons whose shape is (across, age in seconds, seed). Fresh
// wake is a smooth hot line; older wake billows and breaks up.
function wakeMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: vertexShared,
    fragmentShader: /* glsl */ `
      varying vec4 vTint;
      varying vec3 vShape;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      void main() {
        float across = vShape.x;
        float age = vShape.y;
        // a hot core inside a softer glow
        float core = exp(-across * across * 28.0);
        float glow = exp(-across * across * 4.0) * 0.35;
        // turbulence grows as the wake ages
        float churn = noise(vec2(age * 3.0 + vShape.z, across * 2.5 + vShape.z)) * 0.6
          + noise(vec2(age * 9.0 - vShape.z, across * 6.0)) * 0.4;
        float broken = mix(1.0, 0.25 + churn * 1.3, clamp(age / 1.2, 0.0, 1.0));
        float a = vTint.a * (core + glow) * broken;
        // light added, and the bright core hides a little of the air behind
        gl_FragColor = vec4(vTint.rgb * a, min(1.0, vTint.a * core * broken * 0.85));
        #include <colorspace_fragment>
      }`,
    ...glowing,
  });
}

// The heads, halos and flares: quads whose shape is (along, across, kind),
// with along pointing the way the piece is flying.
function glowMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: vertexShared,
    fragmentShader: /* glsl */ `
      varying vec4 vTint;
      varying vec3 vShape;
      void main() {
        float x = vShape.x;
        float y = vShape.y;
        vec3 light;
        float hide;
        if (vShape.z < 0.5) {
          // a head: a sharp bow shock ahead, a glow streaming behind, and a
          // white-hot point
          float dx = x > 0.0 ? x * 3.2 : x * 1.1;
          float body = exp(-(dx * dx + y * y * 9.0) * 3.0);
          float point = exp(-(x * x * 4.0 + y * y * 30.0) * 12.0);
          light = vTint.rgb * body + vec3(1.0, 0.96, 0.9) * point * 1.4;
          hide = (body * 0.7 + point) * 0.9;
        } else if (vShape.z < 1.5) {
          // a halo: the air around the fire lit up, light only
          float r2 = x * x + y * y;
          light = vTint.rgb * exp(-r2 * 5.0) * (1.0 - smoothstep(0.7, 1.0, sqrt(r2)));
          hide = 0.0;
        } else {
          // a flare: a burst with a soft fringe, light only
          float r2 = x * x + y * y;
          light = vTint.rgb * (exp(-r2 * 30.0) * 1.4 + exp(-r2 * 7.0) * 0.4);
          hide = 0.0;
        }
        gl_FragColor = vec4(light * vTint.a, min(1.0, hide * vTint.a));
        #include <colorspace_fragment>
      }`,
    ...glowing,
  });
}

function sparkMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ratio: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec4 tint;
      attribute float size;
      uniform float ratio;
      varying vec4 vTint;
      void main() {
        vTint = tint;
        gl_PointSize = size * ratio;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec4 vTint;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = exp(-d * d * 4.0) * vTint.a;
        gl_FragColor = vec4(vTint.rgb * a, 1.0);
        #include <colorspace_fragment>
      }`,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
}

// A growable set of dynamic attributes behind one geometry.
class Buffers {
  geometry = new BufferGeometry();
  private capacity = 0;
  arrays: Record<string, Float32Array> = {};
  constructor(
    private layout: Record<string, number>,
    private indexed: ((capacity: number) => Uint32Array) | null,
    private perItem: number,
  ) {}
  ensure(items: number): void {
    if (items <= this.capacity) return;
    this.capacity = Math.max(items, this.capacity * 2, 16);
    this.geometry.dispose();
    for (const [name, size] of Object.entries(this.layout)) {
      this.arrays[name] = new Float32Array(this.capacity * this.perItem * size);
      this.geometry.setAttribute(name, new BufferAttribute(this.arrays[name], size).setUsage(DynamicDrawUsage));
    }
    if (this.indexed) this.geometry.setIndex(new BufferAttribute(this.indexed(this.capacity), 1));
  }
  commit(drawn: number): void {
    for (const name of Object.keys(this.layout)) this.geometry.getAttribute(name).needsUpdate = true;
    this.geometry.setDrawRange(0, drawn);
  }
}

// two triangles per step of a ribbon, or per quad
const ribbonIndex = (steps: number) => (capacity: number) => {
  const index = new Uint32Array(capacity * (steps - 1) * 6);
  for (let r = 0, k = 0; r < capacity; r++) {
    for (let i = 0; i < steps - 1; i++) {
      const v = (r * steps + i) * 2;
      index.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], k);
      k += 6;
    }
  }
  return index;
};

export interface ReentryFrame {
  // the server's time
  time: number;
  // the planet's drawn radius, in scene units
  planet: number;
  // scene units per CSS pixel
  unit: number;
  // how much to shrink the effect (1 over the station, less zoomed out)
  scale: number;
  // the device pixel ratio the canvas draws at
  ratio: number;
}

export interface Reentry {
  layers: (Mesh | Points)[];
  // whether an orbit is burning or has burned (so the sky draws it here,
  // not as an ordinary satellite)
  owns(orbit: Orbit, time: number): boolean;
  draw(burning: Iterable<BurningOrbit>, frame: ReentryFrame): void;
}

export function createReentry(reduced: boolean): Reentry {
  const wakes = new Buffers({ position: 3, tint: 4, shape: 3 }, ribbonIndex(WAKE_STEPS), WAKE_STEPS * 2);
  const glows = new Buffers({ position: 3, tint: 4, shape: 3 }, ribbonIndex(2), 4);
  const sparks = new Buffers({ position: 3, tint: 4, size: 1 }, null, 1);
  const wakeMesh = new Mesh(wakes.geometry, wakeMaterial());
  const glowMesh = new Mesh(glows.geometry, glowMaterial());
  const sparkPoints = new Points(sparks.geometry, sparkMaterial());
  for (const layer of [wakeMesh, glowMesh, sparkPoints]) layer.frustumCulled = false;
  wakes.ensure(1);
  glows.ensure(1);
  sparks.ensure(1);

  const colour = [0, 0, 0];

  // Where a piece is at a time: its point and the way it's flying, in scene
  // coordinates. The chart is seen from the other side (scene.ts), so x is
  // mirrored.
  function at(orbit: BurningOrbit, piece: Piece, time: number, planet: number, out: number[]): void {
    const burn = burnAt(orbit);
    const s = Math.min(1, Math.max(0, (time - burn) / PLUNGE));
    const since = Math.max(0, s - piece.start);
    // a retrograde orbit (ADR 0008) runs the other way, and so do its pieces
    const dir = orbit.direction ?? 1;
    const angle = angleAt(orbit, time) - dir * piece.lag * since * since;
    const radius = radiusAt(orbit, time) - piece.sink * since ** 1.5;
    const d = planet + radius - 1;
    out[0] = -d * Math.cos(angle);
    out[1] = d * Math.sin(angle);
    // the way it's flying: along the orbit (the dive is too shallow to
    // show, and a slow piece's own drift is too small to point by)
    out[2] = dir * Math.sin(angle);
    out[3] = dir * Math.cos(angle);
  }

  const here = [0, 0, 0, 0];
  const there = [0, 0, 0, 0];

  // a cheap, repeatable wobble for the wake as it disperses
  const wobble = (t: number, seed: number) =>
    Math.sin(t * 0.0023 + seed) * 0.6 + Math.sin(t * 0.0061 + seed * 1.7) * 0.4;

  function draw(burning: Iterable<BurningOrbit>, frame: ReentryFrame): void {
    const { time, planet, unit, scale, ratio } = frame;
    (sparkPoints.material as ShaderMaterial).uniforms.ratio.value = ratio;
    const px = unit * scale;
    let wakeCount = 0;
    let glowCount = 0;
    let sparkCount = 0;

    const list: { orbit: BurningOrbit; breakup: Breakup; burn: number }[] = [];
    let pieces = 0;
    for (const orbit of burning) {
      const breakup = breakupOf(orbit.id);
      list.push({ orbit, breakup, burn: burnAt(orbit) });
      pieces += breakup.pieces.length;
    }
    wakes.ensure(pieces);
    glows.ensure(pieces * 3 + list.length * 2);
    sparks.ensure(pieces * SPARKS.body);

    const quad = (x: number, y: number, tx: number, ty: number, along: number, across: number, kind: number, r: number, g: number, b: number, a: number) => {
      const { position, tint, shape } = glows.arrays;
      const v = glowCount * 4;
      const corners = [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ];
      for (let k = 0; k < 4; k++) {
        const [u, w] = corners[k];
        position[(v + k) * 3] = x + tx * u * along - ty * w * across;
        position[(v + k) * 3 + 1] = y + ty * u * along + tx * w * across;
        position[(v + k) * 3 + 2] = 0;
        tint.set([r, g, b, a], (v + k) * 4);
        shape.set([u, w, kind], (v + k) * 3);
      }
      glowCount++;
    };

    for (const { orbit, breakup, burn } of list) {
      const s = (time - burn) / PLUNGE;
      for (const piece of breakup.pieces) {
        const born = burn + piece.start * PLUNGE;
        const died = burn + piece.end * PLUNGE;
        if (time < born) continue;
        // ── the wake: back from the head (or from where it burned out) ──
        const newest = Math.min(time, died);
        const oldest = Math.max(born, time - WAKE_MS);
        if (newest > oldest) {
          const { position, tint, shape } = wakes.arrays;
          for (let i = 0; i < WAKE_STEPS; i++) {
            const k = i / (WAKE_STEPS - 1);
            // denser near the head, where it changes fastest
            const t = newest - (newest - oldest) * k ** 1.6;
            const age = (time - t) / 1000;
            const glow = glowOf(piece, breakup, (t - burn) / PLUNGE);
            at(orbit, piece, t, planet, here);
            // the wake widens and drifts as it ages
            const width = (1.5 + 3.5 * glow + age * 4.5) * piece.size ** 0.5 * px;
            const sway = wobble(t, piece.seed) * Math.min(age, 4) * 2.2 * px;
            const nx = -here[3];
            const ny = here[2];
            const cx = here[0] + nx * sway;
            const cy = here[1] + ny * sway;
            const v = (wakeCount * WAKE_STEPS + i) * 2;
            position.set([cx + nx * width, cy + ny * width, 0, cx - nx * width, cy - ny * width, 0], v * 3);
            // hot and bright where it was just laid down, cooling to red,
            // leaving a faint green train
            const fire = glow * Math.exp(-age / 0.7);
            const ember = glow * Math.exp(-age / 2.2) * 0.32;
            const train = Math.min(1, glow * 2) * Math.exp(-age / 3.2) * 0.07 * Math.min(1, age / 2.5);
            hot(piece.heat * 0.78 * Math.exp(-age / 0.5), colour);
            if (piece.green) {
              const g = Math.exp(-age / 0.9) * 0.35;
              for (let c = 0; c < 3; c++) colour[c] = colour[c] * (1 - g) + GREEN[c] * g;
            }
            const brightness = fire + ember + train;
            const r = (colour[0] * (fire + ember) + TRAIN[0] * train) / Math.max(brightness, 1e-6);
            const g = (colour[1] * (fire + ember) + TRAIN[1] * train) / Math.max(brightness, 1e-6);
            const b = (colour[2] * (fire + ember) + TRAIN[2] * train) / Math.max(brightness, 1e-6);
            // fade out the very end of the wake, so it never stops abruptly
            const tail = Math.min(1, (1 - k) * 6);
            const alpha = Math.min(0.9, brightness) * tail;
            tint.set([r, g, b, alpha, r, g, b, alpha], v * 4);
            shape.set([-1, age, piece.seed, 1, age, piece.seed], v * 3);
          }
          wakeCount++;
        }

        // ── the head ──
        const glow = glowOf(piece, breakup, s);
        if (glow > 0.002) {
          at(orbit, piece, time, planet, here);
          const flicker = reduced ? 1 : 0.86 + 0.14 * Math.sin(time * 0.037 + piece.seed * 5) * Math.sin(time * 0.053 + piece.seed);
          const g = glow * flicker;
          hot(0.35 + 0.45 * piece.heat * Math.min(1, glow), colour);
          if (piece.green) {
            colour[0] = colour[0] * 0.5 + GREEN[0] * 0.5;
            colour[1] = colour[1] * 0.5 + GREEN[1] * 0.5;
            colour[2] = colour[2] * 0.5 + GREEN[2] * 0.5;
          }
          const size = piece.size * (0.6 + 0.8 * Math.min(1, glow));
          quad(here[0], here[1], here[2], here[3], (10 + 34 * g) * size * px, (3.5 + 6 * g) * size * px, 0, colour[0], colour[1], colour[2], Math.min(1, g));
          if (piece.start === 0) {
            // the air lit up around the body: a warm glow, and the plasma
            // sheath close in
            quad(here[0], here[1], here[2], here[3], (30 + 56 * g) * px, (18 + 30 * g) * px, 1, 1.0, 0.22, 0.03, g * 0.2);
            quad(here[0], here[1], here[2], here[3], (12 + 16 * g) * px, (7 + 9 * g) * px, 1, 1.0, 0.32, 0.1, g * 0.5);
          }
        }

        // ── its flare as it burns out ──
        const since = (time - died) / 1000;
        if (piece.start > 0 && since >= 0 && since < 0.6) {
          at(orbit, piece, died, planet, there);
          const f = (1 - since / 0.6) ** 2;
          const size = (10 + 26 * piece.size) * (0.6 + since) * px;
          hot(0.8, colour);
          quad(there[0], there[1], there[2], there[3], size, size, 2, colour[0], colour[1], colour[2], f * piece.size);
        }

        // ── sparks shed behind it ──
        if (!reduced) {
          const n = piece.start === 0 ? SPARKS.body : SPARKS.fragment;
          const random = seeded(Math.floor(piece.seed * 1000) + orbit.id);
          const { position, tint, size } = sparks.arrays;
          for (let j = 0; j < n; j++) {
            const when = born + ((j + random()) / n) * (died - born);
            const life = 400 + random() * 1300;
            const spread = random() * 2 - 1;
            const kick = random();
            const age = time - when;
            if (age < 0 || age > life) continue;
            const glowThen = glowOf(piece, breakup, (when - burn) / PLUNGE);
            if (glowThen < 0.05) continue;
            at(orbit, piece, when, planet, there);
            const a = age / 1000;
            // thrown a little ahead, then dragged to a stop and falling
            const ahead = (1 - Math.exp(-a * 4)) * (10 + 25 * kick) * px;
            const side = spread * a * 22 * px;
            const fall = a * a * 14 * px;
            const nx = -there[3];
            const ny = there[2];
            // which way is down, towards the planet's centre
            const dl = Math.hypot(there[0], there[1]);
            const v = sparkCount++;
            position[v * 3] = there[0] + there[2] * ahead + nx * side - (there[0] / dl) * fall;
            position[v * 3 + 1] = there[1] + there[3] * ahead + ny * side - (there[1] / dl) * fall;
            position[v * 3 + 2] = 0;
            const left = 1 - age / life;
            hot(0.25 + 0.6 * left * piece.heat, colour);
            tint.set([colour[0], colour[1], colour[2], left * left * Math.min(0.8, glowThen)], v * 4);
            size[v] = (2 + 3 * kick * left) * scale;
          }
        }
      }

      // ── the breakup's flash ──
      const sinceBreak = (time - (burn + breakup.at * PLUNGE)) / 1000;
      if (sinceBreak >= 0 && sinceBreak < 0.8) {
        at(orbit, breakup.pieces[0], burn + breakup.at * PLUNGE, planet, there);
        const f = (1 - sinceBreak / 0.8) ** 2;
        const size = (34 + 70 * sinceBreak) * px;
        quad(there[0], there[1], there[2], there[3], size, size, 2, 1.0, 0.85, 0.6, f * 0.8);
      }
    }

    wakes.commit(wakeCount * (WAKE_STEPS - 1) * 6);
    glows.commit(glowCount * 6);
    sparks.commit(sparkCount);
  }

  return {
    layers: [wakeMesh, sparkPoints, glowMesh],
    owns: (orbit, time) => time >= burnAt(orbit),
    draw,
  };
}
