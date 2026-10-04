import { ago } from "../lib/format.ts";
import { BANDS, OVERHEAD_HALF_WIDTH, STATION_ANGLE, angleAt, isOverhead, type Band } from "../lib/orbit.ts";

// Draws the shared sky and keeps it live. Positions come from each object's
// orbit and the server's clock, never from the network (ADR 0004).

interface Satellite {
  id: number;
  callsign: string;
  beacon: string;
  band: Band;
  launchedAt: number;
  radius: number;
  phase: number;
  period: number;
  epoch: number;
  mine: boolean;
}

const TAU = Math.PI * 2;
const OUTER = 2.85; // planet radii from the centre to the chart's edge

const initial = JSON.parse(document.getElementById("sky-data")!.textContent!) as {
  serverTime: number;
  sky: Satellite[];
  launched: number | null;
};

// Server time minus local time; refined when the stream says hello.
let offset = initial.serverTime - Date.now();
const serverNow = () => Date.now() + offset;
const sky = new Map(initial.sky.map((s) => [s.id, s]));
const launchedAt = initial.launched !== null ? performance.now() : 0;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

const hue = (id: number) => (id * 137.508) % 360;
const colour = (id: number, alpha = 1) => `oklch(0.8 0.13 ${hue(id)} / ${alpha})`;

// ── the chart ──────────────────────────────────────────────────────────────

const canvas = document.getElementById("chart") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const css = getComputedStyle(document.documentElement);
const token = (name: string) => css.getPropertyValue(name).trim();
const palette = {
  grid: token("--grid"),
  gridStrong: token("--grid-strong"),
  ink: token("--ink"),
  inkDim: token("--ink-dim"),
  amber: token("--amber"),
  planet: "#15284a",
};

let size = 0;
let scale = 1;

function resize() {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  size = Math.min(rect.width, rect.height);
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, rect.width / 2 * ratio, rect.height / 2 * ratio);
  scale = size / 2 / OUTER;
}
new ResizeObserver(resize).observe(canvas);
resize();

// chart coordinates: y up, so flip on the way to the screen
const toScreen = (radius: number, angle: number) => ({
  x: radius * scale * Math.cos(angle),
  y: -radius * scale * Math.sin(angle),
});

function drawBackground() {
  // the station's window: anything inside this wedge is overhead
  ctx.fillStyle = "rgb(242 165 65 / 0.07)";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, OUTER * scale, -STATION_ANGLE - OVERHEAD_HALF_WIDTH, -STATION_ANGLE + OVERHEAD_HALF_WIDTH);
  ctx.closePath();
  ctx.fill();

  // polar grid: spokes every 30 degrees
  ctx.strokeStyle = palette.grid;
  ctx.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    const a = (i * TAU) / 12;
    const from = toScreen(1, a);
    const to = toScreen(OUTER - 0.05, a);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }

  // the bands, as shaded rings with their names
  ctx.font = `600 ${Math.max(11, size / 60)}px Archivo, system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (const band of Object.values(BANDS)) {
    ctx.fillStyle = "rgb(58 87 129 / 0.12)";
    ctx.beginPath();
    ctx.arc(0, 0, band.maxRadius * scale, 0, TAU);
    ctx.arc(0, 0, band.minRadius * scale, 0, TAU, true);
    ctx.fill();
    ctx.strokeStyle = palette.grid;
    ctx.setLineDash([2, 4]);
    for (const r of [band.minRadius, band.maxRadius]) {
      ctx.beginPath();
      ctx.arc(0, 0, r * scale, 0, TAU);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = palette.inkDim;
    const label = toScreen((band.minRadius + band.maxRadius) / 2, -Math.PI / 4);
    ctx.fillText(band.label, label.x + 4, label.y);
  }

  // the planet
  ctx.fillStyle = palette.planet;
  ctx.strokeStyle = palette.gridStrong;
  ctx.beginPath();
  ctx.arc(0, 0, scale, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // the ground station on top of it
  const s = toScreen(1, STATION_ANGLE);
  ctx.fillStyle = palette.amber;
  ctx.beginPath();
  ctx.moveTo(s.x, s.y - 9);
  ctx.lineTo(s.x - 6, s.y + 2);
  ctx.lineTo(s.x + 6, s.y + 2);
  ctx.closePath();
  ctx.fill();
}

function drawSatellite(sat: Satellite, time: number, frame: number) {
  const angle = angleAt(sat, time);
  const overhead = isOverhead(sat, time);
  const p = toScreen(sat.radius, angle);

  // a fading trail behind it: the light it leaves in the sky
  const trail = Math.min(0.6, (TAU * 9000) / sat.period);
  const steps = 16;
  for (let i = steps; i > 0; i--) {
    const a0 = angle - (trail * i) / steps;
    const a1 = angle - (trail * (i - 1)) / steps;
    ctx.strokeStyle = colour(sat.id, 0.5 * (1 - i / steps));
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, sat.radius * scale, -a0, -a1, true);
    ctx.stroke();
  }

  ctx.fillStyle = overhead ? palette.amber : colour(sat.id);
  ctx.beginPath();
  ctx.arc(p.x, p.y, sat.mine ? 5 : 3.5, 0, TAU);
  ctx.fill();

  if (sat.mine) {
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 9, 0, TAU);
    ctx.stroke();
  }

  // a just-launched satellite pulses for a few seconds
  if (sat.id === initial.launched && !reduced) {
    const t = (frame - launchedAt) / 1000;
    if (t < 6) {
      const pulse = (t % 1.5) / 1.5;
      ctx.strokeStyle = `rgb(242 165 65 / ${1 - pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8 + pulse * 22, 0, TAU);
      ctx.stroke();
    }
  }

  // only your own is named on the chart; the station panel names the rest
  if (sat.mine) {
    ctx.fillStyle = overhead ? palette.amber : palette.ink;
    ctx.font = `700 ${Math.max(12, size / 55)}px Archivo, system-ui, sans-serif`;
    ctx.textAlign = p.x > 0 ? "left" : "right";
    ctx.fillText(sat.callsign, p.x + (p.x > 0 ? 12 : -12), p.y - 10);
  }
}

function draw(frame: number) {
  const rect = canvas.getBoundingClientRect();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
  if (rect.width === 0) return requestAnimationFrame(draw);
  drawBackground();
  const time = serverNow();
  for (const sat of sky.values()) drawSatellite(sat, time, frame);
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

// ── what the station hears ────────────────────────────────────────────────

const overheadList = document.getElementById("overhead")!;
const nextPass = document.getElementById("next-pass")!;
const yourPass = document.getElementById("your-pass");
let heard = "";

// How long until a satellite next enters the station's window.
function untilOverhead(sat: Satellite, time: number): number {
  const gap = (STATION_ANGLE - OVERHEAD_HALF_WIDTH - angleAt(sat, time) + TAU) % TAU;
  return (gap / TAU) * sat.period;
}

const duration = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
};

function listen() {
  const time = serverNow();
  const over = [...sky.values()].filter((s) => isOverhead(s, time));
  const key = over.map((s) => s.id).join(",");
  if (key !== heard) {
    heard = key;
    overheadList.replaceChildren(
      ...over.map((s) => {
        const li = document.createElement("li");
        const name = document.createElement("span");
        name.className = "callsign";
        name.textContent = s.callsign;
        const beacon = document.createElement("span");
        beacon.className = "beacon";
        beacon.textContent = s.beacon;
        li.append(name, beacon);
        return li;
      }),
    );
  }
  if (over.length === 0) {
    // the next one to enter the station's window
    let soonest: { sat: Satellite; ms: number } | null = null;
    for (const sat of sky.values()) {
      const ms = untilOverhead(sat, time);
      if (!soonest || ms < soonest.ms) soonest = { sat, ms };
    }
    nextPass.textContent = soonest
      ? `Next overhead: ${soonest.sat.callsign}, in ${duration(soonest.ms)}.`
      : "Nothing in orbit yet.";
  }

  // your own satellite: when everyone will next hear your beacon
  const mine = [...sky.values()].find((s) => s.mine);
  if (yourPass && mine) {
    yourPass.textContent = isOverhead(mine, time)
      ? `${mine.callsign} is over the station now: everyone watching can see your beacon.`
      : `${mine.callsign} is next over the station in ${duration(untilOverhead(mine, time))}.`;
  }
}
setInterval(listen, 250);
listen();

// ── the catalogue ─────────────────────────────────────────────────────────

const rows = document.getElementById("rows")!;
const table = document.getElementById("catalogue")!;
const empty = document.getElementById("empty")!;
const count = document.getElementById("count")!;

function row(sat: Satellite): HTMLTableRowElement {
  const tr = document.createElement("tr");
  tr.dataset.id = String(sat.id);
  if (sat.mine) tr.className = "mine";
  const th = document.createElement("th");
  th.scope = "row";
  const swatch = document.createElement("span");
  swatch.className = "swatch";
  swatch.style.setProperty("--hue", String(hue(sat.id)));
  th.append(swatch, sat.callsign);
  if (sat.mine) {
    const yours = document.createElement("span");
    yours.className = "yours";
    yours.textContent = " (yours)";
    th.append(yours);
  }
  const band = document.createElement("td");
  band.textContent = BANDS[sat.band].label;
  const when = document.createElement("td");
  const time = document.createElement("time");
  time.dateTime = new Date(sat.launchedAt).toISOString();
  time.textContent = ago(serverNow() - sat.launchedAt);
  when.append(time);
  tr.append(th, band, when);
  return tr;
}

function renderCatalogue() {
  const sats = [...sky.values()].sort((a, b) => b.launchedAt - a.launchedAt);
  rows.replaceChildren(...sats.map(row));
  const n = sats.length;
  count.textContent = `${n} satellite${n === 1 ? "" : "s"} in orbit`;
  table.hidden = n === 0;
  empty.hidden = n > 0;
  canvas.setAttribute(
    "aria-label",
    `Orbital chart: ${count.textContent} around the planet. The ground station is at the top.`,
  );
}

// keep "5 min ago" honest
setInterval(() => {
  for (const time of rows.querySelectorAll("time")) {
    time.textContent = ago(serverNow() - Date.parse(time.dateTime));
  }
}, 30_000);

// ── the event stream ──────────────────────────────────────────────────────

const connection = document.getElementById("connection")!;
const setConnection = (state: "live" | "offline") => {
  connection.dataset.state = state;
  connection.textContent = state === "live" ? "Live" : "Reconnecting";
};

// EventSource retries a dropped connection by itself, but gives up for good
// if a reconnect gets an error response (Fly answers 502/503 while a machine
// starts or deploys), so start a fresh one when that happens.
function connect() {
  const stream = new EventSource("/api/events");

  stream.addEventListener("hello", (event) => {
    const hello = JSON.parse(event.data) as { serverTime: number; sky: Satellite[] };
    offset = hello.serverTime - Date.now();
    sky.clear();
    for (const sat of hello.sky) sky.set(sat.id, sat);
    renderCatalogue();
    setConnection("live");
  });

  stream.addEventListener("launch", (event) => {
    const sat = JSON.parse(event.data) as Satellite;
    sky.set(sat.id, sat);
    renderCatalogue();
  });

  stream.addEventListener("error", () => {
    setConnection("offline");
    if (stream.readyState === EventSource.CLOSED) setTimeout(connect, 3000);
  });
}
connect();
