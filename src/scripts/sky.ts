import { onAir } from "../lib/airtime.ts";
import { ago, until } from "../lib/format.ts";
import { BANDS, bandAt, climbing, plungeAt, radiusAt, reentryAt, type Band } from "../lib/orbit.ts";
import { STATIONS, nextStation, stationOver, untilStation, type StationId } from "../lib/stations.ts";
import { blame, couplet, headline, heardBy, listeningNow, passes, sharedQuestion, skyCount, staticFrom, type StoryParty } from "../lib/story.ts";
import type { HeardItem } from "../lib/heard.ts";
import type { WreckPiece } from "../lib/wreck.ts";
import { countdown } from "./countdown.ts";
import { wireManoeuvres } from "./manoeuvres.ts";
import { objectCard } from "./object-card.ts";

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
  // a fragment's piece of the lines that broke it, heard as static (ADR 0017)
  words: string | null;
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
  // what the wreck says (ADR 0017)
  wreck: WreckPiece[];
}

const initial = JSON.parse(document.getElementById("sky-data")!.textContent!) as {
  serverTime: number;
  sky: Satellite[];
  launched: number | null;
  // the view it opens on (ADR 0014): a station's horizon, or the whole sky
  view: StationId | null;
  conjunctions: Conjunction[];
  collisions: Story[];
  // what the stations have heard, how many have heard each one up, and
  // who's listening (ADR 0016)
  heard: HeardItem[];
  heardBy: Record<number, number>;
  listening: number;
};

// Server time minus local time; refined when the stream says hello.
let offset = initial.serverTime - Date.now();
const serverNow = () => Date.now() + offset;
const sky = new Map(initial.sky.map((s) => [s.id, s]));
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

const hue = (id: number) => (id * 137.508) % 360;
// how many people have heard each beacon still up (ADR 0016)
const heardCount = new Map(Object.entries(initial.heardBy).map(([id, n]) => [Number(id), n]));

// Everything falls and burns up (ADR 0007). A burned-up object stays in the
// scene this long after, while its wake fades, but leaves the stations and
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
  // or it didn't burn up: it was destroyed in a collision (only your own
  // are kept, for your line under the stations)
  destroyed?: boolean;
}
const burnUps = new Map<number, BurnUp>();
// people's satellites only: wreckage burning up isn't news
const burned = (sat: Satellite) => {
  if (sat.kind === "satellite" && sat.callsign)
    burnUps.set(sat.id, { callsign: sat.callsign, at: reentryAt(sat), mine: sat.mine, deorbited: sat.deorbitedAt !== null });
};
const burnedUp = (b: BurnUp) =>
  b.destroyed ? "was destroyed in a collision" : b.deorbited ? "was brought down, and burned up" : "burned up on re-entry";
// the latest, and your own
const latest = (mine = false) => {
  let found: BurnUp | null = null;
  for (const b of burnUps.values()) if ((!mine || b.mine) && (!found || b.at > found.at)) found = b;
  return found;
};

// ── the scene ─────────────────────────────────────────────────────────────

// Three.js is most of the page's weight, so it loads on its own while the
// beacons and the summary start working.
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
      initial: initial.view,
      reduced,
      obstacles: [
        document.querySelector<HTMLElement>(".sky-page .panels")!,
        document.getElementById("views")!,
        ...(document.getElementById("launched-notice") ? [document.getElementById("launched-notice")!] : []),
        document.getElementById("collision-card")!,
        // an object's card, beside the beacons (it's not modal here)
        document.getElementById("object-card")!,
      ],
      selected: () => historyCard?.showing() ?? null,
    });
    if (!started) return noScene();
    requestAnimationFrame(() => requestAnimationFrame(() => canvas.classList.add("drawn")));
    // the whole planet with every orbit in view, or the horizon over a station
    const views = document.getElementById("views")!;
    const buttons = [...views.querySelectorAll<HTMLButtonElement>("button[data-view]")];
    views.hidden = false;
    for (const button of buttons) {
      button.addEventListener("click", () => {
        if (button.getAttribute("aria-pressed") === "true") return;
        for (const b of buttons) b.setAttribute("aria-pressed", String(b === button));
        const id = (button.dataset.view || null) as StationId | null;
        started.view(id);
        describe(id);
      });
    }
    // click (or tap, with a wider reach) an object to open its history
    const reach = (event: MouseEvent) => ((event as PointerEvent).pointerType === "touch" ? 32 : 22);
    canvas.addEventListener("click", (event) => {
      const id = started.pick(event.clientX, event.clientY, reach(event));
      if (id !== null) historyCard?.open(id);
    });
    canvas.addEventListener("mousemove", (event) => {
      canvas.style.cursor = started.pick(event.clientX, event.clientY, reach(event)) === null ? "" : "pointer";
    });
    const hint = document.getElementById("pick-hint")!;
    if (matchMedia("(pointer: coarse)").matches) hint.querySelector("span")!.textContent = "Tap anything in the sky to see its history";
    hint.hidden = false;
  })
  // the chunk didn't load (offline, or a deploy replaced it), or the scene
  // failed to start
  .catch(noScene);

// ── an object's history (ADR 0012) ───────────────────────────────────────

// Its card pops up down the right (ADR 0015), filled with the history the
// server tells, for a click in the scene or on any name. A collision
// anywhere can add to what followed an object, so the open one is asked
// for again.
const historyCard = objectCard(serverNow);
const refreshHistory = (id?: number) => historyCard?.refresh(id);

// ── what the stations hear (ADR 0014) ─────────────────────────────────────

// A row for each station: what it hears now, or what it hears next.
const posts = STATIONS.map((station) => {
  const row = document.querySelector<HTMLElement>(`[data-station="${station.id}"]`)!;
  return {
    station,
    row,
    heard: row.querySelector<HTMLElement>("[data-heard]")!,
    next: row.querySelector<HTMLElement>("[data-next]")!,
    key: "",
    said: "",
  };
});
const yourPass = document.getElementById("your-pass");

// what the stations hear: satellites with a beacon, and fragments carrying
// words, as static (ADR 0017); derelicts and the rest of the debris are
// silent
const lineOf = (sat: Satellite) => (sat.kind === "debris" ? sat.words : sat.beacon) ?? "";
const speaking = () => flying().filter((sat) => lineOf(sat) !== "");
// people's satellites among them, for the news
const satellites = () => speaking().filter((sat) => sat.kind === "satellite");

function listen() {
  const time = serverNow();
  const talking = speaking();
  const over = new Map(talking.map((sat) => [sat.id, stationOver(sat, time)]));
  for (const post of posts) {
    const here = talking.filter((sat) => over.get(sat.id)?.id === post.station.id).sort((a, b) => a.id - b.id);
    // more than one overhead take turns, each beacon long enough to read and
    // all the static sharing one, by the server's clock, so every screen
    // shows the same one at once, and the server credits who was on air
    // (airtime.ts)
    const now = onAir(
      here.map((s) => ({ id: s.id, text: lineOf(s), static: s.kind === "debris", sat: s })),
      time,
    );
    const sat = now?.speaker.sat;
    const key = sat ? String(sat.id) : "";
    if (key !== post.key) {
      post.key = key;
      post.row.classList.toggle("live", Boolean(sat));
      post.row.classList.toggle("static", sat?.kind === "debris");
      if (!sat) post.heard.replaceChildren();
      else {
        const name = document.createElement("span");
        name.className = sat.kind === "debris" ? "callsign static-mark" : "callsign";
        name.textContent = sat.kind === "debris" ? "Static" : sat.callsign;
        const beacon = document.createElement("span");
        beacon.className = sat.kind === "debris" ? "beacon static-words" : "beacon";
        beacon.textContent = lineOf(sat);
        post.heard.replaceChildren(name, beacon);
      }
    }
    let said: string;
    const more = here.length > 1 ? ` · ${here.length - 1} more overhead` : "";
    if (sat) said = sat.kind === "debris" ? `${here.length} overhead` : `${heardBy(heardCount.get(sat.id) ?? 0, sat.mine)}${more}`;
    else {
      // the next to come into this station's window
      let soonest: { sat: Satellite; ms: number } | null = null;
      for (const s of talking) {
        const ms = untilStation(s, time, post.station);
        // one that burns up first never gets there
        if (ms !== null && (!soonest || ms < soonest.ms)) soonest = { sat: s, ms };
      }
      const next = soonest?.sat.kind === "debris" ? "static" : soonest?.sat.callsign;
      said = soonest ? `Next: ${next}, in ${countdown(soonest.ms)}` : talking.length > 0 ? "" : "Nothing in orbit";
    }
    if (said !== post.said) post.next.textContent = post.said = said;
  }

  // your own satellites: the one everyone will hear next (or is hearing
  // now), and how long it has left
  const yoursUp = talking.filter((s) => s.mine);
  const heardIn = (s: Satellite) => (over.get(s.id) ? -1 : (nextStation(s, time)?.in ?? Infinity));
  const mine = yoursUp.sort((a, b) => heardIn(a) - heardIn(b))[0];
  const yours = latest(true);
  if (yourPass && mine) {
    const left = until(reentryAt(mine) - time);
    const now = over.get(mine.id);
    const pass = nextStation(mine, time);
    const count = yoursUp.length > 1 ? `You have ${yoursUp.length} up. ` : "";
    say(
      count +
      (plungeAt(mine, time) !== null
        ? `${mine.callsign} is burning up on re-entry.`
        : mine.deorbitedAt !== null
          ? `${mine.callsign} is coming down: it burns up in ${countdown(reentryAt(mine) - time)}.`
          : climbing(mine, time)
            ? `${mine.callsign} is climbing to the ${BANDS[bandAt(radiusAt(mine, mine.until ?? time))].label.toLowerCase()} band.`
            : now
          ? `${mine.callsign} is over ${now.name} now: everyone watching can see your beacon. It burns up in ${left}.`
          : pass === null
            ? `${mine.callsign} burns up in ${left}, before it reaches a ground station.`
            : `${mine.callsign} is next over ${pass.station.name} in ${countdown(pass.in)}. It burns up in ${left}.`),
    );
  } else if (yourPass && yours) {
    say(`${yours.callsign} ${burnedUp(yours)} ${ago(time - yours.at)}. `, true);
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
  yourPass.replaceChildren(text, again, ".");
}

// What's burning now, what burned up last, or what will burn up next: most
// burn up away from the stations, so the summary says so.
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
  const falling = satellites().find((sat) => plungeAt(sat, time) !== null);
  const down = satellites().find((sat) => sat.deorbitedAt !== null && plungeAt(sat, time) === null);
  const rising = satellites().find((sat) => climbing(sat, time));
  const last = latest();
  const story = stories.reduce<Story | null>((a, b) => (a && a.at > b.at ? a : b), null);
  const next = [...coming.values()].filter((c) => c.at > time).sort((a, b) => a.at - b.at)[0];
  const since = (at: number | undefined) => (at === undefined ? Infinity : time - at);
  let text = "";
  if (story && since(story.at) < 2 * 60_000) text = `${headline(story.parties)} ${ago(since(story.at))}.`;
  else if (falling)
    text = `${named(falling)} ${falling.deorbitedAt !== null ? "was brought down, and is burning up" : "is burning up on re-entry"}.`;
  else if (down) text = `${named(down)} is being brought down by its operator, to keep the sky clear.`;
  else if (rising) text = `${named(rising)} is climbing to a higher band, to stay up longer.`;
  else if (next && next.at - time < 10 * 60_000)
    text = `Collision coming: ${who(next.a)} and ${who(next.b)}, in ${countdown(next.at - time)}.`;
  else if (story && since(story.at) < 15 * 60_000) text = `${headline(story.parties)} ${ago(since(story.at))}.`;
  else if (last && since(last.at) < 15 * 60_000) text = `${named(last)} ${burnedUp(last)} ${ago(since(last.at))}.`;
  else if (next) text = `Next collision: ${who(next.a)} and ${who(next.b)}, in ${until(next.at - time)}.`;
  else {
    const soonest = satellites().sort((a, b) => reentryAt(a) - reentryAt(b))[0];
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
// a few seconds (on a phone it sits in the page and stays). After a first
// launch, the seconds start once the explainer over it is closed.
const notice = document.getElementById("launched-notice");
if (notice && getComputedStyle(notice).position === "absolute") {
  // longer when it asks something of you (claiming a handle)
  const fade = () => setTimeout(() => notice.classList.add("fading"), notice.querySelector("a") ? 12_000 : 6000);
  const explainer = document.getElementById("first-launch");
  if (explainer) explainer.addEventListener("close", fade, { once: true });
  else fade();
  notice.addEventListener("transitionend", () => (notice.hidden = true));
}

// ── what was heard (ADR 0016) ─────────────────────────────────────────────

// The feed beside the stations: each beacon heard while someone was
// listening, once, the latest pass first. The server renders it; each pass
// it hears after that comes over the stream and goes to the top.
const feedList = document.getElementById("feed")!;
const feedEmpty = document.getElementById("feed-empty")!;
const FEED = Number(feedList.dataset.size);
let feed: HeardItem[] = initial.heard;
const GONE = { live: null, decayed: "Burned up", deorbited: "Brought down", destroyed: "Destroyed" } as const;

// one card, as src/components/HeardCard.astro makes it
function heardCard(item: HeardItem, fresh = false): HTMLLIElement {
  const debris = item.kind === "debris";
  const li = document.createElement("li");
  li.className = "heard-item";
  li.classList.toggle("mine", item.mine);
  li.classList.toggle("gone", !debris && GONE[item.fate] !== null);
  li.classList.toggle("fresh", fresh && !reduced);
  li.dataset.key = item.key;
  li.classList.toggle("static", debris);
  const who = document.createElement("p");
  who.className = "heard-who";
  const link = document.createElement("a");
  link.href = `/object/${item.id}/`;
  const when = document.createElement("time");
  when.className = "heard-when";
  when.dateTime = new Date(item.at).toISOString();
  when.textContent = ago(serverNow() - item.at);
  const line = document.createElement("p");
  line.className = "heard-line";
  if (debris) {
    // static: a fragment carrying pieces of the lines that broke it
    const mark = document.createElement("span");
    mark.className = "static-mark";
    mark.textContent = "Static";
    link.className = "heard-from";
    link.textContent = staticFrom(item.from);
    who.append(mark, link, when);
    const words = document.createElement("span");
    words.className = "static-words";
    words.textContent = item.words;
    line.append(words);
  } else {
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.setProperty("--hue", String(hue(item.id)));
    const name = document.createElement("strong");
    name.textContent = item.callsign;
    link.append(name);
    who.append(swatch, link);
    // a handle if it has one; nothing if not (no "no handle" on every card)
    if (item.mine || item.handle) {
      const handle = document.createElement("span");
      handle.className = "heard-handle";
      handle.textContent = item.mine ? "yours" : item.handle;
      who.append(handle);
    }
    who.append(when);
    line.textContent = item.beacon;
  }
  // the stations' question it answered (ADR 0018)
  const asked = document.createElement("p");
  if (item.question) {
    asked.className = "heard-question";
    const q = document.createElement("q");
    q.textContent = item.question;
    asked.append("Answering ", q);
  }
  const meta = document.createElement("p");
  meta.className = "heard-meta";
  const gone = GONE[item.fate];
  meta.textContent = debris
    ? `Over ${item.station} · ${passes(item.passes)} · ${item.up === 0 ? "all fallen silent" : `${item.up} of ${item.pieces} pieces still up`}`
    : `Over ${item.station} · ${heardBy(item.heardBy, item.mine)} · ${passes(item.passes)}${gone ? ` · ${gone}` : ""}`;
  li.append(who, line, ...(item.question ? [asked] : []), meta);
  return li;
}

function renderFeed() {
  feedList.replaceChildren(...feed.map((item) => heardCard(item)));
  feedEmpty.hidden = feed.length > 0;
}

// A pass, heard. A card already in the feed is updated where it is: cards
// never jump under the reader (the review, 2026-10-07); a new one goes on
// top, lit for a moment.
function heard(item: HeardItem) {
  heardCount.set(item.id, item.heardBy);
  const listed = feed.findIndex((f) => f.key === item.key);
  if (listed >= 0) {
    feed[listed] = item;
    feedList.querySelector(`[data-key="${CSS.escape(item.key)}"]`)?.replaceWith(heardCard(item));
    return;
  }
  feed = [item, ...feed].slice(0, FEED);
  feedList.prepend(heardCard(item, true));
  while (feedList.children.length > FEED) feedList.lastElementChild!.remove();
  feedEmpty.hidden = true;
}

// A beacon in the feed has come down or been destroyed: its card says so.
function ended(id: number, fate: HeardItem["fate"]) {
  const item = feed.find((f) => f.id === id && f.kind !== "debris");
  if (!item || item.fate === fate) return;
  item.fate = fate;
  feedList.querySelector(`[data-key="${CSS.escape(item.key)}"]`)?.replaceWith(heardCard(item));
}

// How many people have the sky open now, this page included.
const listeningLine = document.getElementById("listening")!;
function listeners(n: number) {
  listeningLine.dataset.listening = String(n);
  listeningLine.textContent = listeningNow(n);
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
  const link = document.createElement("a");
  link.href = `/object/${sat.id}/`;
  link.dataset.history = String(sat.id);
  const name = document.createElement("strong");
  name.textContent = sat.callsign;
  link.append(name);
  what.append(link, `${sat.mine ? " (yours)" : ""} to ${BANDS[sat.band].label}`);
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
  describe(viewing);
}

// What the scene shows, for a screen reader.
let viewing = initial.view;
function describe(view: StationId | null) {
  viewing = view;
  const station = STATIONS.find((s) => s.id === view);
  canvas.setAttribute(
    "aria-label",
    station
      ? `The sky over ${station.name}: ${count.textContent}. Most rise on the left and set on the right; some go the other way.`
      : `The whole sky, with the three ground stations: ${count.textContent}.`,
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
  // two answers to the same question (ADR 0018)
  const both = sharedQuestion(story.parties);
  const asked = document.createElement("p");
  asked.className = "collision-question";
  if (both) {
    const q = document.createElement("q");
    q.textContent = both;
    asked.append("Both were answering ", q);
  }
  card.replaceChildren(title, ...lines, ...(both ? [asked] : []), ...wreckOf(story.wreck), who);
  card.hidden = false;
  card.classList.remove("fading");
  clearTimeout(cardTimer);
  cardTimer = setTimeout(() => card.classList.add("fading"), CARD_MS);
}
card.addEventListener("transitionend", () => {
  if (card.classList.contains("fading")) card.hidden = true;
});

// What the wreck says, as src/components/Wreck.astro tells it (ADR 0017):
// nothing, if what met said nothing.
function wreckOf(pieces: WreckPiece[]): HTMLElement[] {
  if (pieces.length === 0) return [];
  const line = document.createElement("p");
  line.className = "wreck";
  const label = document.createElement("span");
  label.className = "wreck-label";
  label.textContent = "The wreck says";
  line.append(label, " ");
  pieces.forEach((piece, i) => {
    if (i > 0) {
      const between = document.createElement("span");
      between.className = "wreck-between";
      between.setAttribute("aria-hidden", "true");
      between.textContent = " / ";
      line.append(between);
    }
    const words = document.createElement("span");
    words.className = piece.up ? "wreck-piece" : "wreck-piece silent";
    words.textContent = piece.words;
    line.append(words);
  });
  return [line];
}
// a collision that happened just before the page opened
const fresh = stories.find((story) => serverNow() - story.at < CARD_MS);
if (fresh) tell(fresh);

// keep "5 min ago" honest
setInterval(() => {
  for (const time of [...recentList.querySelectorAll("time"), ...feedList.querySelectorAll("time")]) {
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
// from your satellite's card: its new orbit, here at once, and the card
// asked for again
wireManoeuvres<Satellite>({
  inPlace: (sat) => {
    manoeuvred(sat);
    listen();
    historyCard?.refresh(sat.id, true);
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
let current: EventSource | null = null;
function connect() {
  const stream = new EventSource("/api/events");
  current = stream;

  stream.addEventListener("hello", (event) => {
    const hello = JSON.parse(event.data) as {
      serverTime: number;
      sky: Satellite[];
      conjunctions: Conjunction[];
      collisions: Story[];
      heard: HeardItem[];
      heardBy: Record<number, number>;
      listening: number;
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
    // and what was heard while away, and who's here now
    feed = hello.heard;
    for (const [id, n] of Object.entries(hello.heardBy)) heardCount.set(Number(id), n);
    renderFeed();
    listeners(hello.listening);
    renderSummary();
    setConnection("live");
  });

  // a beacon came over a station while people were listening
  stream.addEventListener("heard", (event) => {
    heard(JSON.parse(event.data) as HeardItem);
  });

  stream.addEventListener("audience", (event) => {
    listeners((JSON.parse(event.data) as { listening: number }).listening);
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
    refreshHistory(sat.id);
    ended(sat.id, sat.deorbitedAt === null ? "decayed" : "deorbited");
  });

  // an owner brought one down or boosted it: its new orbit
  stream.addEventListener("manoeuvre", (event) => {
    const told = JSON.parse(event.data) as { manoeuvre: "deorbit" | "boost"; object: Satellite };
    manoeuvred(told.object);
    refreshHistory(told.object.id);
  });

  // a collision coming: every screen draws it at the same moment
  stream.addEventListener("conjunction", (event) => {
    expect(JSON.parse(event.data) as Conjunction);
  });

  // it happened: both are gone, the fragments go up, and everyone is told
  // who was involved
  stream.addEventListener("collision", (event) => {
    const story = JSON.parse(event.data) as Story & { a: number; b: number; fragments: Satellite[] };
    for (const id of [story.a, story.b]) {
      destroyed.set(id, story.at);
      ended(id, "destroyed");
      // yours: the line under the stations says so, once it's gone
      const sat = sky.get(id);
      if (sat?.mine && sat.callsign) burnUps.set(id, { callsign: sat.callsign, at: story.at, mine: true, deorbited: false, destroyed: true });
    }
    // this one has happened, and anything else either was to meet won't
    for (const [key, c] of coming) if ([c.a, c.b].some((id) => id === story.a || id === story.b)) coming.delete(key);
    rebuildHits();
    for (const fragment of story.fragments) sky.set(fragment.id, fragment);
    if (remember({ id: story.id, at: story.at, angle: story.angle, radius: story.radius, parties: story.parties, wreck: story.wreck })) tell(story);
    renderSummary();
    refreshHistory();
  });

  stream.addEventListener("error", () => {
    setConnection("offline");
    if (stream.readyState === EventSource.CLOSED && current === stream) setTimeout(connect, 3000);
  });
}
connect();

// A tab left hidden stops listening after a minute: it isn't anyone's
// audience (ADR 0016). Coming back to it reconnects, and the stream's hello
// catches the page up.
let hiddenFor: ReturnType<typeof setTimeout> | undefined;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    hiddenFor = setTimeout(() => {
      current?.close();
      current = null;
      connection.dataset.state = "offline";
      connection.textContent = "Paused";
    }, 60_000);
  } else {
    clearTimeout(hiddenFor);
    if (!current) connect();
  }
});
