import { describe, expect, it } from "vitest";
import { AGAIN, ANSWERS, CALLSIGNS, LINES, REGULARS, textOf } from "../src/lib/extras-cast.ts";
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

// the hour of the day in Canberra
const hourIn = (time: number) =>
  Number(new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", hourCycle: "h23" }).format(time)) % 24;

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
    expect(owners.size).toBeGreaterThan(DAYS * 8);
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

  it("says what fits the hour: no '9pm' at lunchtime", () => {
    const timed = new Map(
      [...LINES, ...AGAIN, ...Object.values(ANSWERS).flat(), ...REGULARS.flatMap((r) => r.lines)].flatMap((line) =>
        typeof line === "string" ? [] : [[line.text, line.hours] as const],
      ),
    );
    expect(timed.size).toBeGreaterThan(20);
    const within = (hour: number, [from, to]: readonly [number, number]) => (from <= to ? hour >= from && hour < to : hour >= from || hour < to);
    let said = 0;
    for (const l of launches) {
      const hours = timed.get(l.beacon);
      if (!hours) continue;
      said++;
      expect(within(hourIn(l.at), hours), `"${l.beacon}" at ${hourIn(l.at)}:00`).toBe(true);
    }
    // and they do get said, at their hours
    expect(said).toBeGreaterThan(DAYS / 2);
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

  it("is the same however it's asked, so every server agrees", () => {
    const whole = extrasBetween(FROM, FROM + 3 * DAY, PER_HOUR);
    const cut = FROM + 37 * HOUR + 1234;
    const parts = [...extrasBetween(FROM, cut, PER_HOUR), ...extrasBetween(cut, FROM + 3 * DAY, PER_HOUR)];
    expect(parts).toEqual(whole);
    expect(extrasBetween(FROM, FROM + 3 * DAY, PER_HOUR)).toEqual(whole);
    // asked about a later week first, then the start: no difference
    const later = extrasBetween(FROM + 20 * DAY, FROM + 21 * DAY, PER_HOUR);
    expect(later).toEqual(events.filter((e) => e.at > FROM + 20 * DAY && e.at <= FROM + 21 * DAY));
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
