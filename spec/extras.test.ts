import { describe, expect, it, vi } from "vitest";
import { AGAIN, ANSWERS, ANSWER_HOURS, CALLSIGNS, LINES, REGULARS, textOf, type Line } from "../src/lib/extras-cast.ts";
import { EXTRA, HOUR, PER_HOUR, extrasBetween, isExtra, nextExtraAfter, type ExtraEvent, type ExtraLaunch } from "../src/lib/extras.ts";
import { blocked, readLaunch } from "../src/lib/launch.ts";
import { QUESTIONS, dayOf, questionOn } from "../src/lib/questions.ts";

// The extras (ADR 0021): invented people who launch like anyone. They have
// to pass for people: say things a person would type into the form, at the
// hours people are about, a minute or more apart, answering the day's
// question sometimes, never the same line twice in a day; and their
// schedule has to be the same however it's asked, so every server (and a
// stopped one catching up) launches the same ones.

const DAY = 24 * HOUR;
const MINUTE = 60_000;
// midnight on 12 October 2026 in Canberra (AEDT, UTC+11)
const FROM = Date.UTC(2026, 9, 11, 13);
const DAYS = 28;
const events = extrasBetween(FROM, FROM + DAYS * DAY, PER_HOUR);
const launches = events.filter((event): event is ExtraLaunch => event.type === "launch");
const manoeuvres = events.filter((event) => event.type !== "launch");

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
};
const passes = (callsign: string, beacon: string) => readLaunch(form({ band: "low", callsign, beacon })).ok;

// the hour of the day, and the month, in Canberra
const hourIn = (time: number) =>
  Number(new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", hourCycle: "h23" }).format(time)) % 24;
const monthIn = (time: number) => Number(new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", month: "numeric" }).format(time));
const within = (hour: number, [from, to]: readonly [number, number]) => (from <= to ? hour >= from && hour < to : hour >= from || hour < to);
const isRegular = (owner: string) => REGULARS.some((r) => owner === `${EXTRA}${r.key}`);
// every line in the cast, by its text
const LINE = new Map<string, Line>(
  [...LINES, ...AGAIN, ...Object.values(ANSWERS).flat(), ...REGULARS.flatMap((r) => r.lines)].map((line) => [textOf(line), line]),
);

describe("the extras' cast", () => {
  it("only says what a person could have typed into the launch form", () => {
    for (const line of [...LINES, ...AGAIN, ...Object.values(ANSWERS).flat(), ...REGULARS.flatMap((r) => r.lines)].map(textOf)) {
      expect(passes("PEBBLE", line), line).toBe(true);
    }
    for (const callsign of [...CALLSIGNS, ...REGULARS.flatMap((r) => Array.from({ length: 60 }, (_, n) => r.callsign(n)))]) {
      expect(passes(callsign, "hello"), callsign).toBe(true);
    }
  });

  it("claims only handles a person could claim, each once", () => {
    const handles = REGULARS.flatMap((r) => (r.handle ? [r.handle] : []));
    for (const handle of handles) {
      expect(handle).toMatch(/^[A-Za-z0-9_-]{3,20}$/);
      expect(blocked(handle)).toBe(false);
    }
    expect(new Set(handles.map((h) => h.toLowerCase())).size).toBe(handles.length);
    expect(new Set(REGULARS.map((r) => r.key)).size).toBe(REGULARS.length);
  });

  it("has a dozen answers to every question the stations ask, and none twice", () => {
    for (const question of QUESTIONS) {
      expect(ANSWERS[question]?.length ?? 0, `no answers to "${question}" in extras-cast.ts`).toBeGreaterThanOrEqual(12);
    }
    const all = [...LINES, ...AGAIN, ...Object.values(ANSWERS).flat(), ...REGULARS.flatMap((r) => r.lines)].map(textOf);
    expect(all.length - new Set(all).size).toBe(0);
  });
});

describe("the extras' schedule", () => {
  it("launches about as often as people visit, busiest in a Canberra evening", () => {
    const perDay = launches.length / DAYS;
    expect(perDay).toBeGreaterThan(15);
    expect(perDay).toBeLessThan(40);
    const evening = launches.filter((l) => hourIn(l.at) >= 18 && hourIn(l.at) < 22).length;
    const smallHours = launches.filter((l) => hourIn(l.at) >= 2 && hourIn(l.at) < 6).length;
    expect(evening).toBeGreaterThan(4 * smallHours);
    // and not like clockwork: some days quieter, some busier
    const days = Array.from({ length: DAYS }, (_, d) => launches.filter((l) => l.at > FROM + d * DAY && l.at <= FROM + (d + 1) * DAY).length);
    expect(Math.max(...days)).toBeGreaterThan(1.5 * Math.min(...days));
  });

  it("is a crowd of one-off visitors and a few regulars, mostly without a handle", () => {
    const owners = new Set(launches.map((l) => l.owner));
    expect(owners.size).toBeGreaterThan(DAYS * 6);
    const anonymous = launches.filter((l) => l.handle === null).length;
    expect(anonymous / launches.length).toBeGreaterThan(0.6);
    const handles = new Set(launches.flatMap((l) => (l.handle ? [l.handle] : [])));
    expect(handles.size).toBeGreaterThanOrEqual(10);
    // regulars come back on many days
    const daysSeen = (owner: string) => new Set(launches.filter((l) => l.owner === owner).map((l) => dayOf(l.at))).size;
    const regulars = REGULARS.map((r) => daysSeen(`${EXTRA}${r.key}`));
    expect(regulars.filter((days) => days >= 6).length).toBeGreaterThanOrEqual(8);
    for (const l of launches) expect(isExtra(l.owner)).toBe(true);
  });

  it("launches each person's satellites a minute or more apart, sometimes two or three a visit", () => {
    const byOwner = new Map<string, number[]>();
    for (const l of launches) byOwner.set(l.owner, [...(byOwner.get(l.owner) ?? []), l.at]);
    for (const times of byOwner.values()) {
      for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThan(MINUTE);
    }
    const several = [...byOwner.entries()].filter(([owner, times]) => !REGULARS.some((r) => owner === `${EXTRA}${r.key}`) && times.length > 1);
    expect(several.length).toBeGreaterThan(DAYS);
  });

  it("flies all three bands, the low band most", () => {
    const count = (band: string) => launches.filter((l) => l.band === band).length;
    expect(count("high")).toBeGreaterThan(0.08 * launches.length);
    expect(count("low")).toBeGreaterThan(count("mid"));
    expect(count("mid")).toBeGreaterThan(count("high"));
  });

  it("answers the day's question sometimes, and only that day's", () => {
    const answering = launches.filter((l) => l.question !== null);
    expect(answering.length / launches.length).toBeGreaterThan(0.2);
    expect(answering.length / launches.length).toBeLessThan(0.5);
    for (const l of answering) {
      expect(l.question).toBe(questionOn(dayOf(l.at)));
      expect(ANSWERS[l.question!].map(textOf)).toContain(l.beacon);
    }
  });

  // a line that can be checked against the satellite's card is true of it
  it("says what fits: no '9pm' at lunchtime, no 'going high' from the low band, no promise it won't keep", () => {
    const fitted = [...LINE.values()].filter((line) => typeof line !== "string");
    expect(fitted.length).toBeGreaterThan(40);
    const said = { hours: 0, months: 0, bands: 0, does: 0 };
    for (const l of launches) {
      const line = LINE.get(l.beacon)!;
      expect(line, l.beacon).toBeDefined();
      if (typeof line === "string") continue;
      const why = `"${l.beacon}" at ${hourIn(l.at)}:00 in month ${monthIn(l.at)}, ${l.band}`;
      if (line.hours) expect(within(hourIn(l.at), line.hours), why).toBe(true), said.hours++;
      if (line.months) expect(line.months, why).toContain(monthIn(l.at)), said.months++;
      if (line.bands) expect(line.bands, why).toContain(l.band), said.bands++;
      if (line.does) {
        expect(manoeuvres.some((m) => m.type === line.does && m.owner === l.owner && m.launchedAt === l.at), why).toBe(true);
        said.does++;
      }
    }
    // and they do get said, where they fit
    for (const [what, n] of Object.entries(said)) expect(n, what).toBeGreaterThan(2);
    // answers about today wait until there's been some of it
    for (const l of launches) {
      const hours = l.question && ANSWER_HOURS[l.question];
      if (hours) expect(within(hourIn(l.at), hours), `"${l.question}" answered at ${hourIn(l.at)}:00`).toBe(true);
    }
  });

  it("brings each regular at most once a day, at any hour of theirs, not by a pattern", () => {
    for (const regular of REGULARS) {
      const times = launches.filter((l) => l.owner === `${EXTRA}${regular.key}`).map((l) => l.at);
      // a visit's launches are minutes apart; visits are hours apart
      const starts = times.filter((t, i) => i === 0 || t - times[i - 1] > 40 * MINUTE);
      for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1], regular.key).toBeGreaterThan(2 * HOUR);
      const hours = new Set(starts.map(hourIn));
      const [from, to] = regular.hours;
      const length = (to - from + 24) % 24 || 24;
      expect(hours.size, `${regular.key} came at ${[...hours]}`).toBeGreaterThanOrEqual(Math.min(length, 3));
      expect([...hours].some((h) => h % 2 === 0) && [...hours].some((h) => h % 2 === 1), `${regular.key} came at ${[...hours]}`).toBe(true);
      for (const h of hours) expect(within(h, regular.hours), `${regular.key} at ${h}:00`).toBe(true);
    }
  });

  it("numbers a visitor's second satellite after their first: Pebble, Pebble 2", () => {
    const byOwner = new Map<string, ExtraLaunch[]>();
    for (const l of launches) if (!isRegular(l.owner)) byOwner.set(l.owner, [...(byOwner.get(l.owner) ?? []), l]);
    // "Pebble 2" is Pebble's 2; "Apollo 99" is nobody's
    const numberOf = (callsign: string, first: string) => {
      const rest = callsign.slice(first.length + 1);
      return callsign.startsWith(first) && /^[ -]$/.test(callsign[first.length] ?? "") && /^\d+$/.test(rest) ? Number(rest) : null;
    };
    let numbered = 0;
    for (const visit of byOwner.values()) {
      const first = visit[0].callsign;
      visit.forEach((l, j) => {
        const n = numberOf(l.callsign, first);
        if (n === null) return;
        numbered++;
        const before = visit.slice(0, j).filter((p) => p.callsign === first || numberOf(p.callsign, first) !== null);
        expect(n, visit.map((v) => v.callsign).join(", ")).toBe(before.length + 1);
      });
    }
    expect(numbered).toBeGreaterThan(5);
    for (const l of launches) expect(l.regular).toBe(isRegular(l.owner) ? l.owner.slice(EXTRA.length) : null);
  });

  it("never says the same thing twice in three days", () => {
    for (const l of launches) {
      const again = launches.find((other) => other !== l && other.beacon === l.beacon && Math.abs(other.at - l.at) < 3 * DAY);
      expect(again, `"${l.beacon}" at ${new Date(l.at).toISOString()}`).toBeUndefined();
    }
    // nor gives a new visitor's satellite a name someone used that day
    const named = launches.filter((l) => !REGULARS.some((r) => l.owner === `${EXTRA}${r.key}`));
    for (const l of named) {
      const again = named.find((other) => other.owner !== l.owner && other.callsign === l.callsign && Math.abs(other.at - l.at) < DAY);
      expect(again, l.callsign).toBeUndefined();
    }
  });

  it("brings some down and boosts some, later, and never boosts one from the high band", () => {
    expect(manoeuvres.some((m) => m.type === "deorbit")).toBe(true);
    expect(manoeuvres.some((m) => m.type === "boost")).toBe(true);
    for (const m of manoeuvres) {
      const launch = extrasBetween(m.launchedAt - 1, m.launchedAt, PER_HOUR).find((l) => l.type === "launch" && l.owner === m.owner) as ExtraLaunch | undefined;
      expect(launch, `${m.type} of ${m.owner}'s launch at ${m.launchedAt}`).toBeDefined();
      expect(m.at).toBeGreaterThan(m.launchedAt);
      if (m.type === "boost") expect(launch!.band).not.toBe("high");
    }
  });

  it("is the same however it's asked, so every server agrees", async () => {
    const whole = extrasBetween(FROM, FROM + 3 * DAY, PER_HOUR);
    const cut = FROM + 37 * HOUR + 1234;
    const parts = [...extrasBetween(FROM, cut, PER_HOUR), ...extrasBetween(cut, FROM + 3 * DAY, PER_HOUR)];
    expect(parts).toEqual(whole);
    expect(extrasBetween(FROM, FROM + 3 * DAY, PER_HOUR)).toEqual(whole);
    // a fresh server (nothing worked out yet) asked about a later week
    // first, then the start: no difference
    vi.resetModules();
    const cold = await import("../src/lib/extras.ts");
    expect(cold.extrasBetween(FROM + 20 * DAY, FROM + 21 * DAY, PER_HOUR)).toEqual(events.filter((e) => e.at > FROM + 20 * DAY && e.at <= FROM + 21 * DAY));
    expect(cold.extrasBetween(FROM, FROM + 3 * DAY, PER_HOUR)).toEqual(whole);
  });

  it("knows when the next thing is due", () => {
    for (const t of [FROM, FROM + 5 * HOUR + 17, FROM + 9 * DAY + 3 * HOUR]) {
      const [next] = extrasBetween(t, t + 2 * DAY, PER_HOUR) as ExtraEvent[];
      expect(nextExtraAfter(t, PER_HOUR)).toBe(next.at);
    }
  });

  it("does nothing when turned off", () => {
    expect(extrasBetween(FROM, FROM + DAY, 0)).toEqual([]);
    expect(nextExtraAfter(FROM, 0)).toBe(Infinity);
  });
});
