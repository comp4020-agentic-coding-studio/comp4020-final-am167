import { ago, until } from "../lib/format.ts";
import {
  BANDS,
  OVERHEAD_HALF_WIDTH,
  STATION_ANGLE,
  angleAt,
  bandAt,
  burnAt,
  isOverhead,
  periodNow,
  plungeAt,
  radiusAt,
  reentryAt,
  type Band,
} from "../lib/orbit.ts";
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

// Everything falls and burns up (ADR 0007). A burned-up object stays in the
// scene this long after, while its wake fades, but leaves the station and
// the counts at once.
const AFTERGLOW_MS = 8_000;
const up = (sat: Satellite, time = serverNow()) => time < reentryAt(sat);
const flying = () => [...sky.values()].filter((sat) => up(sat));
// Burn-ups this page has seen, by id, from the scene or the server's event.
interface BurnUp {
  callsign: string;
  at: number;
  mine: boolean;
}
const burnUps = new Map<number, BurnUp>();
const burned = (sat: Satellite) =>
  burnUps.set(sat.id, { callsign: sat.callsign, at: reentryAt(sat), mine: sat.mine });
// the latest, and your own
const latest = (mine = false) => {
  let found: BurnUp | null = null;
  for (const b of burnUps.values()) if ((!mine || b.mine) && (!found || b.at > found.at)) found = b;
  return found;
};

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

// How long until a satellite next enters the station's window, or null if it
// burns up first. (Its period shortens as it falls, so this is a touch long
// for a high orbit; it's re-read four times a second.)
function untilOverhead(sat: Satellite, time: number): number | null {
  if (plungeAt(sat, time) !== null) return null;
  const gap = (STATION_ANGLE - OVERHEAD_HALF_WIDTH - angleAt(sat, time) + TAU) % TAU;
  const ms = (gap / TAU) * periodNow(sat, time);
  return time + ms < burnAt(sat) ? ms : null;
}

function listen() {
  const time = serverNow();
  const over = flying()
    .filter((s) => isOverhead(s, time))
    .sort((a, b) => a.id - b.id);
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
    for (const sat of flying()) {
      const ms = untilOverhead(sat, time);
      // one that burns up first never gets there
      if (ms !== null && (!soonest || ms < soonest.ms)) soonest = { sat, ms };
    }
    nextPass.textContent = soonest
      ? `Next overhead: ${soonest.sat.callsign}, in ${countdown(soonest.ms)}.`
      : flying().length > 0
        ? "Nothing in orbit will reach the station before it burns up."
        : "Nothing in orbit yet.";
  }

  // your own satellite: when everyone will next hear your beacon, and how
  // long it has left
  const mine = flying().find((s) => s.mine);
  const yours = latest(true);
  if (yourPass && mine) {
    const left = until(reentryAt(mine) - time);
    const pass = untilOverhead(mine, time);
    say(
      plungeAt(mine, time) !== null
        ? `${mine.callsign} is burning up on re-entry.`
        : isOverhead(mine, time)
          ? `${mine.callsign} is over the station now: everyone watching can see your beacon. It burns up in ${left}.`
          : pass === null
            ? `${mine.callsign} burns up in ${left}, before it next reaches the station.`
            : `${mine.callsign} is next over the station in ${countdown(pass)}. It burns up in ${left}.`,
    );
  } else if (yourPass && yours) {
    say(`${yours.callsign} burned up on re-entry ${ago(time - yours.at)}. `, true);
  }
  news(time);
}

// Your satellite's line, with a way back to the pad once it's gone.
let yourText = "";
function say(text: string, gone = false) {
  if (!yourPass || text === yourText) return;
  yourText = text;
  if (!gone) {
    yourPass.textContent = text;
    return;
  }
  const again = document.createElement("a");
  again.href = "/";
  again.textContent = "Launch another";
  yourPass.replaceChildren(text, again, " once the pad reopens.");
}

// What's burning now, what burned up last, or what will burn up next: most
// burn up out of the station's view, so the summary says so.
const newsLine = document.getElementById("sky-news")!;
let said = "";
function news(time: number) {
  const named = (sat: { callsign: string; mine: boolean }) => `${sat.callsign}${sat.mine ? " (yours)" : ""}`;
  const falling = flying().find((sat) => plungeAt(sat, time) !== null);
  const last = latest();
  let text = "";
  if (falling) text = `${named(falling)} is burning up on re-entry.`;
  else if (last && time - last.at < 15 * 60_000) text = `${named(last)} burned up on re-entry ${ago(time - last.at)}.`;
  else {
    const next = flying().sort((a, b) => reentryAt(a) - reentryAt(b))[0];
    if (next) text = `Next to burn up: ${named(next)}, in ${until(reentryAt(next) - time)}.`;
  }
  if (text === said) return;
  said = text;
  newsLine.textContent = text;
  newsLine.hidden = text === "";
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
  const time = serverNow();
  const sats = flying().sort((a, b) => b.launchedAt - a.launchedAt);
  recentList.replaceChildren(...sats.slice(0, RECENT).map(recentItem));
  const n = sats.length;
  count.textContent = `${n} satellite${n === 1 ? "" : "s"} in orbit`;
  for (const band of Object.keys(BANDS) as Band[]) {
    // where each one is now, not the band it was launched into
    document.querySelector(`[data-band-count="${band}"]`)!.textContent = String(
      sats.filter((s) => bandAt(radiusAt(s, time)) === band).length,
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

// Burning up needs no message: every page works out when from the orbit, so
// they all see it at the same moment. The server's `decay` event confirms it.
let counted = "";
setInterval(() => {
  const time = serverNow();
  for (const sat of sky.values()) {
    if (!up(sat, time)) burned(sat);
    if (time >= reentryAt(sat) + AFTERGLOW_MS) sky.delete(sat.id);
  }
  // counts move as orbits fall through the bands and burn up
  const key = flying()
    .map((s) => `${s.id}:${bandAt(radiusAt(s, time))}`)
    .join();
  if (key !== counted) {
    counted = key;
    renderSummary();
  }
}, 1000);

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
    // the snapshot is the live sky; keep what's burned up but still fading
    const time = serverNow();
    for (const sat of sky.values()) if (up(sat, time)) sky.delete(sat.id);
    for (const sat of hello.sky) sky.set(sat.id, sat);
    renderSummary();
    setConnection("live");
  });

  stream.addEventListener("launch", (event) => {
    const sat = JSON.parse(event.data) as Satellite;
    sky.set(sat.id, sat);
    renderSummary();
  });

  // the server has marked it decayed; the scene lets its wake fade first
  stream.addEventListener("decay", (event) => {
    const sat = JSON.parse(event.data) as Satellite;
    burned(sat);
    if (sky.has(sat.id)) renderSummary();
  });

  stream.addEventListener("error", () => {
    setConnection("offline");
    if (stream.readyState === EventSource.CLOSED) setTimeout(connect, 3000);
  });
}
connect();
