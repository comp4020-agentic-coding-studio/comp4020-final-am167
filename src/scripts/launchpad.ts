import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CustomBlending,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  DynamicDrawUsage,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PerspectiveCamera,
  PointLight,
  Points,
  Quaternion,
  Scene,
  ShaderMaterial,
  Shape,
  SphereGeometry,
  SpotLight,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { attachPerformanceProfiler, forcesContinuousRendering } from "./performance-profiler.ts";
import { PLANET_COLOURS, STAR_COLOURS, seeded } from "./starfield.ts";

// The launchpad at dusk: a rocket on its pad by a lattice tower, under
// searchlights, with hills going dark against the afterglow. Launching plays
// the real thing: ignition and a ground cloud, the hold-downs letting go, the
// rocket clearing the tower and pitching over into its gravity turn, its
// plume lit by a sun the ground can no longer see. The camera follows it up
// and pulls back until the ground is the planet's limb, the view the sky page
// opens on, so the page change is a short fade between two shots of the same
// sky.
//
// The pad sits on top of a planet R across, so the ground the camera starts
// on is the limb it ends looking at. Distances are in units of about ten
// metres; the planet is not to scale.

export interface Framing {
  // where the rocket stands, in CSS pixels from the canvas's top left: its
  // axis, the ground under it, and how tall it is drawn
  x: number;
  y: number;
  height: number;
}

export interface Telemetry {
  // seconds since ignition, kilometres up and kilometres a second
  time: number;
  altitude: number;
  speed: number;
}

export interface PadOptions {
  canvas: HTMLCanvasElement;
  frame: (width: number, height: number) => Framing;
  reduced: boolean;
  // the scene stopped drawing (a shader failed, or the GPU took the context
  // back), so the page can show its drawn rocket instead
  lost: () => void;
}

export interface PadControls {
  // plays the launch, reporting its progress; resolves once the camera has
  // reached the view from orbit
  launch(onTelemetry: (t: Telemetry) => void): Promise<void>;
}

const R = 1000;
const CENTRE = new Vector3(0, -R, 0);
// a sun just under the western horizon: dusk at the pad, day higher up
const SUN = new Vector3(-1, -0.09, -0.32).normalize();

// The rocket, from the bottom of its nozzle to its nose, standing on the
// mount; the tower's lightning mast is the tallest thing on the pad.
const MOUNT = 0.55;
const ROCKET_TOP = MOUNT + 5.25;
const MAST = 7.4;
const FOV = 32;

// The launch, in seconds from ignition.
const LIFTOFF = 1.3;
// the camera starts its pull-back to orbit, and arrives
const PULL = 3.0;
const ARRIVE = 6.3;
// how far along its path the rocket is, τ seconds after liftoff: a slow
// clearing of the tower, then the acceleration of a lightening rocket
const travelled = (τ: number) => 1.6 * τ * τ + 1.2 * τ ** 3.6;
// the gravity turn: straight up until clear of the pad, then pitching
// eastward (right, the way satellites cross the sky page)
const pitchAt = (s: number) => (s < 8 ? 0 : 1.4 * (1 - Math.exp(-(s - 8) / 170)));
// a scene unit, in kilometres, for the telemetry, and a unit a second in
// kilometres a second (the climb is sped up, so speeds are scaled to read
// true: about 8 km/s at the end, near orbital speed)
const KM = 0.55;
const SPEED = 0.024;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Shared GLSL: value noise and fractal noise.
const NOISE = /* glsl */ `
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
  }`;

const FINISH = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

// Premultiplied alpha: smoke both hides what's behind it and glows.
const premultiplied = {
  blending: CustomBlending,
  blendSrc: OneFactor,
  blendDst: OneMinusSrcAlphaFactor,
  transparent: true,
  depthWrite: false,
} as const;

// ── the rocket's path ─────────────────────────────────────────────────────

// Where the rocket's base is, and its pitch, a distance s along its path,
// integrated once in steps of half a unit.
const PATH_STEP = 0.5;
const path: { x: number; y: number; pitch: number }[] = [];
{
  let x = 0;
  let y = 0;
  for (let s = 0; s <= 2000; s += PATH_STEP) {
    const pitch = pitchAt(s);
    path.push({ x, y, pitch });
    x += Math.sin(pitch) * PATH_STEP;
    y += Math.cos(pitch) * PATH_STEP;
  }
}
function along(s: number) {
  const i = Math.min(path.length - 2, Math.max(0, s / PATH_STEP));
  const a = path[Math.floor(i)];
  const b = path[Math.floor(i) + 1];
  const t = i - Math.floor(i);
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), pitch: lerp(a.pitch, b.pitch, t) };
}

// ── the sky, the stars and the planet ─────────────────────────────────────

// The dusk sky, drawn around the camera: warm low in the west, deepening to
// night overhead, a few streaks of cloud lit from beneath. It thins to space
// as the camera climbs.
function skyDome(): Mesh {
  const material = new ShaderMaterial({
    uniforms: {
      centre: { value: CENTRE },
      radius: { value: R },
      air: { value: 1 },
      sun: { value: SUN },
      zenith: { value: new Color("#030716") },
      high: { value: new Color("#0b1838") },
      mid: { value: new Color("#232a58") },
      mauve: { value: new Color("#4f3a66") },
      glow: { value: new Color("#ff8642") },
      space: { value: new Color(PLANET_COLOURS.space) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 centre;
      uniform float radius;
      uniform float air;
      uniform vec3 sun;
      uniform vec3 zenith, high, mid, mauve, glow, space;
      varying vec3 vWorld;
      ${NOISE}
      void main() {
        vec3 dir = normalize(vWorld - cameraPosition);
        vec3 up = normalize(cameraPosition - centre);
        float alt = max(length(cameraPosition - centre) - radius, 0.0);
        // elevation above the true horizon, which dips as the camera climbs
        float dip = acos(clamp(radius / (radius + alt), 0.0, 1.0));
        float e = asin(clamp(dot(dir, up), -1.0, 1.0)) + dip;
        vec3 flatDir = normalize(dir - up * dot(dir, up) + vec3(1e-5));
        vec3 flatSun = normalize(sun - up * dot(sun, up));
        float toward = pow(dot(flatDir, flatSun) * 0.5 + 0.5, 3.0);
        float h = max(e, 0.0);
        vec3 horizon = mix(mauve, glow, toward);
        vec3 colour = mix(horizon, mid, smoothstep(0.0, 0.2 + 0.12 * toward, h));
        colour = mix(colour, high, smoothstep(0.12, 0.55, h));
        colour = mix(colour, zenith, smoothstep(0.45, 1.3, h));
        colour += glow * toward * exp(-h * 16.0) * 0.7;
        // thin cloud low in the sky, dark against the glow, lit underneath
        float az = atan(dir.x, -dir.z);
        float streak = fbm(vec2(az * 5.0, h * 60.0 + az * 2.0));
        float cloud = smoothstep(0.52, 0.78, streak) * smoothstep(0.01, 0.04, h) * smoothstep(0.17, 0.06, h);
        vec3 cloudColour = mix(vec3(0.05, 0.04, 0.08), glow * 1.1, toward * 0.85);
        colour = mix(colour, cloudColour, cloud * 0.75);
        gl_FragColor = vec4(mix(space, colour, air), 1.0);
        ${FINISH}
      }`,
    side: BackSide,
    depthWrite: false,
    depthTest: false,
  });
  const dome = new Mesh(new SphereGeometry(5000, 64, 32), material);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  return dome;
}

// The same stars the sky page shows, on a sphere around the camera, washed
// out low in the dusk and coming out as the air thins.
function stars(): Points {
  const random = seeded(4020);
  const palette = STAR_COLOURS.map(([hex, weight]) => ({ colour: new Color(hex), weight }));
  const pick = () => {
    let r = random();
    for (const p of palette) if ((r -= p.weight) <= 0) return p.colour;
    return palette[2].colour;
  };
  const count = 9000;
  const position = new Float32Array(count * 3);
  const colour = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const twinkle = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // evenly over the sphere
    const z = random() * 2 - 1;
    const a = random() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    position.set([r * Math.cos(a) * 4000, z * 4000, r * Math.sin(a) * 4000], i * 3);
    const bright = random() ** 8;
    const c = pick();
    const glow = 0.3 + bright * 1.8;
    colour.set([c.r * glow, c.g * glow, c.b * glow], i * 3);
    size[i] = 1.2 + bright * 4.5;
    twinkle[i] = random() * 100;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(position, 3));
  geometry.setAttribute("colour", new BufferAttribute(colour, 3));
  geometry.setAttribute("size", new BufferAttribute(size, 1));
  geometry.setAttribute("twinkle", new BufferAttribute(twinkle, 1));
  const material = new ShaderMaterial({
    uniforms: {
      ratio: { value: 1 },
      limit: { value: 64 },
      air: { value: 1 },
      time: { value: 0 },
      centre: { value: CENTRE },
      sun: { value: SUN },
    },
    vertexShader: /* glsl */ `
      attribute vec3 colour;
      attribute float size;
      attribute float twinkle;
      uniform float ratio;
      uniform float limit;
      uniform float air;
      uniform float time;
      uniform vec3 centre;
      uniform vec3 sun;
      varying vec3 vColour;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vec3 dir = normalize(world.xyz - cameraPosition);
        vec3 up = normalize(cameraPosition - centre);
        float e = dot(dir, up);
        // in the air: dimmed near the horizon and towards the afterglow
        float west = max(dot(dir, normalize(sun - up * dot(sun, up))), 0.0);
        float seen = smoothstep(0.04, 0.7, e) * (1.0 - 0.85 * west * west) * (0.35 + 0.65 * smoothstep(0.0, 0.9, e));
        float shimmer = 0.75 + 0.25 * sin(time * 3.0 + twinkle) * air;
        vColour = colour * mix(1.0, seen, air) * shimmer;
        gl_PointSize = min(size * ratio, limit);
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColour;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        gl_FragColor = vec4(vColour * exp(-d * d * 5.0), 1.0);
        ${FINISH}
      }`,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = -5;
  return points;
}

// The planet: dark land at the pad, lit by the engine and the searchlights'
// spill; from orbit, a blue sphere with its day side to the west and a warm
// line along the terminator, as the sky page draws it.
function planet(): Mesh {
  const material = new ShaderMaterial({
    uniforms: {
      sun: { value: SUN },
      air: { value: 1 },
      engine: { value: 0 },
      enginePos: { value: new Vector3() },
      deep: { value: new Color(PLANET_COLOURS.deep) },
      lit: { value: new Color(PLANET_COLOURS.lit) },
      rim: { value: new Color(PLANET_COLOURS.rim) },
      land: { value: new Color("#0d1220") },
      haze: { value: new Color("#2c2440") },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 sun;
      uniform float air;
      uniform float engine;
      uniform vec3 enginePos;
      uniform vec3 deep, lit, rim, land, haze;
      varying vec3 vWorld;
      varying vec3 vNormal;
      ${NOISE}
      void main() {
        vec3 n = normalize(vNormal);
        vec3 toCamera = cameraPosition - vWorld;
        float dist = length(toCamera);
        vec3 v = toCamera / dist;
        float day = dot(n, sun);

        // from orbit
        vec3 orbit = mix(deep, lit * 2.4, smoothstep(-0.04, 0.45, day));
        orbit += vec3(1.0, 0.42, 0.18) * exp(-pow(day / 0.05, 2.0)) * 0.18;
        orbit += rim * pow(1.0 - max(dot(n, v), 0.0), 5.0) * 0.6;

        // on the ground: dark scrub with a little texture, hazing with distance
        vec3 colour = orbit;
        if (air > 0.002) {
          float tex = fbm(vWorld.xz * 0.35) * 0.6 + fbm(vWorld.xz * 0.04) * 0.6;
          vec3 ground = land * (0.55 + 0.7 * tex);
          ground = mix(ground, haze, 1.0 - exp(-dist / 150.0));
          float d = length(vWorld - enginePos);
          ground += vec3(1.0, 0.5, 0.22) * engine * 0.6 / (1.0 + d * d * 0.5);
          colour = mix(orbit, ground, air);
        }

        gl_FragColor = vec4(colour, 1.0);
        ${FINISH}
      }`,
  });
  const mesh = new Mesh(new SphereGeometry(R, 192, 96), material);
  mesh.position.copy(CENTRE);
  return mesh;
}

// The atmosphere's edge seen from orbit: the green airglow line over a blue
// haze, as the sky page draws it, by how close each line of sight passes
// over the planet.
function atmosphere(): Mesh {
  const material = new ShaderMaterial({
    uniforms: {
      centre: { value: CENTRE },
      radius: { value: R },
      shown: { value: 0 },
      air: { value: new Color(PLANET_COLOURS.air) },
      haze: { value: new Color(PLANET_COLOURS.haze) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 centre;
      uniform float radius;
      uniform float shown;
      uniform vec3 air;
      uniform vec3 haze;
      varying vec3 vWorld;
      void main() {
        vec3 d = normalize(vWorld - cameraPosition);
        vec3 o = cameraPosition - centre;
        float down = -dot(o, d);
        float t = max(down, 0.0);
        // the height of the line of sight's lowest point, in planet radii / 6,
        // the sky page's scale; drawn a hair below the surface too, since the
        // faceted sphere's outline falls just inside the true one and would
        // leave a dotted seam on the limb
        float h = (length(o + d * t) - radius) / radius * 6.0;
        if (h < -0.004) discard;
        h = max(h, 0.0);
        float line = exp(-pow((h - 0.07) / 0.022, 2.0)) * 0.5;
        float glow = exp(-h / 0.1) * 0.5 + exp(-h / 0.45) * 0.03;
        // from inside the air, looking up, there's no limb to see
        float limb = smoothstep(0.0, 0.08, down / length(o));
        gl_FragColor = vec4((air * line + haze * glow) * shown * limb, 1.0);
        ${FINISH}
      }`,
    side: BackSide,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new Mesh(new SphereGeometry(R * 1.12, 192, 96), material);
  mesh.position.copy(CENTRE);
  mesh.renderOrder = 1;
  return mesh;
}

// Ridges of hills, each further one paler in the haze, standing on the
// curve of the ground.
function hills(): Group {
  const group = new Group();
  const random = seeded(77);
  const ridges = [
    { radius: 40, height: 2.2, colour: "#0a0d17" },
    { radius: 62, height: 4.5, colour: "#1a1828" },
    { radius: 95, height: 9, colour: "#2b2337" },
  ];
  ridges.forEach((ridge, layer) => {
    const steps = 260;
    const offsets = Array.from({ length: 6 }, () => random() * 100);
    const position: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const a = lerp(-2.1, 2.1, i / steps);
      // a few octaves of sines: rolling hills, the odd sharper peak
      let h = 0;
      for (let k = 0; k < 6; k++) h += Math.sin(a * (3 + k * 4.7) + offsets[k]) / (k + 1.4);
      h = ridge.height * (0.55 + 0.35 * h);
      const r = ridge.radius * (1 + 0.08 * Math.sin(a * 5 + offsets[0]));
      const x = Math.sin(a) * r;
      const z = -Math.cos(a) * r;
      const ground = Math.sqrt(R * R - r * r) - R;
      position.push(x, ground - 3, z, x, ground + Math.max(0.4, h), z);
    }
    const index: number[] = [];
    for (let i = 0; i < steps; i++) {
      const v = i * 2;
      index.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(position), 3));
    geometry.setIndex(index);
    const material = new ShaderMaterial({
      uniforms: { colour: { value: new Color(ridge.colour) }, rimGlow: { value: new Color("#ff9560") }, sun: { value: SUN } },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 colour;
        uniform vec3 rimGlow;
        uniform vec3 sun;
        varying vec3 vWorld;
        void main() {
          // a little of the afterglow on ridges facing west
          float west = max(dot(normalize(vWorld.xz), normalize(sun.xz)), 0.0);
          gl_FragColor = vec4(colour + rimGlow * pow(west, 6.0) * ${(0.02 + layer * 0.025).toFixed(3)}, 1.0);
          ${FINISH}
        }`,
      side: DoubleSide,
    });
    const mesh = new Mesh(geometry, material);
    mesh.renderOrder = -1 - layer;
    group.add(mesh);
  });
  return group;
}

// ── the pad ───────────────────────────────────────────────────────────────

const steel = new MeshStandardMaterial({ color: "#3d4b66", roughness: 0.55, metalness: 0.55 });

// A lattice of struts, each a thin box from one point to another.
function lattice(struts: [Vector3, Vector3][], thickness: number): InstancedMesh {
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), steel, struts.length);
  const m = new Matrix4();
  const q = new Quaternion();
  const s = new Vector3();
  const yAxis = new Vector3(0, 1, 0);
  struts.forEach(([a, b], i) => {
    const d = b.clone().sub(a);
    q.setFromUnitVectors(yAxis, d.clone().normalize());
    s.set(thickness, d.length(), thickness);
    m.compose(a.clone().add(b).multiplyScalar(0.5), q, s);
    mesh.setMatrixAt(i, m);
  });
  return mesh;
}

function tower(): Group {
  const group = new Group();
  const w = 0.45;
  const cx = -1.3;
  const height = 6.3;
  const corners = [
    [cx - w, -w],
    [cx + w, -w],
    [cx + w, w],
    [cx - w, w],
  ];
  const struts: [Vector3, Vector3][] = [];
  const level = 0.7;
  for (const [x, z] of corners) struts.push([new Vector3(x, 0, z), new Vector3(x, height, z)]);
  for (let y = 0; y <= height + 0.01; y += level) {
    for (let i = 0; i < 4; i++) {
      const [x0, z0] = corners[i];
      const [x1, z1] = corners[(i + 1) % 4];
      struts.push([new Vector3(x0, y, z0), new Vector3(x1, y, z1)]);
      if (y + level <= height + 0.01) {
        // a cross on each face, alternating
        const up = Math.round(y / level) % 2 === 0;
        struts.push([new Vector3(x0, up ? y : y + level, z0), new Vector3(x1, up ? y + level : y, z1)]);
      }
    }
  }
  // the lightning mast
  struts.push([new Vector3(cx, height, 0), new Vector3(cx, MAST, 0)]);
  group.add(lattice(struts, 0.06));
  return group;
}

function rocket(): { group: Group; arms: Group[] } {
  const group = new Group();
  const white = new MeshStandardMaterial({ color: "#e8ecf2", roughness: 0.38, metalness: 0.05 });
  const dark = new MeshStandardMaterial({ color: "#161c2a", roughness: 0.6, metalness: 0.2 });
  const metal = new MeshStandardMaterial({ color: "#5a5f6b", roughness: 0.3, metalness: 0.9 });

  const lathe = (points: [number, number][], material: MeshStandardMaterial) =>
    new Mesh(new LatheGeometry(points.map(([r, y]) => new Vector2(r, y)), 48), material);

  group.add(lathe([[0.1, 0], [0.12, -0.08], [0.19, -0.28], [0.24, -0.42]], metal));
  group.add(
    lathe(
      [
        [0.0, 0.0],
        [0.3, 0.0],
        [0.3, 2.9],
        [0.3, 3.15],
        [0.3, 3.9],
        [0.34, 4.05],
        [0.34, 4.55],
        [0.31, 4.8],
        [0.24, 5.0],
        [0.13, 5.17],
        [0.0, 5.25],
      ],
      white,
    ),
  );
  // the interstage, a roll-pattern band and the base of the fairing
  for (const [y0, y1] of [[2.88, 3.17], [0.6, 0.85], [4.02, 4.08]]) {
    const band = new Mesh(new CylinderGeometry(0.306, 0.306, y1 - y0, 48, 1, true), dark);
    band.position.y = (y0 + y1) / 2;
    group.add(band);
  }
  // roll pattern: dark quarters on the first stage, so the roll is visible
  for (let k = 0; k < 2; k++) {
    const quarter = new Mesh(new CylinderGeometry(0.304, 0.304, 1.1, 24, 1, true, k * Math.PI, Math.PI / 2), dark);
    quarter.position.y = 1.55;
    group.add(quarter);
  }
  // four fins
  const fin = new Shape();
  fin.moveTo(0, 0);
  fin.lineTo(0.36, -0.08);
  fin.lineTo(0.36, 0.18);
  fin.lineTo(0, 0.8);
  const finGeometry = new ExtrudeGeometry(fin, { depth: 0.035, bevelEnabled: false });
  finGeometry.translate(0.27, 0, -0.0175);
  for (let k = 0; k < 4; k++) {
    const f = new Mesh(finGeometry, dark);
    f.rotation.y = Math.PI / 4 + (k * Math.PI) / 2;
    group.add(f);
  }

  // the umbilical arms, hinged at the tower; they swing back at ignition
  const arms: Group[] = [];
  for (const y of [2.1, 4.25]) {
    const hinge = new Group();
    hinge.position.set(-0.85, MOUNT + y, 0);
    const arm = new Mesh(new BoxGeometry(0.56, 0.1, 0.22), steel);
    arm.position.x = 0.28;
    hinge.add(arm);
    arms.push(hinge);
  }
  return { group, arms };
}

function padBase(): Group {
  const group = new Group();
  const concrete = new MeshStandardMaterial({ color: "#3a3e48", roughness: 0.95 });
  const slab = new Mesh(new CylinderGeometry(5.5, 6.2, 0.3, 64), concrete);
  slab.position.y = -0.1;
  group.add(slab);
  const trench = new Mesh(new BoxGeometry(1.1, 0.02, 9), new MeshStandardMaterial({ color: "#07090e", roughness: 1 }));
  trench.position.set(0, 0.06, 0);
  group.add(trench);
  // the mount: four posts and a ring of beams
  const posts: [Vector3, Vector3][] = [];
  const c = 0.42;
  const corners = [[-c, -c], [c, -c], [c, c], [-c, c]];
  corners.forEach(([x, z], i) => {
    posts.push([new Vector3(x, 0, z), new Vector3(x, MOUNT, z)]);
    const [x1, z1] = corners[(i + 1) % 4];
    posts.push([new Vector3(x, MOUNT - 0.05, z), new Vector3(x1, MOUNT - 0.05, z1)]);
  });
  group.add(lattice(posts, 0.12));
  return group;
}

// A searchlight's beam: a long soft cone of light in the evening haze.
function beam(from: Vector3, to: Vector3): Mesh {
  const length = 14;
  const geometry = new CylinderGeometry(0.06, 1.6, length, 32, 1, true);
  geometry.translate(0, -length / 2, 0);
  const material = new ShaderMaterial({
    uniforms: { colour: { value: new Color("#bcd2ff") }, length: { value: length }, strength: { value: 1 } },
    vertexShader: /* glsl */ `
      varying float vAlong;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vAlong = -position.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = -mv.xyz;
        vNormal = normalMatrix * normal;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 colour;
      uniform float length;
      uniform float strength;
      varying float vAlong;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float t = vAlong / length;
        float edge = pow(abs(dot(normalize(vNormal), normalize(vView))), 2.0);
        float a = edge * exp(-t * 3.2) * smoothstep(0.0, 0.03, t) * 0.16 * strength;
        gl_FragColor = vec4(colour * a, 1.0);
        ${FINISH}
      }`,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.position.copy(from);
  mesh.quaternion.setFromUnitVectors(new Vector3(0, -1, 0), to.clone().sub(from).normalize());
  mesh.renderOrder = 4;
  return mesh;
}

// ── light that doesn't light anything: glare, lamps, the flame ────────────

// Points of light drawn at a fixed size on screen: the engine's glare, the
// lamps on the masts and the tower's red warning lights.
function glints(count: number): Points {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(count * 3), 3).setUsage(DynamicDrawUsage));
  geometry.setAttribute("colour", new BufferAttribute(new Float32Array(count * 3), 3).setUsage(DynamicDrawUsage));
  geometry.setAttribute("size", new BufferAttribute(new Float32Array(count), 1).setUsage(DynamicDrawUsage));
  geometry.setAttribute("streak", new BufferAttribute(new Float32Array(count), 1).setUsage(DynamicDrawUsage));
  const material = new ShaderMaterial({
    uniforms: { ratio: { value: 1 }, limit: { value: 64 } },
    vertexShader: /* glsl */ `
      attribute vec3 colour;
      attribute float size;
      attribute float streak;
      uniform float ratio;
      uniform float limit;
      varying vec3 vColour;
      varying float vStreak;
      void main() {
        vColour = colour;
        vStreak = streak;
        // some phones draw points no larger than 64 or 256 pixels
        gl_PointSize = min(size * ratio, limit);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColour;
      varying float vStreak;
      void main() {
        vec2 p = (gl_PointCoord - 0.5) * 2.0;
        float r = length(p);
        float core = exp(-r * r * 60.0);
        float halo = exp(-r * 5.0) * 0.35;
        // a lens's horizontal streak through a bright light
        float line = exp(-abs(p.y) * 70.0) * (1.0 - smoothstep(0.0, 1.0, abs(p.x))) * vStreak;
        float a = (core + halo + line) * (1.0 - smoothstep(0.8, 1.0, r * (1.0 - line)));
        gl_FragColor = vec4(vColour * a, 1.0);
        ${FINISH}
      }`,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 20;
  return points;
}

function flame(): Mesh {
  const geometry = new ConeGeometry(0.22, 1, 32, 8, true);
  geometry.rotateX(Math.PI);
  geometry.translate(0, -0.5, 0);
  const material = new ShaderMaterial({
    uniforms: { time: { value: 0 }, power: { value: 0 } },
    vertexShader: /* glsl */ `
      uniform float time;
      varying float vAlong;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vAlong = -position.y;
        vec3 p = position;
        // the plume swells and narrows as it shocks, and flickers
        p.xz *= 1.0 + 0.35 * sin(vAlong * 18.0 - time * 40.0) * vAlong + 0.6 * vAlong;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vView = -mv.xyz;
        vNormal = normalMatrix * normal;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform float power;
      varying float vAlong;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float edge = pow(abs(dot(normalize(vNormal), normalize(vView))), 1.5);
        float t = vAlong;
        vec3 hot = vec3(1.0, 0.95, 0.8);
        vec3 warm = vec3(1.0, 0.55, 0.18);
        vec3 colour = mix(hot * 1.8, warm * 1.1, smoothstep(0.0, 0.5, t));
        float flicker = 0.85 + 0.15 * sin(time * 63.0 + t * 9.0);
        float a = edge * (1.0 - smoothstep(0.3, 1.0, t)) * flicker * power;
        gl_FragColor = vec4(colour * a, 1.0);
        ${FINISH}
      }`,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = 12;
  mesh.frustumCulled = false;
  return mesh;
}

// ── smoke and vapour ──────────────────────────────────────────────────────

const PUFFS = 3200;

function smoke() {
  const position = new Float32Array(PUFFS * 3);
  const colour = new Float32Array(PUFFS * 3);
  const size = new Float32Array(PUFFS);
  const alpha = new Float32Array(PUFFS);
  const seed = new Float32Array(PUFFS);
  const velocity = new Float32Array(PUFFS * 3);
  const age = new Float32Array(PUFFS).fill(1e9);
  const life = new Float32Array(PUFFS).fill(1);
  const growth = new Float32Array(PUFFS);
  const start = new Float32Array(PUFFS);
  // 0 exhaust, 1 cold vapour that sinks
  const kind = new Uint8Array(PUFFS);
  for (let i = 0; i < PUFFS; i++) seed[i] = Math.random() * 10;

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(position, 3).setUsage(DynamicDrawUsage));
  geometry.setAttribute("colour", new BufferAttribute(colour, 3).setUsage(DynamicDrawUsage));
  geometry.setAttribute("size", new BufferAttribute(size, 1).setUsage(DynamicDrawUsage));
  geometry.setAttribute("alpha", new BufferAttribute(alpha, 1).setUsage(DynamicDrawUsage));
  geometry.setAttribute("seed", new BufferAttribute(seed, 1));
  const material = new ShaderMaterial({
    uniforms: { scale: { value: 1 }, limit: { value: 64 } },
    vertexShader: /* glsl */ `
      attribute vec3 colour;
      attribute float size;
      attribute float alpha;
      attribute float seed;
      uniform float scale;
      uniform float limit;
      varying vec3 vColour;
      varying float vAlpha;
      varying float vSeed;
      void main() {
        vColour = colour;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        // a puff the camera is inside, or nearly, would fill the screen
        vAlpha = alpha * smoothstep(size * 0.6, size * 2.5, -mv.z);
        vSeed = seed;
        gl_PointSize = min(size * scale / -mv.z, min(limit, 512.0));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColour;
      varying float vAlpha;
      varying float vSeed;
      ${NOISE}
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float r = length(p) * 2.0;
        float billow = fbm(p * 3.0 + vSeed * 7.0);
        // round, and nothing at all by the sprite's edge
        float a = exp(-r * r * 3.0) * (1.0 - smoothstep(0.55, 1.0, r)) * (0.45 + 0.9 * billow) * vAlpha;
        if (a < 0.003) discard;
        gl_FragColor = vec4(vColour * a, a);
        ${FINISH}
      }`,
    ...premultiplied,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 10;

  let next = 0;
  function emit(at: Vector3, v: Vector3, options: { life: number; size: number; growth: number; kind: number }) {
    const i = next;
    next = (next + 1) % PUFFS;
    position.set([at.x, at.y, at.z], i * 3);
    velocity.set([v.x, v.y, v.z], i * 3);
    age[i] = 0;
    life[i] = options.life;
    start[i] = options.size;
    growth[i] = options.growth;
    kind[i] = options.kind;
  }

  function step(dt: number, engine: number, nozzle: Vector3) {
    const drag = Math.exp(-dt * 1.5);
    for (let i = 0; i < PUFFS; i++) {
      if (age[i] > life[i]) {
        alpha[i] = 0;
        continue;
      }
      age[i] += dt;
      const k = i * 3;
      let vx = velocity[k];
      let vy = velocity[k + 1];
      let vz = velocity[k + 2];
      const x = position[k];
      const z = position[k + 2];
      // the ground, on the planet's curve
      const floor = -(x * x + z * z) / (2 * R) + 0.15;
      if (position[k + 1] < floor + 0.3 && vy < 0) {
        // exhaust hitting the pad is thrown out sideways, mostly down the
        // flame trench, east and west
        const out = Math.hypot(x, z) || 1;
        const trench = Math.abs(x) > Math.abs(z) ? 1 : 0.35;
        // each puff glances off at its own speed, so the cloud rolls out
        // as one mass rather than a row of puffs
        const spread = -vy * (kind[i] === 0 ? 0.25 + 0.75 * Math.random() : 0.3) * trench;
        vx += (x / out) * spread + (Math.random() - 0.5) * spread * 0.6;
        vz += (z / out) * spread + (Math.random() - 0.5) * spread * 0.6;
        vy = -vy * (0.04 + Math.random() * 0.12);
        position[k + 1] = floor + 0.3;
      }
      vx *= drag;
      vy *= drag;
      vz *= drag;
      // hot exhaust rises; cold vapour pours down
      vy += dt * (kind[i] === 0 ? 0.7 : -0.5);
      velocity[k] = vx;
      velocity[k + 1] = vy;
      velocity[k + 2] = vz;
      position[k] += vx * dt;
      position[k + 1] += vy * dt;
      position[k + 2] += vz * dt;

      const t = age[i] / life[i];
      size[i] = start[i] + growth[i] * age[i];
      if (kind[i] === 0) {
        alpha[i] = smooth(0, 0.04, t) * (1 - t) ** 1.4 * 0.45;
        // lit orange by the engine close by, grey-violet by the dusk
        const dx = position[k] - nozzle.x;
        const dy = position[k + 1] - nozzle.y;
        const dz = position[k + 2] - nozzle.z;
        const fire = (engine * 0.45) / (1 + (dx * dx + dy * dy + dz * dz) * 0.5);
        colour[k] = 0.13 + fire * 1.0;
        colour[k + 1] = 0.12 + fire * 0.45;
        colour[k + 2] = 0.16 + fire * 0.15;
      } else {
        alpha[i] = smooth(0, 0.15, t) * (1 - t) ** 2 * 0.14;
        colour[k] = 0.3;
        colour[k + 1] = 0.33;
        colour[k + 2] = 0.42;
      }
    }
    for (const name of ["position", "colour", "size", "alpha"]) geometry.getAttribute(name).needsUpdate = true;
  }

  return { points, emit, step };
}

// The plume left in the sky: grey smoke low down, and higher, where the sun
// still shines though the ground is in shadow, the glowing twilight plume
// launches are photographed for.
const TRAIL = 600;

function plume() {
  const position = new Float32Array(TRAIL * 2 * 3);
  const tint = new Float32Array(TRAIL * 2 * 4);
  const side = new Float32Array(TRAIL * 2);
  for (let i = 0; i < TRAIL; i++) side.set([-1, 1], i * 2);
  const index: number[] = [];
  for (let i = 0; i < TRAIL - 1; i++) {
    const v = i * 2;
    index.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(position, 3).setUsage(DynamicDrawUsage));
  geometry.setAttribute("tint", new BufferAttribute(tint, 4).setUsage(DynamicDrawUsage));
  geometry.setAttribute("side", new BufferAttribute(side, 1));
  geometry.setIndex(index);
  const material = new ShaderMaterial({
    vertexShader: /* glsl */ `
      attribute vec4 tint;
      attribute float side;
      varying vec4 vTint;
      varying float vSide;
      void main() {
        vTint = tint;
        vSide = side;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec4 vTint;
      varying float vSide;
      void main() {
        float a = vTint.a * exp(-vSide * vSide * 3.0);
        gl_FragColor = vec4(vTint.rgb * a, a * 0.8);
        ${FINISH}
      }`,
    ...premultiplied,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 11;

  const samples: { x: number; y: number; time: number }[] = [];
  function add(x: number, y: number, time: number) {
    const last = samples.at(-1);
    if (last && Math.hypot(x - last.x, y - last.y) < 0.25 + y * 0.004) return;
    samples.push({ x, y, time });
    if (samples.length > TRAIL) samples.shift();
  }
  function update(time: number, head: { x: number; y: number } | null) {
    const n = samples.length + (head ? 1 : 0);
    const at = (i: number) => (i < samples.length ? samples[i] : { ...head!, time });
    for (let i = 0; i < n; i++) {
      const p = at(i);
      const prev = at(Math.max(0, i - 1));
      const nextP = at(Math.min(n - 1, i + 1));
      let dx = nextP.x - prev.x;
      let dy = nextP.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      const age = time - p.time;
      const alt = Math.max(0, p.y);
      // the plume spreads as it ages, and far more in thin air
      const width = 0.18 + age * (0.12 + alt * 0.01) + alt * 0.03;
      const v = i * 2;
      position.set([p.x - dy * width, p.y + dx * width, 0, p.x + dy * width, p.y - dx * width, 0], v * 3);
      const sunlit = smooth(18, 70, alt);
      const fromHead = head ? Math.hypot(head.x - p.x, head.y - p.y) : 99;
      const fire = Math.exp(-fromHead / 1.2) * 1.2;
      const r = lerp(0.14, 0.9, sunlit) + fire;
      const g = lerp(0.13, 1.05, sunlit) + fire * 0.5;
      const b = lerp(0.17, 1.4, sunlit) + fire * 0.15;
      const a = Math.min(1, (0.55 - sunlit * 0.15) * Math.exp(-age / 14) * smooth(0, 0.6, fromHead + 0.3));
      for (let k = 0; k < 2; k++) tint.set([r, g, b, a], (v + k) * 4);
    }
    geometry.getAttribute("position").needsUpdate = true;
    geometry.getAttribute("tint").needsUpdate = true;
    geometry.setDrawRange(0, Math.max(0, n - 1) * 6);
  }
  return { mesh, add, update };
}

// ── the scene ─────────────────────────────────────────────────────────────

export function createPad(options: PadOptions): PadControls | null {
  const { canvas, reduced } = options;
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  renderer.setClearColor(PLANET_COLOURS.space);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  // absent unless scripts/performance/run.ts asked for it
  const profiler = attachPerformanceProfiler(renderer, canvas, "launchpad");
  const gl = renderer.getContext();
  const pointLimit = (gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array)[1] || 64;

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.05, 12000);

  const dome = skyDome();
  const starPoints = stars();
  const ground = planet();
  const halo = atmosphere();
  const ridges = hills();
  scene.add(dome, starPoints, ground, halo, ridges, padBase(), tower());

  const { group: ship, arms } = rocket();
  ship.position.y = MOUNT;
  scene.add(ship, ...arms);
  const exhaust = flame();
  exhaust.position.y = -0.4;
  ship.add(exhaust);

  // dusk light: the sky's glow from above, the afterglow low in the west
  scene.add(new HemisphereLight("#5b5f9a", "#140f18", 1.4));
  const afterglow = new DirectionalLight("#ff9a70", 0.9);
  afterglow.position.set(-10, 1.5, -4);
  scene.add(afterglow);
  // the sun itself, which only reaches the rocket once it climbs out of the
  // planet's shadow
  const sunlight = new DirectionalLight("#ffd9b0", 0);
  sunlight.position.copy(SUN).multiplyScalar(100);
  sunlight.target = ship;
  scene.add(sunlight);
  const engineLight = new PointLight("#ff8c3a", 0, 0, 2);
  scene.add(engineLight);

  // two searchlights on masts, crossing on the rocket
  const lamps: Vector3[] = [];
  for (const [x, z] of [[-4.6, 3.6], [4.2, 2.4]]) {
    const head = new Vector3(x, 2.2, z);
    lamps.push(head);
    const pole = lattice([[new Vector3(x, 0, z), head]], 0.08);
    const spot = new SpotLight("#cfe0ff", 140, 0, 0.3, 0.7, 2);
    const aim = new Vector3(0, 3.6, 0);
    spot.position.copy(head);
    spot.target.position.copy(aim);
    // the beam goes on past the rocket, up into the dusk
    scene.add(pole, spot, spot.target, beam(head, new Vector3(-x * 0.35, 9, -z * 0.5)));
  }

  const lights = glints(6);
  scene.add(lights);
  const steam = smoke();
  scene.add(steam.points);
  const trail = plume();
  scene.add(trail.mesh);
  for (const points of [starPoints, lights, steam.points]) {
    (points.material as ShaderMaterial).uniforms.limit.value = pointLimit;
  }

  // ── sizing and framing ──
  let width = 0;
  let height = 0;
  let ratio = 1;
  function resize() {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    if (!width || !height) return;
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    ratio = profiler?.drawingPixelRatio(width, height, ratio) ?? ratio;
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    (starPoints.material as ShaderMaterial).uniforms.ratio.value = ratio;
    (lights.material as ShaderMaterial).uniforms.ratio.value = ratio;
    if (reduced) draw(performance.now() / 1000, 0);
  }
  new ResizeObserver(resize).observe(canvas);

  // The focal length in CSS pixels.
  const focal = () => height / 2 / Math.tan((FOV * Math.PI) / 360);
  const project = new Vector3();

  // Where the camera stands for a framing: back from the pad far enough to
  // draw the rocket at its height, with the view shifted (not turned) so the
  // pad lands where the page wants it.
  function idleCamera(f: Framing) {
    const distance = (focal() * ROCKET_TOP) / Math.max(60, f.height);
    return { position: new Vector3(0.7, 1.3, distance), look: new Vector3(0, ROCKET_TOP * 0.5, 0) };
  }
  function shift(f: Framing, position: Vector3, look: Vector3): [number, number] {
    camera.position.copy(position);
    camera.lookAt(look);
    camera.clearViewOffset();
    camera.updateMatrixWorld();
    project.set(0, 0, 0).project(camera);
    const px = ((project.x + 1) / 2) * width;
    const py = ((1 - project.y) / 2) * height;
    return [px - f.x, py - f.y];
  }

  // ── the launch's state ──
  // seconds since ignition, advanced by the frames actually drawn, so a
  // background tab pauses the launch rather than skipping it
  let flight: number | null = null;
  let report: ((t: Telemetry) => void) | null = null;
  let finished: (() => void) | null = null;
  let last = performance.now() / 1000;
  let launchFrame: Framing | null = null;
  const nozzle = new Vector3();
  const tmp = new Vector3();
  const tmp2 = new Vector3();
  const velocity = new Vector3();

  function draw(now: number, dt: number) {
    if (!width || !height) return;
    const f = options.frame(width, height);
    const t = flight ?? -1;

    // the engine: lit at ignition, near full thrust by liftoff
    const engine = t < 0 ? 0 : smooth(0, 0.9, t) * (0.9 + 0.1 * Math.sin(now * 53) * Math.sin(now * 31));
    const τ = Math.max(0, t - LIFTOFF);
    const s = t < LIFTOFF ? 0 : travelled(τ);
    const p = along(s);
    const altitude = p.y;
    ship.position.set(p.x, MOUNT + p.y, 0);
    ship.rotation.z = -p.pitch;
    // a slow roll onto its heading once clear of the tower
    ship.rotation.y = smooth(10, 60, s) * 1.2;
    nozzle.set(0, -0.42, 0).applyEuler(ship.rotation).add(ship.position);
    arms.forEach((arm, i) => (arm.rotation.y = smooth(0.2 + i * 0.15, 1.1 + i * 0.15, t) * 1.35));

    // exhaust: the plume lengthens and widens as the air thins
    const power = engine * (1 - smooth(LIFTOFF + 4.5, ARRIVE, t) * 0.4);
    const flameMaterial = exhaust.material as ShaderMaterial;
    flameMaterial.uniforms.power.value = power;
    flameMaterial.uniforms.time.value = now;
    const thin = 1 + smooth(30, 250, altitude) * 2.5;
    exhaust.scale.set(thin, (1.1 + engine * 1.0) * (0.8 + thin * 0.3), thin);
    engineLight.position.copy(nozzle).add(tmp.set(0, -0.6, 0));
    engineLight.intensity = power * 160 * (0.85 + 0.15 * Math.random());

    // smoke at the pad: a little cold vapour venting before launch, then the
    // ground cloud, thinning as the rocket climbs away
    if (dt > 0) {
      if (t < LIFTOFF + 0.5) {
        const vents = Math.random() < dt * 14 ? 1 : 0;
        for (let k = 0; k < vents; k++) {
          const side = Math.random() < 0.5 ? -1 : 1;
          steam.emit(
            tmp.set(side * 0.32, MOUNT + 3.05 + Math.random() * 0.1, 0.05),
            tmp2.set(side * (0.5 + Math.random() * 0.4), -0.5, (Math.random() - 0.5) * 0.4),
            { life: 3.5, size: 0.2, growth: 0.5, kind: 1 },
          );
        }
      }
      const low = 1 - smooth(10, 45, altitude);
      const rate = engine * 520 * low;
      const n = Math.floor(rate * dt + Math.random());
      const down = tmp2.set(Math.sin(p.pitch), -Math.cos(p.pitch), 0);
      for (let k = 0; k < n; k++) {
        const speed = 9 + Math.random() * 6;
        const east = Math.random() < 0.5 ? -1 : 1;
        steam.emit(
          tmp.copy(nozzle).addScaledVector(down, 0.2 + Math.random() * 0.8),
          velocity.set(
            down.x * speed + east * Math.random() * 2,
            down.y * speed + (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 1.5,
          ),
          { life: 5 + Math.random() * 4, size: 0.7 + Math.random() * 0.6, growth: 1.3 + Math.random() * 1.2, kind: 0 },
        );
      }
      steam.step(dt, engine, nozzle);
    }
    if (t >= LIFTOFF) trail.add(nozzle.x, nozzle.y, now);
    trail.update(now, t >= LIFTOFF ? { x: nozzle.x, y: nozzle.y } : null);

    // ── the camera ──
    const idle = idleCamera(f);
    const sway = reduced ? 0 : 1;
    idle.position.x += Math.sin(now * 0.13) * 0.12 * sway;
    idle.position.y += Math.sin(now * 0.09) * 0.05 * sway;
    let position = idle.position;
    let look = idle.look;
    let offset = shift(f, idle.position, idle.look);

    if (t >= 0) {
      // centre the rocket, a little larger, as it lights
      launchFrame ??= f;
      const centred: Framing = { x: width / 2, y: height * 0.84, height: height * 0.42 };
      const k = ease(Math.min(1, t / 1.6));
      const g: Framing = {
        x: lerp(launchFrame.x, centred.x, k),
        y: lerp(launchFrame.y, centred.y, k),
        height: lerp(launchFrame.height, centred.height, k),
      };
      const start = idleCamera(g);
      position = start.position;
      offset = shift(g, start.position, start.look);
      // then look up after it
      const follow = ease(smooth(LIFTOFF, PULL, t));
      const rocketMid = tmp.copy(ship.position).add(tmp2.set(Math.sin(p.pitch), Math.cos(p.pitch), 0).multiplyScalar(2.6));
      look = start.look.clone().lerp(rocketMid, follow);
      offset = [offset[0] * (1 - follow), offset[1] * (1 - follow)];

      // and pull back until the ground is the planet's limb, with the pad on
      // it, as the sky page sees Canberra
      const u = ease(smooth(PULL, ARRIVE, t));
      if (u > 0) {
        // far enough out to see the whole arc, from the pad to where the
        // rocket is when the camera arrives, and on a narrow screen turned
        // towards it, the pad off to the left
        const halfWide = Math.tan(Math.atan(Math.tan((FOV * Math.PI) / 360) * camera.aspect));
        const end = along(travelled(ARRIVE - LIFTOFF)).x;
        const finalDistance = Math.max(640, (end + 120) / (2 * halfWide));
        const across = Math.max(0, end + 60 - finalDistance * halfWide);
        const z = start.position.z * (finalDistance / start.position.z) ** u;
        position = new Vector3(lerp(start.position.x, across, u), lerp(start.position.y, 0, u), z);
        // the pad sits a sixth of the way up the view
        const pitch = Math.atan(0.66 * Math.tan((FOV * Math.PI) / 360));
        const view = new Vector3(across, finalDistance * Math.tan(pitch), 0);
        // keep following the rocket until the camera is well back
        look = look.clone().lerp(view, smooth(0.5, 1, u));
        offset = [offset[0] * (1 - u), offset[1] * (1 - u)];
      }

      // the ground shakes at full thrust
      const shake = engine * 0.05 * (1 - smooth(5, 60, s)) * (1 - u) * sway;
      position = position.clone().add(tmp2.set(Math.sin(now * 71) * shake, Math.sin(now * 89 + 1) * shake, 0));
      camera.near = Math.max(0.05, position.z * 0.004);
    } else {
      camera.near = 0.05;
    }
    camera.position.copy(position);
    camera.lookAt(look);
    camera.updateProjectionMatrix();
    camera.setViewOffset(width, height, offset[0], offset[1], width, height);

    // the air thins as the camera climbs
    const cameraAlt = position.distanceTo(CENTRE) - R;
    const air = Math.exp(-Math.max(0, cameraAlt - 1.5) / 22);
    (dome.material as ShaderMaterial).uniforms.air.value = air;
    dome.position.copy(position);
    starPoints.position.copy(position);
    const starUniforms = (starPoints.material as ShaderMaterial).uniforms;
    starUniforms.air.value = air;
    starUniforms.time.value = reduced ? 0 : now;
    const groundUniforms = (ground.material as ShaderMaterial).uniforms;
    groundUniforms.air.value = air;
    groundUniforms.engine.value = power;
    groundUniforms.enginePos.value.copy(nozzle);
    (halo.material as ShaderMaterial).uniforms.shown.value = 1 - air;
    ridges.scale.y = Math.max(0.02, air);
    ridges.visible = air > 0.03;
    sunlight.intensity = smooth(12, 50, altitude) * 3;
    renderer.toneMappingExposure = 1.1 + Math.max(0, 1 - Math.abs(t - 0.35) * 4) * 0.25;

    // the glints: the engine's glare, the two lamps, the tower's red lights
    const g = lights.geometry;
    const gp = g.getAttribute("position") as BufferAttribute;
    const gc = g.getAttribute("colour") as BufferAttribute;
    const gs = g.getAttribute("size") as BufferAttribute;
    const gl = g.getAttribute("streak") as BufferAttribute;
    const blink = reduced ? 1 : Math.sin(now * 2.4) > 0.2 ? 1 : 0.08;
    const glare = power * (1 + smooth(20, 200, altitude) * 0.6);
    const items: [Vector3, [number, number, number], number, number][] = [
      [nozzle.clone().add(tmp.set(0, -0.25, 0).applyEuler(ship.rotation)), [1.6 * glare, 1.1 * glare, 0.7 * glare], 240 * Math.min(1, Math.max(0.55, width / 1400)), 1],
      [lamps[0], [0.9, 1.0, 1.3], 26, 0.25],
      [lamps[1], [0.9, 1.0, 1.3], 26, 0.25],
      [new Vector3(-1.3, MAST + 0.05, 0), [1.4 * blink, 0.12 * blink, 0.08 * blink], 18, 0],
      [new Vector3(-1.75, 6.35, 0.45), [1.2 * (1.08 - blink), 0.1, 0.06], 14, 0],
      [new Vector3(-0.85, 6.35, 0.45), [1.2 * (1.08 - blink), 0.1, 0.06], 14, 0],
    ];
    items.forEach(([at, c, size, streak], i) => {
      gp.setXYZ(i, at.x, at.y, at.z);
      gc.setXYZ(i, c[0], c[1], c[2]);
      gs.setX(i, size);
      gl.setX(i, streak);
    });
    for (const a of [gp, gc, gs, gl]) a.needsUpdate = true;

    (steam.points.material as ShaderMaterial).uniforms.scale.value = focal() * ratio;
    if (profiler) profiler.render(() => renderer.render(scene, camera));
    else renderer.render(scene, camera);

    if (t >= 0 && report) {
      const speed = t < LIFTOFF ? 0 : (travelled(τ + 0.05) - s) / 0.05;
      report({ time: t, altitude: altitude * KM, speed: speed * SPEED });
    }
    if (t >= ARRIVE && finished) {
      finished();
      finished = null;
    }
  }

  let stopped = false;
  function stop() {
    if (stopped) return;
    stopped = true;
    finished?.();
    finished = null;
    options.lost();
  }
  canvas.addEventListener("webglcontextlost", stop);
  renderer.debug.onShaderError = stop;

  // the GPU saturation probe needs every frame the GPU can manage
  const unthrottled = forcesContinuousRendering(profiler?.config);
  function frame() {
    if (stopped) return;
    requestAnimationFrame(frame);
    const now = performance.now() / 1000;
    // while the form is being filled in, thirty frames a second will do
    if (flight === null && !unthrottled && now - last < 1 / 31) return;
    // a long pause (a background tab) shouldn't fling the smoke
    const dt = Math.min(0.05, now - last);
    last = now;
    if (flight !== null) flight += dt;
    try {
      draw(now, dt);
    } catch {
      stop();
    }
  }

  resize();
  try {
    if (reduced) draw(performance.now() / 1000, 0);
    else requestAnimationFrame(frame);
  } catch {
    return null;
  }

  return {
    launch(onTelemetry) {
      if (reduced || stopped) return Promise.resolve();
      report = onTelemetry;
      flight = 0;
      return new Promise((resolve) => (finished = resolve));
    },
  };
}
