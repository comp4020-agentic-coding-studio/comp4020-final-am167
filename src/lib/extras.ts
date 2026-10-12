import { seeded } from "./collide.ts";
import { AGAIN, ANSWERS, ANSWER_HOURS, CALLSIGNS, LINES, REGULARS, textOf, type Line } from "./extras-cast.ts";
import type { Band } from "./orbit.ts";
import { dayOf, questionOn } from "./questions.ts";

// The extras (ADR 0021): invented people who launch into the sky like
// anyone, so it's never empty of people, as a film's extras keep a street
// from looking like a set. Who they are and what they say is in
// extras-cast.ts; this is when they come and what each visit does.
//
// The schedule is a pure function of the clock, like an orbit: each hour, a
// generator seeded by the hour picks how many visit (busier on a Canberra
// evening than at 4am, and busier some days than others), who (a regular,
// or someone who'll never be back), when, and what each launches: how many
// satellites, a minute or more apart, into which bands, whether a line
// answers the day's question, and whether one is brought down or boosted
// later. So every server agrees on it, and one that was stopped launches
// what it missed at the times it was due (sky.ts).
//
// Their satellites are anyone's satellites: heard, collided, blamed. Only
// the record knows: the owner cookie of each is "extra:" and a key, which no
// browser can have (middleware.ts takes only a UUID), and a regular's
// handle is marked as an extra's, so nobody can sign in as one.

export const HOUR = 3_600_000;

// About this many people visit an hour, across a day, regulars and one-offs
// together; each launches one to three. sky.ts reads EXTRAS_PER_HOUR to
// change it (0 for none), which scales both.
export const PER_HOUR = 0.6;

export const EXTRA = "extra:";
export const isExtra = (owner: string | null | undefined): boolean => typeof owner === "string" && owner.startsWith(EXTRA);

type Random = () => number;

// How busy each hour of the day is in Canberra, from midnight: quiet in the
// small hours, a lunchtime bump, busiest in the evening. Scaled so a day
// averages PER_HOUR.
const SHAPE = [0.45, 0.3, 0.15, 0.1, 0.1, 0.15, 0.35, 0.65, 0.85, 0.9, 1, 1, 1.15, 1.1, 1, 1, 1.1, 1.25, 1.45, 1.75, 1.95, 1.9, 1.5, 0.95];
const SHAPE_MEAN = SHAPE.reduce((sum, x) => sum + x, 0) / SHAPE.length;

// the hour of the day and the month (1 to 12) in Canberra, summer time
// included
const clock = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", hourCycle: "h23", month: "numeric" });
const partOf = (time: number, type: "hour" | "month") => Number(clock.formatToParts(time).find((part) => part.type === type)?.value ?? 0);
const hourIn = (time: number): number => partOf(time, "hour") % 24;
const monthIn = (time: number): number => partOf(time, "month");

// Some days are busier than others: 0.7 to 1.3 times as busy, by the day.
const busyness = (hour: number) => 0.7 + 0.6 * seeded(Math.imul(Math.floor((hour + 10) / 24), 0x2c1b3c6d) ^ 0x6a09e667)();

// The one-off visitors' habits: most launch once and go, and few answer
// the question, bring theirs down or boost it.
const ONE_OFF = {
  visits: [0.74, 0.19, 0.07],
  bands: { low: 0.48, mid: 0.34, high: 0.18 } as Partial<Record<Band, number>>,
  answers: 0.35,
  deorbits: 0.05,
  boosts: 0.05,
};
// one-off visitors an hour, on average: the rest of PER_HOUR is regulars
const ONE_OFFS = PER_HOUR - REGULARS.reduce((sum, regular) => sum + regular.perDay, 0) / 24;

// A launch after the first in a visit: a minute and ten seconds or more
// after the one before (the launch gap is a minute, sky.ts), mostly two or
// three.
const AGAIN_AFTER = { least: 70_000, mean: 150_000, most: 12 * 60_000 };
// When one is brought down or boosted, after its launch.
const DEORBIT_AFTER = { least: 20 * 60_000, most: 3 * HOUR };
const BOOST_AFTER = { least: 5 * 60_000, most: 45 * 60_000 };
// how far back a visit's later launches and manoeuvres can reach
const REACH = 5;

interface PlannedLaunch {
  at: number;
  band: Band;
  // whether it answers the day's question (if the cast has answers to it)
  answers: boolean;
  // a later launch of the visit: whether it says so ("one more for luck"),
  // and for a one-off, whether it gets a new callsign rather than the
  // first one numbered
  again: boolean;
  fresh: boolean;
  // seeds the orbit, so it's the same on every server
  seed: number;
  manoeuvre: { type: "deorbit" | "boost"; at: number; seed: number } | null;
}

interface Visit {
  // a regular (an index into REGULARS), or -1 for a one-off
  who: number;
  owner: string;
  launches: PlannedLaunch[];
}

const pick = (random: Random, weights: number[]): number => {
  let left = random() * weights.reduce((sum, w) => sum + w, 0);
  for (let i = 0; i < weights.length; i++) {
    left -= weights[i];
    if (left < 0) return i;
  }
  return weights.length - 1;
};

function bandOf(random: Random, bands: Partial<Record<Band, number>>): Band {
  const entries = Object.entries(bands) as [Band, number][];
  return entries[pick(random, entries.map(([, weight]) => weight))][0];
}

// How many visit in an hour: Poisson around `mean`, so some hours have none
// and some a few.
function howMany(random: Random, mean: number): number {
  const u = random();
  let k = 0;
  let p = Math.exp(-mean);
  let sum = p;
  while (u > sum && k < 12) {
    k++;
    p *= mean / k;
    sum += p;
  }
  return k;
}

const within = (hour: number, [from, to]: [number, number]) => (from <= to ? hour >= from && hour < to : hour >= from || hour < to);

// Whether a regular comes this hour: on about `perDay` days, once that day,
// at any hour of their window, each as likely (so one visit's launches
// can't run into the next's, and no hour of the window is skipped). The day
// is the one their window starts on, so a window past midnight is one
// visit, decided by its own generator.
function comes(i: number, hour: number, local: number, scale: number): boolean {
  const regular = REGULARS[i];
  if (!within(local, regular.hours)) return false;
  // an hour that comes twice as the clocks go back: the first only
  if (hourIn((hour - 1) * HOUR + HOUR / 2) === local) return false;
  const [from, to] = regular.hours;
  const length = (to - from + 24) % 24 || 24;
  const into = (local - from + 24) % 24;
  const day = dayOf((hour - into) * HOUR + HOUR / 2);
  const random = seeded(Math.imul(day, 0x27d4eb2d) ^ Math.imul(i + 1, 0x165667b1));
  if (random() >= Math.min(1, regular.perDay * scale * busyness(hour - into))) return false;
  return Math.floor(random() * length) === into;
}

// An hour's visits, in the order they come. Kept for a while: every settle
// asks when the next is.
const plans = new Map<string, Visit[]>();
function plan(hour: number, rate: number): Visit[] {
  const key = `${rate}:${hour}`;
  const known = plans.get(key);
  if (known) return known;
  if (plans.size > 2_000) plans.clear();
  const visits: Visit[] = [];
  if (rate > 0) {
    const random = seeded(Math.imul(hour, 0x9e3779b1) ^ 0x0e47a5);
    const local = hourIn(hour * HOUR + HOUR / 2);
    const scale = rate / PER_HOUR;
    // the regulars who come this hour, then however many one-offs
    const who = REGULARS.flatMap((_, i) => (comes(i, hour, local, scale) ? [i] : []));
    const k = howMany(random, (ONE_OFFS * scale * SHAPE[local] * busyness(hour)) / SHAPE_MEAN);
    for (let n = 0; n < k; n++) who.push(-1);
    for (const [i, one] of who.entries()) {
      let at = hour * HOUR + Math.floor(random() * HOUR);
      const habits = one >= 0 ? REGULARS[one] : ONE_OFF;
      const count = 1 + pick(random, habits.visits);
      const launches: PlannedLaunch[] = [];
      for (let j = 0; j < count; j++) {
        if (j > 0) at += AGAIN_AFTER.least + Math.min(Math.floor(-Math.log(1 - random()) * AGAIN_AFTER.mean), AGAIN_AFTER.most);
        const band = bandOf(random, habits.bands);
        // people answer the question once a visit, if at all
        const answers = random() < (j === 0 ? habits.answers : habits.answers / 4);
        const again = j > 0 && random() < 0.5;
        const fresh = random() < 0.4;
        const seed = Math.floor(random() * 2 ** 32);
        const [roll, when, manoeuvreSeed] = [random(), random(), Math.floor(random() * 2 ** 32)];
        const between = (span: { least: number; most: number }) => at + span.least + Math.floor(when * (span.most - span.least));
        const manoeuvre =
          roll < habits.deorbits
            ? { type: "deorbit" as const, at: between(DEORBIT_AFTER), seed: manoeuvreSeed }
            : roll < habits.deorbits + habits.boosts && band !== "high"
              ? { type: "boost" as const, at: between(BOOST_AFTER), seed: manoeuvreSeed }
              : null;
        launches.push({ at, band, answers, again, fresh, seed, manoeuvre });
      }
      visits.push({ who: one, owner: `${EXTRA}${one >= 0 ? REGULARS[one].key : `${hour}.${i}`}`, launches });
    }
    visits.sort((a, b) => a.launches[0].at - b.launches[0].at);
  }
  plans.set(key, visits);
  return visits;
}

// ── what they say ─────────────────────────────────────────────────────────

// Lines and callsigns come from pools, each dealt in a shuffled order that
// is used up before any comes round again, so nobody says the same thing
// twice in a day. Which one a launch gets depends on how many have been
// dealt from its pool before it, counted from the plans since START.

// counted from just before the extras were first deployed, so a regular's
// callsigns don't start at NIGHTJAR 40
const START = Math.floor(Date.UTC(2026, 9, 11) / HOUR);

const hash = (text: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h;
};

function shuffle(list: number[], random: Random): number[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// The order a pool is dealt in, each time round: shuffled afresh, but each
// half of the last round's order stays in its half, so a line dealt late in
// one round can't come straight back early in the next. Anything comes
// round again at least half a pool later.
const orders = new Map<string, number[]>();
function orderOf(pool: string, size: number, round: number): number[] {
  const key = `${pool}:${size}:${round}`;
  const known = orders.get(key);
  if (known) return known;
  const random = seeded(hash(pool) ^ Math.imul(round + 1, 0x85ebca6b));
  let order: number[];
  if (round === 0) order = shuffle(Array.from({ length: size }, (_, i) => i), random);
  else {
    const last = orderOf(pool, size, round - 1);
    const half = Math.floor(size / 2);
    order = [...shuffle(last.slice(0, half), random), ...shuffle(last.slice(half), random)];
  }
  if (orders.size > 2_000) orders.clear();
  orders.set(key, order);
  return order;
}

const dealt = <T>(pool: string, list: readonly T[], k: number): T =>
  list[orderOf(pool, list.length, Math.floor(k / list.length))[k % list.length]];

// Where and when a launch says its line: the hour and month in Canberra,
// its band, and what will become of it (extras-cast.ts, Fit).
interface Moment {
  local: number;
  month: number;
  band: Band;
  does: "deorbit" | "boost" | null;
}
const fits = (line: Line, moment: Moment): boolean =>
  typeof line === "string" ||
  ((!line.hours || within(moment.local, line.hours)) &&
    (!line.months || line.months.includes(moment.month)) &&
    (!line.bands || line.bands.includes(moment.band)) &&
    (!line.does || line.does === moment.does));

// The next line dealt from a pool that fits the launch: one that doesn't
// ("9pm at the bus interchange" at lunchtime, "going high" from the low
// band) is passed over, and waits for the next time round.
function say(pool: string, list: readonly Line[], deal: (pool: string) => number, moment: Moment): string {
  let line = dealt(pool, list, deal(pool));
  for (let tries = 1; !fits(line, moment) && tries < list.length; tries++) line = dealt(pool, list, deal(pool));
  return textOf(line);
}

// A one-off's later launch can number its first callsign ("Pebble 2"), if
// there's room and it doesn't end in a number already.
const numberable = (callsign: string) => callsign.length <= 13 && !/\d$/.test(callsign);
const numbered = (callsign: string, n: number) => `${callsign}${/[A-Z]{2}/.test(callsign) ? "-" : " "}${n}`;

// What a launch says, and the question it answers, if any. It answers the
// day's question if it means to and the day has dealt under half of that
// question's answers (every one dealt counts, said or passed over), so
// none is said twice in a day however busy; otherwise it says something
// of its own.
function lineFor(
  visit: Visit,
  launch: PlannedLaunch,
  counts: Map<string, number>,
  deal: (pool: string) => number,
): { beacon: string; question: string | null } {
  const moment: Moment = { local: hourIn(launch.at), month: monthIn(launch.at), band: launch.band, does: launch.manoeuvre?.type ?? null };
  const day = dayOf(launch.at);
  const question = questionOn(day);
  const answers = ANSWERS[question];
  const hours = ANSWER_HOURS[question];
  if (launch.answers && answers?.length && (!hours || within(moment.local, hours))) {
    const today = `answered:${day}`;
    while ((counts.get(today) ?? 0) < answers.length / 2) {
      counts.set(today, (counts.get(today) ?? 0) + 1);
      const line = dealt(`answers:${question}`, answers, deal(`answers:${question}`));
      if (fits(line, moment)) return { beacon: textOf(line), question };
    }
  }
  const regular = visit.who >= 0 ? REGULARS[visit.who] : null;
  if (launch.again) return { beacon: say("again", AGAIN, deal, moment), question: null };
  if (regular) return { beacon: say(`lines:${regular.key}`, regular.lines, deal, moment), question: null };
  return { beacon: say("lines", LINES, deal, moment), question: null };
}

// How many each pool had dealt before an hour (counted by dealing them all,
// so the count can't disagree with the dealing), kept each day of the way.
const daily = new Map<string, Map<string, number>>();
function dealtBefore(hour: number, rate: number): Map<string, number> {
  const to = Math.max(hour, START);
  let from = START;
  let counts = new Map<string, number>();
  for (let day = Math.floor((to - START) / 24); day > 0; day--) {
    const known = daily.get(`${rate}:${day}`);
    if (known) {
      counts = new Map(known);
      from = START + day * 24;
      break;
    }
  }
  for (let h = from; h < to; h++) {
    if (h > START && (h - START) % 24 === 0) {
      // a day's answers count only that day: forget the days gone
      const today = dayOf(h * HOUR);
      for (const key of counts.keys()) if (key.startsWith("answered:") && Number(key.slice(9)) < today - 1) counts.delete(key);
      daily.set(`${rate}:${(h - START) / 24}`, new Map(counts));
    }
    eventsIn(h, rate, counts);
  }
  return counts;
}

// ── what the station does for them ────────────────────────────────────────

// A launch for an extra, or a manoeuvre of one of theirs (found by its
// owner and when it was launched).
export interface ExtraLaunch {
  type: "launch";
  at: number;
  owner: string;
  // a regular's claimed handle, or null
  handle: string | null;
  // which regular (their key), or null for a one-off. A regular's callsign
  // here is what the schedule alone would number it; the server numbers it
  // from the record (callsignOf), so it counts what was really launched.
  regular: string | null;
  band: Band;
  callsign: string;
  beacon: string;
  // the question it answers, as asked that day (ADR 0018)
  question: string | null;
  seed: number;
}
export interface ExtraManoeuvre {
  type: "deorbit" | "boost";
  at: number;
  owner: string;
  launchedAt: number;
  seed: number;
}
export type ExtraEvent = ExtraLaunch | ExtraManoeuvre;

// An hour's launches, and the manoeuvres that follow them (some in later
// hours), given what each pool had dealt before it; `counts` is moved on
// past them. A regular's callsigns are counted, not dealt: they number
// them.
function eventsIn(hour: number, rate: number, counts: Map<string, number>): ExtraEvent[] {
  const events: ExtraEvent[] = [];
  const deal = (pool: string) => {
    const k = counts.get(pool) ?? 0;
    counts.set(pool, k + 1);
    return k;
  };
  for (const visit of plan(hour, rate)) {
    const regular = visit.who >= 0 ? REGULARS[visit.who] : null;
    // a one-off's first name, and how many of the visit's have had it
    let first = "";
    let named = 0;
    visit.launches.forEach((launch, j) => {
      let callsign: string;
      if (regular) callsign = regular.callsign(deal(`callsign:${regular.key}`));
      else if (j === 0 || launch.fresh) callsign = dealt("callsigns", CALLSIGNS, deal("callsigns"));
      // the first one numbered ("Pebble 2"), or its name again if that
      // won't do
      else callsign = numberable(first) ? numbered(first, named + 1) : first;
      if (j === 0) first = callsign;
      if (j === 0 || (!regular && !launch.fresh)) named++;
      const { beacon, question } = lineFor(visit, launch, counts, deal);
      const { at, band, seed, manoeuvre } = launch;
      events.push({ type: "launch", at, owner: visit.owner, handle: regular?.handle ?? null, regular: regular?.key ?? null, band, callsign, beacon, question, seed });
      if (manoeuvre) events.push({ ...manoeuvre, owner: visit.owner, launchedAt: at });
    });
  }
  return events;
}

const byTime = (a: ExtraEvent, b: ExtraEvent) => a.at - b.at || (a.owner < b.owner ? -1 : a.owner > b.owner ? 1 : 0);

// Everything due after `from`, up to and including `to`, in time order.
export function extrasBetween(from: number, to: number, rate = PER_HOUR): ExtraEvent[] {
  if (!(rate > 0) || !(to > from)) return [];
  const first = Math.floor(from / HOUR) - REACH;
  const counts = dealtBefore(first, rate);
  const events: ExtraEvent[] = [];
  for (let hour = first; hour <= Math.floor(to / HOUR); hour++) {
    // before START nothing was counted, and nothing is now
    for (const event of eventsIn(hour, rate, hour < START ? new Map() : counts)) {
      if (event.at > from && event.at <= to) events.push(event);
    }
  }
  return events.sort(byTime);
}

// When the next thing is due after `from` (looking two days ahead at most).
export function nextExtraAfter(from: number, rate = PER_HOUR): number {
  if (!(rate > 0)) return Infinity;
  let next = Infinity;
  const last = Math.floor(from / HOUR) + 48;
  for (let hour = Math.floor(from / HOUR) - REACH; hour <= last; hour++) {
    for (const visit of plan(hour, rate)) {
      for (const launch of visit.launches) {
        for (const at of [launch.at, launch.manoeuvre?.at ?? Infinity]) if (at > from && at < next) next = at;
      }
    }
    // every later hour's launches, and so its manoeuvres, come after it
    // starts
    if (next <= (hour + 1) * HOUR) break;
  }
  return next;
}

// A regular's nth satellite's callsign, n counted from 0 in the record; a
// one-off's as the schedule named it.
export function callsignOf(launch: ExtraLaunch, launched: number): string {
  const regular = launch.regular === null ? undefined : REGULARS.find((r) => r.key === launch.regular);
  return regular ? regular.callsign(launched) : launch.callsign;
}
