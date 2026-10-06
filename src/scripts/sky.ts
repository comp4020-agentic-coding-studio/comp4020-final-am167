import { ago } from "../lib/format.ts";
import { BANDS, OVERHEAD_HALF_WIDTH, STATION_ANGLE, angleAt, isOverhead, type Band } from "../lib/orbit.ts";
import { countdown } from "./countdown.ts";

// Keeps the shared sky live, and starts the scene that draws it. Positions
// come from each object's orbit and the server's clock, never from the
// network (ADR 0004).

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

const initial = JSON.parse(document.getElementById("sky-data")!.textContent!) as {
  serverTime: number;
  sky: Satellite[];
  launched: number | null;
};

// Server time minus local time; refined when the stream says hello.
let offset = initial.serverTime - Date.now();
const serverNow = () => Date.now() + offset;
const sky = new Map(initial.sky.map((s) => [s.id, s]));
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

const hue = (id: number) => (id * 137.508) % 360;

// ── the scene ─────────────────────────────────────────────────────────────

// Three.js is most of the page's weight, so it loads on its own while the
// station and the summary start working.
const canvas = document.getElementById("chart") as HTMLCanvasElement;
const noScene = () => {
  canvas.hidden = true;
  document.getElementById("no-webgl")!.hidden = false;
};
import("./scene.ts")
  .then(({ createScene }) => {
    const started = createScene({
      canvas,
      overlay: document.getElementById("scene-labels")!,
      sky: () => sky.values(),
      now: serverNow,
      launched: initial.launched,
      reduced,
      obstacles: [
        document.querySelector<HTMLElement>(".sky-page .panels")!,
        document.getElementById("zoom")!,
        ...(document.getElementById("launched-notice") ? [document.getElementById("launched-notice")!] : []),
      ],
    });
    if (!started) return noScene();
    requestAnimationFrame(() => requestAnimationFrame(() => canvas.classList.add("drawn")));
    // over the station, or the whole planet with every orbit in view
    const zoom = document.getElementById("zoom") as HTMLButtonElement;
    let out = false;
    zoom.hidden = false;
    zoom.addEventListener("click", () => {
      out = !out;
      started.zoom(out);
      zoom.textContent = out ? "Back to the station" : "See the whole sky";
    });
  })
  // the chunk didn't load (offline, or a deploy replaced it), or the scene
  // failed to start
  .catch(noScene);

// ── what the station hears ────────────────────────────────────────────────

const overheadList = document.getElementById("overhead")!;
const overheadCount = document.getElementById("overhead-count")!;
const nextPass = document.getElementById("next-pass")!;
const yourPass = document.getElementById("your-pass");
let heard = "";

// The panel has room for three beacons. When more are overhead it pages
// through them, so every one is still heard while the panel keeps its size.
const SLOTS = 3;
const PAGE_MS = 4000;

// How long until a satellite next enters the station's window.
function untilOverhead(sat: Satellite, time: number): number {
  const gap = (STATION_ANGLE - OVERHEAD_HALF_WIDTH - angleAt(sat, time) + TAU) % TAU;
  return (gap / TAU) * sat.period;
}

function listen() {
  const time = serverNow();
  const over = [...sky.values()].filter((s) => isOverhead(s, time)).sort((a, b) => a.id - b.id);
  const pages = Math.ceil(over.length / SLOTS);
  const page = pages > 1 ? Math.floor(Date.now() / PAGE_MS) % pages : 0;
  const shown = over.slice(page * SLOTS, page * SLOTS + SLOTS);
  overheadCount.textContent =
    over.length === 0
      ? "\u00a0"
      : pages > 1
        ? `${page * SLOTS + 1}–${page * SLOTS + shown.length} of ${over.length} overhead`
        : `${over.length} overhead`;
  const key = shown.map((s) => s.id).join(",");
  if (key !== heard) {
    heard = key;
    overheadList.replaceChildren(
      ...shown.map((s) => {
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
      ? `Next overhead: ${soonest.sat.callsign}, in ${countdown(soonest.ms)}.`
      : "Nothing in orbit yet.";
  }

  // your own satellite: when everyone will next hear your beacon
  const mine = [...sky.values()].find((s) => s.mine);
  if (yourPass && mine) {
    yourPass.textContent = isOverhead(mine, time)
      ? `${mine.callsign} is over the station now: everyone watching can see your beacon.`
      : `${mine.callsign} is next over the station in ${countdown(untilOverhead(mine, time))}.`;
  }
}
setInterval(listen, 250);
listen();

// The "in orbit" notice after a launch floats over the scene; it fades after
// a few seconds (on a phone it sits in the page and stays).
const notice = document.getElementById("launched-notice");
if (notice && getComputedStyle(notice).position === "absolute") {
  setTimeout(() => notice.classList.add("fading"), 6000);
  notice.addEventListener("transitionend", () => (notice.hidden = true));
}

// ── the summary: counts per band and the latest launches ──────────────────

const recentList = document.getElementById("recent")!;
const empty = document.getElementById("empty")!;
const count = document.getElementById("count")!;
const RECENT = Number(document.querySelector<HTMLElement>(".summary")!.dataset.recent);

function recentItem(sat: Satellite): HTMLLIElement {
  const li = document.createElement("li");
  if (sat.mine) li.className = "mine";
  const swatch = document.createElement("span");
  swatch.className = "swatch";
  swatch.style.setProperty("--hue", String(hue(sat.id)));
  const what = document.createElement("span");
  const name = document.createElement("strong");
  name.textContent = sat.callsign;
  what.append(name, `${sat.mine ? " (yours)" : ""} to ${BANDS[sat.band].label}`);
  const time = document.createElement("time");
  time.dateTime = new Date(sat.launchedAt).toISOString();
  time.textContent = ago(serverNow() - sat.launchedAt);
  li.append(swatch, what, time);
  return li;
}

function renderSummary() {
  const sats = [...sky.values()].sort((a, b) => b.launchedAt - a.launchedAt);
  recentList.replaceChildren(...sats.slice(0, RECENT).map(recentItem));
  const n = sats.length;
  count.textContent = `${n} satellite${n === 1 ? "" : "s"} in orbit`;
  for (const band of Object.keys(BANDS) as Band[]) {
    document.querySelector(`[data-band-count="${band}"]`)!.textContent = String(
      sats.filter((s) => s.band === band).length,
    );
  }
  empty.hidden = n > 0;
  canvas.setAttribute(
    "aria-label",
    `The sky over the station: ${count.textContent}. Satellites rise on the left and set on the right.`,
  );
}

// keep "5 min ago" honest
setInterval(() => {
  for (const time of recentList.querySelectorAll("time")) {
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
    renderSummary();
    setConnection("live");
  });

  stream.addEventListener("launch", (event) => {
    const sat = JSON.parse(event.data) as Satellite;
    sky.set(sat.id, sat);
    renderSummary();
  });

  stream.addEventListener("error", () => {
    setConnection("offline");
    if (stream.readyState === EventSource.CLOSED) setTimeout(connect, 3000);
  });
}
connect();
