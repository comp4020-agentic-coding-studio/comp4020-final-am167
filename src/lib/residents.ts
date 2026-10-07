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
// the resident's serial, a number that goes up by one each hour (so a
// callsign numbered from it isn't used twice within its range)
type Text = string | ((random: Random, serial: number) => string);

export interface Resident {
  handle: string;
  // how likely each band is: residents that want to be heard fly low, ones
  // that want to last fly high
  bands: Partial<Record<Band, number>>;
  callsigns: Text[];
  beacons: Text[];
}

const int = (random: Random, min: number, max: number) => min + Math.floor(random() * (max - min + 1));
const pick = <T>(random: Random, list: readonly T[]): T => list[Math.floor(random() * list.length)];

export const RESIDENTS: readonly Resident[] = [
  {
    handle: "Larkspur_Imaging",
    bands: { low: 0.8, mid: 0.2 },
    callsigns: [(_, n) => `LARKSPUR-${(n % 900) + 100}`],
    beacons: [
      (r) => `Frame ${int(r, 1200, 9800)} of the south coast, ${int(r, 0, 60)}% cloud`,
      "Imaging the reef at dawn. Clear water today.",
      "Shutter open. Smile, Tasmania.",
      (r) => `Downlinking ${int(r, 12, 90)} gigabytes of coastline`,
      (r) => `Burn scar mapped: ${int(r, 2, 40) * 100} hectares`,
    ],
  },
  {
    handle: "Wattlebird-Comms",
    bands: { low: 0.4, mid: 0.6 },
    callsigns: [(r, n) => `WATTLE ${int(r, 1, 9)}-${(n % 900) + 100}`],
    beacons: [
      "Relay check: all channels nominal",
      "Broadband for the outback, one pass at a time",
      (r) => `Handover to the next bird in ${int(r, 10, 59)} seconds`,
      (r) => `Ping. Pong. Latency ${int(r, 18, 60)} ms.`,
      "Can you hear me now? Good.",
    ],
  },
  {
    handle: "Bluegum_CubeSat_Lab",
    bands: { low: 0.9, mid: 0.1 },
    callsigns: [(_, n) => `BLUEGUM-${(n % 14) + 1}`],
    beacons: [
      "Hello from the third-year avionics class!",
      "We built this in a shed. It works!",
      "Solar panels deployed. The lab is cheering.",
      (r) => `Battery ${int(r, 60, 99)}%. Thesis due Friday.`,
      "If you can read this, we passed.",
    ],
  },
  {
    handle: "SouthernCross_ARC",
    bands: { low: 0.7, mid: 0.3 },
    callsigns: [(_, n) => `SCARSAT ${(n % 14) + 2}`, (_, n) => `VK-OSCAR ${(n % 80) + 10}`],
    beacons: [
      "CQ CQ from orbit, 73 to all who hear this",
      "Listening on 145.8. Say hello.",
      "Thanks to every ham who logged our last pass",
      (r) => `Pass ${int(r, 100, 900)}. Signal report 5 by 9.`,
    ],
  },
  {
    handle: "Meridian_Weather",
    bands: { mid: 0.7, high: 0.3 },
    callsigns: [(_, n) => `MERIDIAN W${(n % 40) + 2}`],
    beacons: [
      "Pressure falling over the Tasman. Pack a coat.",
      "Storm cell building off the coast. Stay dry.",
      "Sea fog by morning in the east",
      "Clear skies tonight. Look up.",
      (r) => `Cloud tops at ${int(r, 6, 14)} km over the ranges`,
    ],
  },
  {
    handle: "Lantern_Collective",
    bands: { low: 0.6, mid: 0.4 },
    callsigns: ["LANTERN", "MOTH", (_, n) => `FIREFLY ${(n % 60) + 1}`],
    beacons: [
      "This light is for everyone who looked up tonight",
      "A small star you can name",
      "We are all made of slow-falling light",
      "Nothing to sell. Just here.",
    ],
  },
  {
    handle: "Tideline_Ocean",
    bands: { low: 0.5, mid: 0.5 },
    callsigns: [(_, n) => `TIDELINE-${(n % 30) + 1}`],
    beacons: [
      (r) => `Sea surface ${int(r, 14, 26)}.${int(r, 0, 9)} C off Byron. Warm year.`,
      "Whale pod heading north past Eden",
      "Kelp forest shrinking. We are watching.",
      (r) => `Swell ${int(r, 1, 4)} m from the south. Good surf.`,
    ],
  },
  {
    handle: "Echo_Primary",
    bands: { low: 1 },
    callsigns: [(_, n) => `ECHO-KIDS ${(n % 20) + 1}`],
    beacons: [
      "Year 4 says hi! Our class pet is called Biscuit.",
      "Room 12 drew the mission patch",
      "Can you see our school from up there?",
      "Hi Mum, I helped build this",
    ],
  },
  {
    handle: "BrightMark",
    bands: { low: 1 },
    callsigns: [(_, n) => `BRIGHTMARK ${(n % 400) + 1}`],
    beacons: [
      (r) => `Your logo here. Seen ${int(r, 20, 60)} times a day.`,
      "Ad space in orbit: book your pass now",
      "The sky is the last billboard",
      "Brighter than the stars you used to see",
    ],
  },
  {
    handle: "Aurora_Lab",
    bands: { mid: 0.6, high: 0.4 },
    callsigns: [(_, n) => `AURORA-${(n % 60) + 2}`],
    beacons: [
      (r) => `Counting particles at ${int(r, 38, 52) * 10} km. Busy night.`,
      "Solar wind up. Aurora likely down south.",
      "Magnetometer calibrated. Data flowing.",
    ],
  },
  {
    handle: "Ashline_Memorial",
    bands: { high: 1 },
    callsigns: [(_, n) => `ASHLINE ${(n % 90) + 1}`],
    beacons: [
      "For Margaret, who always wanted to see this view",
      "In memory of everyone who looked up",
      "Forever in orbit, at least for a while",
    ],
  },
  {
    handle: "Waypoint_Nav",
    bands: { mid: 0.6, high: 0.4 },
    callsigns: [(_, n) => `WAYPOINT-${(n % 90) + 10}`],
    beacons: [
      "Timing signal locked. You are here.",
      (r) => `Clock drift ${int(r, 1, 9)} ns. Correcting.`,
      "Recalculating route. Turn left at the Moon.",
    ],
  },
  {
    handle: "mira_k",
    bands: { low: 0.8, mid: 0.2 },
    callsigns: ["MIRAS-WISH", "LITTLE-LIGHT"],
    beacons: [
      "Hello from a kitchen table in Perth",
      "For my dad, who taught me the planets",
      "Launched on a dare. No regrets.",
    ],
  },
  {
    handle: "dbrennan",
    bands: { low: 0.7, mid: 0.3 },
    callsigns: [(_, n) => `BRENNAN-${(n % 14) + 1}`],
    beacons: [
      "Testing, testing. Is this thing on?",
      "Second try. The first one hit something.",
      "Up the Raiders",
    ],
  },
  {
    handle: "tomasz_v",
    bands: { low: 0.6, mid: 0.4 },
    callsigns: ["TOMASZ-SAT", "KOMETA"],
    beacons: [
      "Pozdrowienia z orbity! Greetings from orbit",
      "Wrote this on the train home",
      "Somewhere below, my kettle is boiling",
    ],
  },
  {
    handle: "Saltbush_Seedbank",
    bands: { mid: 0.5, high: 0.5 },
    callsigns: [(_, n) => `GERMINA ${(n % 30) + 1}`],
    beacons: [
      (r) => `Carrying ${int(r, 2, 9)}00 seeds from ${int(r, 10, 60)} community gardens`,
      "Zero gravity, zero weeds",
    ],
  },
];

const text = (random: Random, serial: number, choice: Text) =>
  typeof choice === "string" ? choice : choice(random, serial);

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
  if (rate <= 0) return 0;
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

// The launches due in one hour (counted from the epoch), in time order: a
// few residents, each at most once.
export function slotsInHour(hour: number, rate: number): Slot[] {
  const random = seeded(Math.imul(hour, 0x9e3779b1) ^ 0x5eed);
  const k = howMany(random, rate);
  const order = RESIDENTS.map((resident) => ({ resident, key: random() })).sort((a, b) => a.key - b.key);
  return order
    .slice(0, k)
    .map(({ resident }) => {
      // each resident's serials start somewhere different
      const serial = hour + RESIDENTS.indexOf(resident) * 137;
      return {
        at: hour * HOUR + Math.floor(random() * HOUR),
        handle: resident.handle,
        band: bandOf(random, resident.bands),
        callsign: text(random, serial, pick(random, resident.callsigns)),
        beacon: text(random, serial, pick(random, resident.beacons)),
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
    const next = slotsInHour(hour, rate).find((slot) => slot.at > from);
    if (next) return next.at;
  }
  return Infinity;
}
