import { seeded } from "./collide.ts";
import type { Band } from "./orbit.ts";

// Resident operators (ADR 0015). A sky only people launch into is empty most
// of the hours nobody's on, so the station launches for a cast of resident
// operators too: an imaging company, a comms constellation, a weather
// service, a student CubeSat lab, a radio club, a school, an advertiser, a
// memorial, a few hobbyists. Each has its own bands, callsigns and lines,
// and their satellites fly, collide and take the blame like anyone's.
//
// Real orbit is mostly launched by operators like these, so it fits the
// argument. They aren't people, but nothing on the page says so (yet): the
// record knows (History.resident), for when it should.
//
// The schedule is a pure function of the clock: each hour, a few launches at
// times, by residents, into bands, with callsigns and lines all drawn from a
// generator seeded by the hour. So every server agrees on it, and one that was
// stopped launches what it missed, at the times it was due (src/lib/sky.ts).

export const HOUR = 3_600_000;

type Random = () => number;
// a line or a callsign: fixed, or made fresh from the hour's generator and
// the launch's number (below)
type Text = string | ((random: Random, n: number) => string);

export interface Resident {
  handle: string;
  // how often it launches, against the others: a company more than a
  // hobbyist
  weight: number;
  // how likely each band is: residents that want to be heard fly low, ones
  // that want to last fly high
  bands: Partial<Record<Band, number>>;
  // the first number its callsigns count up from
  first: number;
  callsigns: Text[];
  beacons: Text[];
}

const int = (random: Random, min: number, max: number) => min + Math.floor(random() * (max - min + 1));
const pick = <T>(random: Random, list: readonly T[]): T => list[Math.floor(random() * list.length)];

// Invented names, none of a real organisation or a real person's handle.
export const RESIDENTS: readonly Resident[] = [
  {
    handle: "Larkspur_Imaging",
    weight: 1.6,
    bands: { low: 0.8, mid: 0.2 },
    first: 410,
    callsigns: [(_, n) => `LARKSPUR-${n}`],
    beacons: [
      (r) => `Frame ${int(r, 1200, 9800)} of the south coast, ${int(r, 0, 60)}% cloud`,
      "Imaging the reef at dawn. Clear water today.",
      "Shutter open. Smile, Tasmania.",
      (r) => `Downlinking ${int(r, 12, 90)} gigabytes of coastline`,
      (r) => `Burn scar mapped: ${int(r, 2, 40) * 100} hectares`,
      "Wheat belt greening up early this year",
      (r) => `Lake levels down ${int(r, 2, 19)}% on last spring`,
      "New roads every pass. The cities keep growing.",
    ],
  },
  {
    handle: "Wattlebird-Comms",
    weight: 1.8,
    bands: { low: 0.4, mid: 0.6 },
    first: 120,
    callsigns: [(r, n) => `WATTLE ${int(r, 1, 9)}-${n}`],
    beacons: [
      "Relay check: all channels nominal",
      "Broadband for the outback, one pass at a time",
      (r) => `Handover to the next bird in ${int(r, 10, 59)} seconds`,
      (r) => `Ping. Pong. Latency ${int(r, 18, 60)} ms.`,
      "Can you hear me now? Good.",
      (r) => `Carrying ${int(r, 2, 40)},000 calls this pass`,
      "Shell complete. Coverage at 99.2%.",
      "Station ahead. Hold the line.",
    ],
  },
  {
    handle: "Bluegum_CubeSat_Lab",
    weight: 0.6,
    bands: { low: 0.9, mid: 0.1 },
    first: 3,
    callsigns: [(_, n) => `BLUEGUM-${n}`],
    beacons: [
      "Hello from the third-year avionics class!",
      "We built this in a shed. It works!",
      "Solar panels deployed. The lab is cheering.",
      (r) => `Battery ${int(r, 60, 99)}%. Thesis due Friday.`,
      "If you can read this, we passed.",
      "Antenna out first try. Pizza is on the lab.",
      "Tumbling slightly. Please hold.",
    ],
  },
  {
    handle: "SouthernCross_ARC",
    weight: 0.7,
    bands: { low: 0.7, mid: 0.3 },
    first: 6,
    callsigns: [(_, n) => `SCARSAT ${n}`],
    beacons: [
      "CQ CQ from orbit, 73 to all who hear this",
      "Listening on 145.8. Say hello.",
      "Thanks to every ham who logged our last pass",
      (r) => `Pass ${int(r, 100, 900)}. Signal report 5 by 9.`,
      "Repeater open. Keep it short, it's a busy sky.",
      "Built by club members, flown for everyone",
    ],
  },
  {
    handle: "Isobar_Weather",
    weight: 1.2,
    bands: { mid: 0.7, high: 0.3 },
    first: 14,
    callsigns: [(_, n) => `ISOBAR W${n}`],
    beacons: [
      "Pressure falling over the Tasman. Pack a coat.",
      "Storm cell building off the coast. Stay dry.",
      "Sea fog by morning in the east",
      "Clear skies tonight. Look up.",
      (r) => `Cloud tops at ${int(r, 6, 14)} km over the ranges`,
      (r) => `Cyclone watch: winds ${int(r, 90, 180)} km/h and rising`,
      "Dry change through by afternoon. Fire danger high.",
    ],
  },
  {
    handle: "Lantern_Collective",
    weight: 0.6,
    bands: { low: 0.6, mid: 0.4 },
    first: 1,
    callsigns: [(_, n) => `LANTERN ${n}`, (_, n) => `MOTH ${n}`, (_, n) => `FIREFLY ${n}`],
    beacons: [
      "This light is for everyone who looked up tonight",
      "A small star you can name",
      "We are all made of slow-falling light",
      "Nothing to sell. Just here.",
      "A moving star, on purpose",
      "Look up. Wave. We'll wave back.",
    ],
  },
  {
    handle: "Tideline_Ocean",
    weight: 1,
    bands: { low: 0.5, mid: 0.5 },
    first: 4,
    callsigns: [(_, n) => `TIDELINE-${n}`],
    beacons: [
      (r) => `Sea surface ${int(r, 14, 26)}.${int(r, 0, 9)} C off Byron. Warm year.`,
      "Whale pod heading north past Eden",
      "Kelp forest shrinking. We are watching.",
      (r) => `Swell ${int(r, 1, 4)} m from the south. Good surf.`,
      "Plankton bloom off the shelf, bright green",
      (r) => `Sea level up ${int(r, 2, 9)} mm on the year`,
    ],
  },
  {
    handle: "Wombat_Gully_Primary",
    weight: 0.4,
    bands: { low: 1 },
    first: 1,
    callsigns: [(_, n) => `WOMBAT GULLY ${n}`],
    beacons: [
      "Year 4 says hi! Our class pet is called Biscuit.",
      "Room 12 drew the mission patch",
      "Can you see our school from up there?",
      "Our science fair project, now in orbit",
      "Wombat Gully Primary, reaching for the stars",
    ],
  },
  {
    handle: "Glintcast_Ads",
    weight: 1.3,
    bands: { low: 1 },
    first: 30,
    callsigns: [(_, n) => `GLINTCAST ${n}`],
    beacons: [
      (r) => `Your logo here. Seen ${int(r, 20, 60)} times a day.`,
      "Ad space in orbit: book your pass now",
      "The sky is the last billboard",
      "Brighter than the stars you used to see",
      "This pass brought to you by Glintcast",
      "Look up. Then buy something.",
    ],
  },
  {
    handle: "Southlight_Lab",
    weight: 0.9,
    bands: { mid: 0.6, high: 0.4 },
    first: 2,
    callsigns: [(_, n) => `SOUTHLIGHT-${n}`],
    beacons: [
      (r) => `Counting particles at ${int(r, 38, 52) * 10} km. Busy night.`,
      "Solar wind up. Aurora likely down south.",
      "Magnetometer calibrated. Data flowing.",
      (r) => `Solar flare, class M${int(r, 1, 9)}. Radio may crackle.`,
      "Quiet sun today. Good for the instruments.",
    ],
  },
  {
    handle: "Ashline_Memorial",
    weight: 0.5,
    bands: { high: 1 },
    first: 1,
    callsigns: [(_, n) => `ASHLINE ${n}`],
    beacons: [
      "In memory of everyone who looked up",
      "Forever in orbit, at least for a while",
      (r) => `Carrying the names of ${int(r, 40, 400)} people, remembered`,
      "Missed, and still going round",
    ],
  },
  {
    handle: "Driftmark_Nav",
    weight: 1.2,
    bands: { mid: 0.6, high: 0.4 },
    first: 21,
    callsigns: [(_, n) => `DRIFTMARK-${n}`],
    beacons: [
      "Timing signal locked. You are here.",
      (r) => `Clock drift ${int(r, 1, 9)} ns. Correcting.`,
      "Recalculating route. Turn left at the Moon.",
      "Position fix to within a metre. Mostly.",
      "Every ship at sea thanks you for not crashing into us",
    ],
  },
  {
    handle: "kitchen_table_sat",
    weight: 0.3,
    bands: { low: 0.8, mid: 0.2 },
    first: 1,
    callsigns: [(_, n) => `KITCHEN-${n}`, (_, n) => `LITTLE-LIGHT ${n}`],
    beacons: [
      "Hello from a kitchen table in Perth",
      "For my dad, who taught me the planets",
      "Launched on a dare. No regrets.",
      "Soldered at midnight. Still works.",
      "The cat sat on the circuit board. Twice.",
    ],
  },
  {
    handle: "garage_orbital",
    weight: 0.3,
    bands: { low: 0.7, mid: 0.3 },
    first: 1,
    callsigns: [(_, n) => `GARAGE-${n}`],
    beacons: [
      "Testing, testing. Is this thing on?",
      "Another try. The last one hit something.",
      "Up the Raiders",
      "Built from spare parts and stubbornness",
      "Neighbours still think it's a barbecue",
    ],
  },
  {
    handle: "nightowl_launches",
    weight: 0.3,
    bands: { low: 0.6, mid: 0.4 },
    first: 1,
    callsigns: [(_, n) => `NIGHTOWL ${n}`, (_, n) => `KOMETA ${n}`],
    beacons: [
      "Pozdrowienia z orbity! Greetings from orbit",
      "Wrote this on the train home",
      "Somewhere below, my kettle is boiling",
      "Couldn't sleep. Launched a satellite.",
      "3 am and the sky is busy",
    ],
  },
  {
    handle: "Saltbush_Seedbank",
    weight: 0.6,
    bands: { mid: 0.5, high: 0.5 },
    first: 1,
    callsigns: [(_, n) => `GERMINA ${n}`],
    beacons: [
      (r) => `Carrying ${int(r, 2, 9)}00 seeds from ${int(r, 10, 60)} community gardens`,
      "Zero gravity, zero weeds",
      "Seeds return in spring, if we're lucky",
      "Wattle, saltbush and a single tomato",
    ],
  },
];

const text = (random: Random, n: number, choice: Text) => (typeof choice === "string" ? choice : choice(random, n));

function bandOf(random: Random, bands: Resident["bands"]): Band {
  const entries = Object.entries(bands) as [Band, number][];
  let left = random() * entries.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [band, weight] of entries) {
    left -= weight;
    if (left < 0) return band;
  }
  return entries[entries.length - 1][0];
}

// How many launches an hour brings: Poisson around `rate`, so some hours are
// quiet and some busy, never more than there are residents.
function howMany(random: Random, rate: number): number {
  if (!(rate > 0)) return 0;
  const u = random();
  let k = 0;
  let p = Math.exp(-rate);
  let sum = p;
  while (u > sum && k < RESIDENTS.length) {
    k++;
    p *= rate / k;
    sum += p;
  }
  return k;
}

// An hour's plan: who launches (each at most once, the heavier more often)
// and when, in time order, and the generator, ready to draw the rest.
interface Plan {
  launches: { resident: number; at: number }[];
  random: Random;
}
function plan(hour: number, rate: number): Plan {
  const random = seeded(Math.imul(hour, 0x9e3779b1) ^ 0x5eed);
  const k = howMany(random, rate);
  // weighted order without replacement: each draws an exponential key
  // scaled down by its weight, the smallest first
  const order = RESIDENTS.map((resident, i) => ({ i, key: -Math.log(1 - random()) / resident.weight })).sort(
    (a, b) => a.key - b.key,
  );
  const launches = order.slice(0, k).map(({ i }) => ({ resident: i, at: hour * HOUR + Math.floor(random() * HOUR) }));
  return { launches, random };
}

// Callsigns count up launch by launch, per resident, from the hour the
// schedule starts: a resident's nth launch is numbered first + n. Counted
// from the plans (cheap), with the running count kept every day.
const START = Math.floor(Date.UTC(2026, 9, 1) / HOUR);
const daily = new Map<string, Int32Array>();
function launchesBefore(hour: number, rate: number): Int32Array {
  const from = Math.max(hour, START);
  const day = Math.floor((from - START) / 24);
  let counts = new Int32Array(RESIDENTS.length);
  let at = START;
  // the latest day already counted, at or before this one
  for (let d = day; d > 0; d--) {
    const known = daily.get(`${rate}:${d}`);
    if (known) {
      counts = known.slice();
      at = START + d * 24;
      break;
    }
  }
  for (; at < from; at++) {
    if ((at - START) % 24 === 0 && at > START) daily.set(`${rate}:${(at - START) / 24}`, counts.slice());
    for (const { resident } of plan(at, rate).launches) counts[resident]++;
  }
  return counts;
}

// One launch the station makes for a resident.
export interface Slot {
  at: number;
  handle: string;
  band: Band;
  callsign: string;
  beacon: string;
  // seeds the orbit (placeInBand), so it's the same on every server
  seed: number;
}

// The launches due in one hour (counted from the epoch), in time order.
export function slotsInHour(hour: number, rate: number): Slot[] {
  const { launches, random } = plan(hour, rate);
  if (launches.length === 0) return [];
  const before = launchesBefore(hour, rate);
  return launches
    .map(({ resident: i, at }) => {
      const resident = RESIDENTS[i];
      const n = resident.first + before[i];
      return {
        at,
        handle: resident.handle,
        band: bandOf(random, resident.bands),
        callsign: text(random, n, pick(random, resident.callsigns)),
        beacon: text(random, n, pick(random, resident.beacons)),
        seed: Math.floor(random() * 2 ** 32),
      };
    })
    .sort((a, b) => a.at - b.at);
}

// The launches due after `from`, up to and including `to`, in time order.
export function slotsBetween(from: number, to: number, rate: number): Slot[] {
  const slots: Slot[] = [];
  for (let hour = Math.floor(from / HOUR); hour <= Math.floor(to / HOUR); hour++) {
    for (const slot of slotsInHour(hour, rate)) if (slot.at > from && slot.at <= to) slots.push(slot);
  }
  return slots;
}

// When the next launch is due after `from` (looking a day ahead at most).
export function nextSlotAfter(from: number, rate: number): number {
  for (let hour = Math.floor(from / HOUR); hour <= Math.floor(from / HOUR) + 24; hour++) {
    const next = plan(hour, rate)
      .launches.map((launch) => launch.at)
      .filter((at) => at > from)
      .sort((a, b) => a - b)[0];
    if (next !== undefined) return next;
  }
  return Infinity;
}
