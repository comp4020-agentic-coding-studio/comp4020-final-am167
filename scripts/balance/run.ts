// One run of the sky for measuring the balance (ADR 0020, 0021): the real
// server code against the scratch database DATABASE_PATH, the clock passed
// in. scripts/balance/index.ts starts many and sums them up.
//
//   node scripts/balance/run.ts <launches an hour> <hours> [burst] [watched]
//
// People launch into random bands for `hours` (at random times, or evenly,
// one after another, for a `burst` such as a crit). Unwatched, it then plays
// out until every person's satellite has come down, and reports how many
// burned up, collisions an hour, how much of their time over a station
// people's beacons were on air, and how many of their passes over a station
// got a turn on air at all (which is what being heard needs, heard.ts). `watched`: someone has the sky open for six
// hours after two of warming up, a newcomer arriving every half hour, and it
// reports the collisions they saw. EXTRAS_PER_HOUR (0 for none) sets the
// extras. Prints one line of JSON.
import { db, schema } from "../../src/db/index.ts";
import { onAir } from "../../src/lib/airtime.ts";
import { subscribe } from "../../src/lib/events.ts";
import { isExtra } from "../../src/lib/extras.ts";
import { reentryAt, type Band, type Orbit } from "../../src/lib/orbit.ts";
import { launch, settle, watcherArrived } from "../../src/lib/sky.ts";
import { stationOver } from "../../src/lib/stations.ts";
import { lineOf } from "../../src/lib/wreck.ts";

const HOUR = 3_600_000;
const MINUTE = 60_000;
const [perHour, hours] = [Number(process.argv[2] ?? 2), Number(process.argv[3] ?? 12)];
const burst = process.argv.includes("burst");
const watched = process.argv.includes("watched");
const BANDS: Band[] = ["low", "mid", "high"];
// six on a Monday evening in Canberra
const T0 = Date.UTC(2026, 10, 2, 7);

const objects = () => db.select().from(schema.objects).all();
const people = () => objects().filter((o) => o.kind === "satellite" && !isExtra(o.owner));
const asOrbit = (o: ReturnType<typeof objects>[number]): Orbit => ({ ...o, direction: o.direction === -1 ? -1 : 1 });

const start = watched ? T0 - 2 * HOUR : T0;
const length = watched ? 8 * HOUR : hours * HOUR;
const n = Math.round(perHour * (length / HOUR));
const launches = Array.from({ length: n }, (_, i) => start + (burst ? (i / n) * length : Math.random() * length)).sort((a, b) => a - b);

let t = start;
let next = 0;
settle(t);
const step = watched ? 15_000 : 5 * MINUTE;
const arrivals = watched ? Array.from({ length: 12 }, (_, i) => T0 + i * 30 * MINUTE + Math.random() * 10 * MINUTE) : [];
let arrived = 0;
let listening = false;
const end = watched ? T0 + 6 * HOUR + 10 * MINUTE : start + length + 4 * 24 * HOUR;
while (t < end) {
  t += step;
  if (watched && !listening && t >= T0) {
    subscribe(() => {}, null);
    listening = true;
  }
  for (; next < launches.length && launches[next] <= t; next++) {
    const band = BANDS[Math.floor(Math.random() * BANDS.length)];
    launch(crypto.randomUUID(), { band, callsign: `P${next}`, beacon: "a person's line", question: null }, launches[next]);
  }
  if (arrived < arrivals.length && arrivals[arrived] <= t) {
    watcherArrived();
    arrived++;
  }
  settle(t);
  if (!watched && next >= launches.length && people().every((o) => o.fate !== "live")) break;
}

const collisions = db.select().from(schema.collisions).all();
if (watched) {
  const seen = collisions.filter((c) => c.at >= T0 && c.at < T0 + 6 * HOUR);
  // a staged collision meets just over the atmosphere (ADR 0019)
  const staged = seen.filter((c) => Math.abs(c.radius - 1.08) < 0.005).length;
  const newcomers = arrivals.filter((a) => seen.some((c) => c.at > a && c.at <= a + 10 * MINUTE)).length;
  console.log(JSON.stringify({ collisionsPerHour: seen.length / 6, stagedPerHour: staged / 6, newcomerSaw: newcomers / arrivals.length }));
} else {
  const all = objects();
  const theirs = people();
  const burned = (list: typeof theirs) => list.filter((o) => o.fate === "decayed" || o.fate === "deorbited").length / Math.max(1, list.length);
  const window = { from: start, to: start + length + 12 * HOUR };
  const counted = collisions.filter((c) => c.at > window.from && c.at <= window.to).length;
  // Airtime: every 2 s through the window, who each station broadcasts of
  // those overhead (airtime.ts), as heard.ts works it out; for each person's
  // satellite overhead, whether it's on air, and for each of their passes
  // (overhead at one station, with no gap), whether it got a turn. A turn is
  // at least 4 s, so sampling every 2 s sees every one.
  const speaking = all.filter((o) => (o.kind === "satellite" && o.beacon) || (o.kind === "debris" && o.words));
  let over = 0;
  let onAirToo = 0;
  const passes = new Map<string, { last: number; turn: boolean }>();
  let passCount = 0;
  let passTurns = 0;
  const close = (pass: { turn: boolean }) => {
    passCount++;
    if (pass.turn) passTurns++;
  };
  for (let at = window.from; at < window.to; at += 2000) {
    const overhead = new Map<string, { id: number; text: string; static: boolean; person: boolean }[]>();
    for (const o of speaking) {
      const gone = o.fate === "live" ? reentryAt(asOrbit(o)) : (o.fateAt ?? Infinity);
      if (o.launchedAt > at || o.epoch > at || at >= gone) continue;
      const station = stationOver(asOrbit(o), at);
      if (!station) continue;
      const here = overhead.get(station.id) ?? [];
      here.push({ id: o.id, text: lineOf(o) ?? "", static: o.kind === "debris", person: o.kind === "satellite" && !isExtra(o.owner) });
      overhead.set(station.id, here);
    }
    for (const [station, here] of overhead) {
      const speaker = onAir(here, at)?.speaker;
      for (const one of here) {
        if (!one.person) continue;
        over++;
        if (speaker?.id === one.id) onAirToo++;
        const key = `${one.id}:${station}`;
        let pass = passes.get(key);
        if (!pass || at - pass.last > 4000) {
          if (pass) close(pass);
          pass = { last: at, turn: false };
          passes.set(key, pass);
        }
        pass.last = at;
        if (speaker?.id === one.id) pass.turn = true;
      }
    }
  }
  for (const pass of passes.values()) close(pass);
  const byBand = Object.fromEntries(BANDS.map((band) => [band, burned(theirs.filter((o) => o.band === band))]));
  const extras = all.filter((o) => o.kind === "satellite" && isExtra(o.owner) && o.launchedAt >= start);
  console.log(
    JSON.stringify({
      people: theirs.length,
      burned: burned(theirs),
      byBand,
      extras: extras.length,
      collisionsPerHour: counted / ((window.to - window.from) / HOUR),
      onAir: onAirToo / Math.max(1, over),
      passesWithATurn: passTurns / Math.max(1, passCount),
    }),
  );
}
process.exit(0);
