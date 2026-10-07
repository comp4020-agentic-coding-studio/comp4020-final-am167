import { ago, until } from "../lib/format.ts";
import { canManoeuvre } from "../lib/manoeuvre.ts";
import {
  BANDS,
  OVERHEAD_HALF_WIDTH,
  STATION_ANGLE,
  angleAt,
  bandAt,
  burnAt,
  climbing,
  isOverhead,
  periodNow,
  plungeAt,
  radiusAt,
  reentryAt,
  type Band,
} from "../lib/orbit.ts";
import { blame, couplet, headline, skyCount, type StoryParty } from "../lib/story.ts";
import { countdown } from "./countdown.ts";
import { wireManoeuvres } from "./manoeuvres.ts";

// Keeps the shared sky live, and starts the scene that draws it. Positions
// come from each object's orbit and the server's clock, never from the
// network (ADR 0004).

interface Satellite {
  id: number;
  // people launch satellites; derelicts and debris are nobody's (ADR 0008)
  kind: "satellite" | "derelict" | "debris";
  callsign: string | null;
  beacon: string | null;
  band: Band;
  launchedAt: number;
  radius: number;
  phase: number;
  period: number;
  epoch: number;
  direction: 1 | -1;
  sourceCollision: number | null;
  // a manoeuvre (ADR 0011): part of the orbit, and what its owner did
  rate: number;
  until: number | null;
  deorbitedAt: number | null;
  boosts: number;
  mine: boolean;
}

// A collision coming, as the server predicted it (ADR 0008).
interface Conjunction {
  a: number;
  b: number;
  at: number;
  angle: number;
  radius: number;
}

// A collision that happened, and who it names (ADR 0010).
interface Story {
  id: number;
  at: number;
  angle: number;
  radius: number;
  parties: [StoryParty, StoryParty];
}

const TAU = Math.PI * 2;

const initial = JSON.parse(document.getElementById("sky-data")!.textContent!) as {
  serverTime: number;
  sky: Satellite[];
  launched: number | null;
  conjunctions: Conjunction[];
  collisions: Story[];
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

// Collisions coming, by pair, and when each object was (or will be) hit. A
// collision is drawn at its predicted moment on every screen; the server's
// `collision` event confirms it and brings the fragments.
const coming = new Map<string, Conjunction>();
// collisions the server has confirmed, by object
const destroyed = new Map<number, number>();
// when each object is hit, from both: rebuilt whenever either changes
const hitAt = new Map<number, number>();
function rebuildHits() {
  hitAt.clear();
  for (const [id, at] of destroyed) hitAt.set(id, at);
  for (const c of coming.values()) {
    for (const id of [c.a, c.b]) hitAt.set(id, Math.min(hitAt.get(id) ?? Infinity, c.at));
  }
}
const stories: Story[] = [];
// newest first, each once, however it arrived (the page, the stream, a
// reconnect)
function remember(story: Story): boolean {
  if (stories.some((s) => s.id === story.id)) return false;
  stories.push(story);
  stories.sort((a, b) => b.at - a.at);
  stories.length = Math.min(stories.length, 10);
  return true;
}
initial.collisions.forEach(remember);
function expect(conjunction: Conjunction) {
  coming.set(`${conjunction.a}:${conjunction.b}`, conjunction);
  rebuildHits();
}
initial.conjunctions.forEach(expect);
const hit = (sat: Satellite, time: number) => time >= (hitAt.get(sat.id) ?? Infinity);

const up = (sat: Satellite, time = serverNow()) => time < reentryAt(sat) && !hit(sat, time);
const flying = () => [...sky.values()].filter((sat) => up(sat));
// Burn-ups this page has seen, by id, from the scene or the server's event.
interface BurnUp {
  callsign: string;
  at: number;
  mine: boolean;
  // its owner brought it down (ADR 0011)
  deorbited: boolean;
}
const burnUps = new Map<number, BurnUp>();
// people's satellites only: wreckage burning up isn't news
const burned = (sat: Satellite) => {
  if (sat.kind === "satellite" && sat.callsign)
    burnUps.set(sat.id, { callsign: sat.callsign, at: reentryAt(sat), mine: sat.mine, deorbited: sat.deorbitedAt !== null });
};
const burnedUp = (b: BurnUp) => (b.deorbited ? "was brought down, and burned up" : "burned up on re-entry");
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
      // a collision takes both out of the scene at once: the flash covers it
      sky: () => {
        const time = serverNow();
        return [...sky.values()].filter((sat) => !hit(sat, time));
      },
      // a collision of yours is always followed (scene.ts)
      impacts: () => [
        ...[...coming.values()].map((c) => ({ ...c, mine: Boolean(sky.get(c.a)?.mine || sky.get(c.b)?.mine) })),
        ...stories,
      ],
      now: serverNow,
      launched: initial.launched,
      reduced,
      obstacles: [
        document.querySelector<HTMLElement>(".sky-page .panels")!,
        document.getElementById("zoom")!,
        ...(document.getElementById("launched-notice") ? [document.getElementById("launched-notice")!] : []),
        document.getElementById("collision-card")!,
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
  // a retrograde orbit comes at the window from the other side (ADR 0008)
  const angle = angleAt(sat, time);
  const gap =
    sat.direction === -1
      ? (angle - (STATION_ANGLE + OVERHEAD_HALF_WIDTH) + TAU) % TAU
      : (STATION_ANGLE - OVERHEAD_HALF_WIDTH - angle + TAU) % TAU;
  const ms = (gap / TAU) * periodNow(sat, time);
  return time + ms < burnAt(sat) ? ms : null;
}

// what the station hears: satellites with a beacon (derelicts and debris
// are silent)
const speaking = () => flying().filter((sat) => sat.beacon);

function listen() {
  const time = serverNow();
  const over = speaking()
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
    for (const sat of speaking()) {
      const ms = untilOverhead(sat, time);
      // one that burns up first never gets there
      if (ms !== null && (!soonest || ms < soonest.ms)) soonest = { sat, ms };
    }
    nextPass.textContent = soonest
      ? `Next overhead: ${soonest.sat.callsign}, in ${countdown(soonest.ms)}.`
      : speaking().length > 0
        ? "Nothing in orbit will reach the station before it burns up."
        : "No satellites in orbit yet.";
  }

  // your own satellites: the one everyone will hear next (or is hearing
  // now), and how long it has left
  const yoursUp = speaking().filter((s) => s.mine);
  const soonest = (s: Satellite) => (isOverhead(s, time) ? -1 : (untilOverhead(s, time) ?? Infinity));
  const mine = yoursUp.sort((a, b) => soonest(a) - soonest(b))[0];
  const yours = latest(true);
  if (yourPass && mine) {
    const left = until(reentryAt(mine) - time);
    const pass = untilOverhead(mine, time);
    const count = yoursUp.length > 1 ? `You have ${yoursUp.length} up. ` : "";
    say(
      count +
      (plungeAt(mine, time) !== null
        ? `${mine.callsign} is burning up on re-entry.`
        : mine.deorbitedAt !== null
          ? `${mine.callsign} is coming down: it burns up in ${countdown(reentryAt(mine) - time)}.`
          : climbing(mine, time)
            ? `${mine.callsign} is climbing to the ${BANDS[bandAt(radiusAt(mine, mine.until ?? time))].label.toLowerCase()} band.`
            : isOverhead(mine, time)
          ? `${mine.callsign} is over the station now: everyone watching can see your beacon. It burns up in ${left}.`
          : pass === null
            ? `${mine.callsign} burns up in ${left}, before it next reaches the station.`
            : `${mine.callsign} is next over the station in ${countdown(pass)}. It burns up in ${left}.`),
    );
  } else if (yourPass && yours) {
    say(`${yours.callsign} ${burnedUp(yours)} ${ago(time - yours.at)}. `, true);
  }
  control(mine ?? null, time);
  news(time);
}

// Boosting it, or bringing it down (ADR 0011): the controls under your line
// are for the satellite it's about, and only what it can still do.
const yourControls = document.getElementById("your-controls");
let controlled = "";
function control(sat: Satellite | null, time: number) {
  if (!yourControls) return;
  const can = sat ? canManoeuvre(sat, time) : null;
  const key = sat && can ? `${sat.id}:${can.boost}:${can.deorbit}:${can.to}` : "";
  if (key === controlled) return;
  controlled = key;
  for (const form of yourControls.querySelectorAll<HTMLFormElement>("form[data-manoeuvre]")) {
    const button = form.querySelector<HTMLButtonElement>("button[name=action]")!;
    const allowed = can !== null && (button.value === "boost" ? can.boost : can.deorbit) === null;
    form.hidden = !allowed;
    if (!sat || !can) continue;
    form.querySelector<HTMLInputElement>("input[name=id]")!.value = String(sat.id);
    button.dataset.callsign = sat.callsign ?? "";
    const to = button.querySelector("[data-to]");
    if (to && can.to) to.textContent = BANDS[can.to].label;
  }
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
  yourPass.replaceChildren(text, again, ".");
}

// What's burning now, what burned up last, or what will burn up next: most
// burn up out of the station's view, so the summary says so.
const newsLine = document.getElementById("sky-news")!;
let said = "";
function news(time: number) {
  const named = (sat: { callsign: string | null; mine: boolean }) => `${sat.callsign}${sat.mine ? " (yours)" : ""}`;
  // what's in a collision coming: "ALPHA (yours)", "a derelict", "debris"
  const who = (id: number) => {
    const sat = sky.get(id);
    if (!sat) return "something";
    if (sat.kind === "debris") return "debris";
    return sat.kind === "derelict" || !sat.callsign ? "a derelict" : named(sat);
  };
  const falling = speaking().find((sat) => plungeAt(sat, time) !== null);
  const down = speaking().find((sat) => sat.deorbitedAt !== null && plungeAt(sat, time) === null);
  const last = latest();
  const story = stories.reduce<Story | null>((a, b) => (a && a.at > b.at ? a : b), null);
  const next = [...coming.values()].filter((c) => c.at > time).sort((a, b) => a.at - b.at)[0];
  const since = (at: number | undefined) => (at === undefined ? Infinity : time - at);
  let text = "";
  if (story && since(story.at) < 2 * 60_000) text = `${headline(story.parties)} ${ago(since(story.at))}.`;
  else if (falling)
    text = `${named(falling)} ${falling.deorbitedAt !== null ? "was brought down, and is burning up" : "is burning up on re-entry"}.`;
  else if (down) text = `${named(down)} is being brought down by its operator, to keep the sky clear.`;
  else if (next && next.at - time < 10 * 60_000)
    text = `Collision coming: ${who(next.a)} and ${who(next.b)}, in ${countdown(next.at - time)}.`;
  else if (story && since(story.at) < 15 * 60_000) text = `${headline(story.parties)} ${ago(since(story.at))}.`;
  else if (last && since(last.at) < 15 * 60_000) text = `${named(last)} ${burnedUp(last)} ${ago(since(last.at))}.`;
  else if (next) text = `Next collision: ${who(next.a)} and ${who(next.b)}, in ${until(next.at - time)}.`;
  else {
    const soonest = speaking().sort((a, b) => reentryAt(a) - reentryAt(b))[0];
    if (soonest) text = `Next to burn up: ${named(soonest)}, in ${until(reentryAt(soonest) - time)}.`;
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
  // longer when it asks something of you (claiming a handle)
  setTimeout(() => notice.classList.add("fading"), notice.querySelector("a") ? 12_000 : 6000);
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
  const launches = sats.filter((sat) => sat.kind === "satellite");
  recentList.replaceChildren(...launches.slice(0, RECENT).map(recentItem));
  const n = sats.length;
  count.textContent = skyCount(sats);
  for (const band of Object.keys(BANDS) as Band[]) {
    // where each one is now, not the band it was launched into
    document.querySelector(`[data-band-count="${band}"]`)!.textContent = String(
      sats.filter((s) => bandAt(radiusAt(s, time)) === band).length,
    );
  }
  empty.hidden = n > 0;
  canvas.setAttribute(
    "aria-label",
    `The sky over the station: ${count.textContent}. Most rise on the left and set on the right; some go the other way.`,
  );
}

// ── collisions ────────────────────────────────────────────────────────────

// The card over the scene when a collision happens: what met, the two
// beacons side by side, and who launched what (ADR 0010). It stays a while,
// then fades; "Sky now" keeps the line.
const card = document.getElementById("collision-card")!;
const CARD_MS = 20_000;
let cardTimer: ReturnType<typeof setTimeout> | undefined;
function tell(story: Story) {
  const title = document.createElement("p");
  title.className = "collision-title";
  title.textContent = headline(story.parties);
  const lines = couplet(story.parties).map(({ callsign, beacon }) => {
    const line = document.createElement("p");
    line.className = "collision-beacon";
    const quote = document.createElement("q");
    quote.textContent = beacon;
    line.append(quote, ` ${callsign}`);
    return line;
  });
  const who = document.createElement("p");
  who.className = "collision-blame";
  who.textContent = blame(story.parties);
  card.replaceChildren(title, ...lines, who);
  card.hidden = false;
  card.classList.remove("fading");
  clearTimeout(cardTimer);
  cardTimer = setTimeout(() => card.classList.add("fading"), CARD_MS);
}
card.addEventListener("transitionend", () => {
  if (card.classList.contains("fading")) card.hidden = true;
});
// a collision that happened just before the page opened
const fresh = stories.find((story) => serverNow() - story.at < CARD_MS);
if (fresh) tell(fresh);

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
  // the "in orbit" notice goes once the satellite it's about doesn't: hit
  // in a collision (the card says so) or burned up
  if (notice && !notice.hidden && initial.launched !== null) {
    const launched = sky.get(initial.launched);
    if (!launched || !up(launched, time)) notice.hidden = true;
  }
  for (const sat of sky.values()) {
    if (hit(sat, time)) {
      // gone in a collision: the flash covers it
      if (time > (hitAt.get(sat.id) ?? 0) + 1000) sky.delete(sat.id);
      continue;
    }
    if (!up(sat, time)) burned(sat);
    if (time >= reentryAt(sat) + AFTERGLOW_MS) sky.delete(sat.id);
  }
  // a collision the stream never confirmed (it was offline): the next hello
  // brings the sky as it is
  let stale = false;
  for (const [key, c] of coming) {
    if (time > c.at + 60_000) stale = coming.delete(key);
  }
  for (const [id, at] of destroyed) if (time > at + 60_000) destroyed.delete(id);
  if (stale) rebuildHits();
  // counts move as orbits fall through the bands and burn up
  const key = flying()
    .map((s) => `${s.id}:${bandAt(radiusAt(s, time))}`)
    .join();
  if (key !== counted) {
    counted = key;
    renderSummary();
  }
}, 1000);

// ── manoeuvres (ADR 0011) ─────────────────────────────────────────────────

// A satellite's new orbit, from the stream or from your own manoeuvre: the
// collisions it was heading for are off (the server announces any new ones).
function manoeuvred(sat: Satellite) {
  const known = sky.get(sat.id);
  sky.set(sat.id, { ...sat, mine: known?.mine ?? sat.mine });
  for (const [key, c] of coming) if (c.a === sat.id || c.b === sat.id) coming.delete(key);
  rebuildHits();
  renderSummary();
}
const manoeuvreError = document.getElementById("manoeuvre-error");
wireManoeuvres<Satellite>({
  inPlace: (sat) => {
    if (manoeuvreError) manoeuvreError.textContent = "";
    manoeuvred(sat);
    listen();
  },
  refused: (message) => {
    if (manoeuvreError) manoeuvreError.textContent = message;
  },
});

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
    const hello = JSON.parse(event.data) as {
      serverTime: number;
      sky: Satellite[];
      conjunctions: Conjunction[];
      collisions: Story[];
    };
    offset = hello.serverTime - Date.now();
    // the snapshot is the live sky; keep what's burned up but still fading
    const time = serverNow();
    for (const sat of sky.values()) if (up(sat, time)) sky.delete(sat.id);
    for (const sat of hello.sky) sky.set(sat.id, sat);
    // and the collisions coming
    coming.clear();
    hello.conjunctions.forEach(expect);
    rebuildHits();
    // and any collision missed while away, told if it's fresh
    for (const story of hello.collisions) {
      if (remember(story) && time - story.at < CARD_MS) tell(story);
    }
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

  // an owner brought one down or boosted it: its new orbit
  stream.addEventListener("manoeuvre", (event) => {
    const told = JSON.parse(event.data) as { manoeuvre: "deorbit" | "boost"; object: Satellite };
    manoeuvred(told.object);
  });

  // a collision coming: every screen draws it at the same moment
  stream.addEventListener("conjunction", (event) => {
    expect(JSON.parse(event.data) as Conjunction);
  });

  // it happened: both are gone, the fragments go up, and everyone is told
  // who was involved
  stream.addEventListener("collision", (event) => {
    const story = JSON.parse(event.data) as Story & { a: number; b: number; fragments: Satellite[] };
    for (const id of [story.a, story.b]) destroyed.set(id, story.at);
    // this one has happened, and anything else either was to meet won't
    for (const [key, c] of coming) if ([c.a, c.b].some((id) => id === story.a || id === story.b)) coming.delete(key);
    rebuildHits();
    for (const fragment of story.fragments) sky.set(fragment.id, fragment);
    if (remember({ id: story.id, at: story.at, angle: story.angle, radius: story.radius, parties: story.parties })) tell(story);
    renderSummary();
  });

  stream.addEventListener("error", () => {
    setConnection("offline");
    if (stream.readyState === EventSource.CLOSED) setTimeout(connect, 3000);
  });
}
connect();
