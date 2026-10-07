// Orbits on the 2D chart, shared by the server and the browser. A position is
// a pure function of an object's elements and the time, so every session that
// agrees on the server's clock draws the same sky (ADR 0004). That includes
// decay (ADR 0007): an orbit falls along a curve worked out in closed form,
// so where a falling object is, and when it burns up, needs no messages.
// And manoeuvres (ADR 0011): an owner bringing a satellite down, or boosting
// it up a band, gives it a new epoch that falls (or climbs) at its own rate,
// still in closed form.
//
// Distances are in planet radii. Angles are radians, anticlockwise from the
// right, with y up; the shared ground station is at the top of the planet.

const TAU = 2 * Math.PI;

// One period for each height, whatever band an object was launched into, so
// everything at the same height moves together and a falling orbit speeds up.
// It falls steeply with height (not Kepler's 1.5 power: this sky is tuned to
// be watched, not to be physical): the middle of the low band comes round
// once a minute, the middle of the high band every eight.
const LOW_MIDDLE = 1.3;
const HIGH_MIDDLE = 2.4;
export const PERIOD_POWER = Math.log(8) / Math.log(HIGH_MIDDLE / LOW_MIDDLE);
export const periodAt = (radius: number): number => 60_000 * (radius / LOW_MIDDLE) ** PERIOD_POWER;

// The bands you launch into. They're ranges of one continuous height, not
// shelves: once up, an orbit falls through the bands below it.
const band = (label: string, minRadius: number, maxRadius: number) => ({
  label,
  minRadius,
  maxRadius,
  // milliseconds per orbit at the band's middle
  period: periodAt((minRadius + maxRadius) / 2),
});

export const BANDS = {
  low: band("Low", 1.2, 1.4),
  mid: band("Mid", 1.6, 1.9),
  high: band("High", 2.2, 2.6),
};

export type Band = keyof typeof BANDS;

export const isBand = (value: unknown): value is Band =>
  typeof value === "string" && Object.hasOwn(BANDS, value);

// Which band a height is in now. The bands meet halfway between their edges,
// so every height from the ground up is in exactly one.
export const BAND_EDGES = {
  lowTop: (BANDS.low.maxRadius + BANDS.mid.minRadius) / 2,
  midTop: (BANDS.mid.maxRadius + BANDS.high.minRadius) / 2,
};
export const bandAt = (radius: number): Band =>
  radius < BAND_EDGES.lowTop ? "low" : radius < BAND_EDGES.midTop ? "mid" : "high";

export const STATION_ANGLE = Math.PI / 2;

// How far either side of the station a satellite counts as overhead.
export const OVERHEAD_HALF_WIDTH = (12 * Math.PI) / 180;

export interface Orbit {
  // radius at the epoch
  radius: number;
  // angle at the epoch
  phase: number;
  // milliseconds per orbit at the epoch
  period: number;
  // server time, in ms, that the elements are measured from
  epoch: number;
  // which way round it goes: 1 anticlockwise (prograde), -1 clockwise
  // (retrograde). Orbits going opposite ways meet head-on (ADR 0008).
  // Missing means prograde, as every orbit was before.
  direction?: 1 | -1;
  // how fast radius^STEEPNESS falls, as a multiple of drag alone (ADR
  // 0011): over 1 while it's being brought down, below 0 while it climbs.
  // Missing means 1, as every orbit was before.
  rate?: number;
  // when a climb ends: from then on it falls by drag alone, from the height
  // it reached. Missing or null: the rate holds until it burns up.
  until?: number | null;
}

// An orbit as launched, or as a collision leaves a fragment: every element,
// falling by drag alone.
export type Elements = Required<Omit<Orbit, "rate" | "until">>;

// ── decay ──────────────────────────────────────────────────────────────────

// Drag pulls every orbit down, slowly at first and faster as the air
// thickens: radius^STEEPNESS falls at one steady rate, the same for every
// object. An orbit at the low band's middle lasts LOW_LIFETIME; higher ones
// last longer (about 17 hours from the mid band's middle, 2 days from the
// high's, and no launch more than about 3 days). STEEPNESS mustn't equal
// PERIOD_POWER, or the angle's closed form divides by zero.
//
// At BURN_RADIUS it has sunk through the airglow into the thick of the
// atmosphere, and the rest is a short plunge of PLUNGE_MS: it dives, slows
// hard, and has burned away by END_RADIUS, just above the ground.
export const DECAY = {
  steepness: 3,
  lowLifetime: 4 * 3_600_000,
  burnRadius: 1.06,
  endRadius: 1.005,
  plungeMs: 30_000,
} as const;

const { steepness: M, burnRadius, endRadius, plungeMs } = DECAY;

// Heights in kilometres, for people. The chart isn't to scale (the planet
// would be three times bigger); this puts the top of the atmosphere, where a
// burn-up starts, at 120 km, where real re-entries begin, and the low band at
// 400 to 800 km, where most real satellites fly.
export const KM_PER_RADIUS = 120 / (burnRadius - 1);
export const heightKm = (radius: number): number => (radius - 1) * KM_PER_RADIUS;
// how fast radius^M falls, per ms, by drag alone
const RATE = (LOW_MIDDLE ** M - burnRadius ** M) / (DECAY.lowLifetime - plungeMs);
// and for an orbit, whatever it's doing
const rateOf = (orbit: Orbit) => RATE * (orbit.rate ?? 1);

// After a climb: the orbit it settles into, from the moment the climb ends,
// falling by drag alone. Worked out once for each orbit.
const settledOrbits = new WeakMap<Orbit, Orbit>();
function settled(orbit: Orbit & { until: number }): Orbit {
  const known = settledOrbits.get(orbit);
  if (known) return known;
  // where the climb leaves it (it never burns up on the way up)
  const radius = (orbit.radius ** M - rateOf(orbit) * (orbit.until - orbit.epoch)) ** (1 / M);
  const after: Orbit = {
    radius,
    phase: orbit.phase + (orbit.direction ?? 1) * sweptFalling(orbit, radius),
    period: orbit.period * (radius / orbit.radius) ** PERIOD_POWER,
    epoch: orbit.until,
    direction: orbit.direction,
  };
  settledOrbits.set(orbit, after);
  return after;
}
const climbs = (orbit: Orbit): orbit is Orbit & { until: number } => orbit.until != null;
// the plunge's radius and angle, as its share s of the way through (0 to 1):
// it dives fastest at first, levelling off as it slows
const plungeDepth = (s: number) => 1 - (1 - s) ** 2;
// the angular speed falls as (1 - 0.85s)³, so the angle swept is its
// integral: it streaks in fast and lingers while it burns brightest
const SLOWING = 0.85;
const plungeSweep = (s: number) => (1 - (1 - SLOWING * s) ** 4) / (4 * SLOWING);

// Where the plunge starts: the top of the atmosphere, or straight away for
// an orbit that starts below it.
const plungeStart = (orbit: Orbit) => Math.min(orbit.radius, burnRadius);

// When an orbit reaches the top of the atmosphere.
export function burnAt(orbit: Orbit): number {
  // a climb never burns up: what it settles into does
  if (climbs(orbit)) return burnAt(settled(orbit));
  const start = plungeStart(orbit);
  return orbit.epoch + (orbit.radius ** M - start ** M) / rateOf(orbit);
}

// When it has burned up: gone from the sky.
export const reentryAt = (orbit: Orbit): number => burnAt(orbit) + plungeMs;

// How far through its plunge an orbit is (0 to 1), or null outside it.
export function plungeAt(orbit: Orbit, time: number): number | null {
  const s = (time - burnAt(orbit)) / plungeMs;
  return s < 0 || s > 1 ? null : s;
}

// How long an orbit launched at a radius stays up.
const lifetimeAt = (radius: number) => reentryAt({ radius, phase: 0, period: periodAt(radius), epoch: 0 });

// How long a launch into the middle of a band stays up,
export function lifetime(band: Band): number {
  const { minRadius, maxRadius } = BANDS[band];
  return lifetimeAt((minRadius + maxRadius) / 2);
}

// and the spread, from the bottom of the band's reach to the top: a launch
// can land anywhere in it (bandReach, below).
export function lifetimeRange(band: Band): { shortest: number; longest: number } {
  const { min, max } = bandReach(band);
  return { shortest: lifetimeAt(min), longest: lifetimeAt(max) };
}

export function radiusAt(orbit: Orbit, time: number): number {
  if (climbs(orbit) && time > orbit.until) return radiusAt(settled(orbit), time);
  const burn = burnAt(orbit);
  if (time <= burn) return Math.max(orbit.radius ** M - rateOf(orbit) * (time - orbit.epoch), 0) ** (1 / M);
  const s = Math.min(1, (time - burn) / plungeMs);
  const start = plungeStart(orbit);
  return start - (start - endRadius) * plungeDepth(s);
}

// The angle swept by an orbit falling from r0 to r, in closed form: the
// angular speed is ω0·(r0/r)^P while radius^M falls at its rate (or rises,
// in a climb: the same formula).
function sweptFalling(orbit: Orbit, r: number): number {
  const omega = TAU / orbit.period;
  const power = M - PERIOD_POWER;
  return ((omega * orbit.radius ** PERIOD_POWER) / (rateOf(orbit) * (power / M))) * (orbit.radius ** power - r ** power);
}

// The angle swept since the epoch, whichever way round: it only grows.
export function sweptAt(orbit: Orbit, time: number): number {
  if (climbs(orbit) && time > orbit.until) return sweptAt(orbit, orbit.until) + sweptAt(settled(orbit), time);
  const burn = burnAt(orbit);
  if (time <= burn) return sweptFalling(orbit, radiusAt(orbit, time));
  const start = plungeStart(orbit);
  const omega = (TAU / orbit.period) * (orbit.radius / start) ** PERIOD_POWER;
  const s = Math.min(1, (time - burn) / plungeMs);
  return sweptFalling(orbit, start) + omega * plungeMs * plungeSweep(s);
}

// The angle, not wrapped to a turn: it runs on for ever in the orbit's
// direction, so two of them can be compared to find when they meet.
export const turnedAt = (orbit: Orbit, time: number): number =>
  orbit.phase + (orbit.direction ?? 1) * sweptAt(orbit, time);

export function angleAt(orbit: Orbit, time: number): number {
  const angle = turnedAt(orbit, time);
  return ((angle % TAU) + TAU) % TAU;
}

// How fast an orbit is falling now, in km per hour (over the next minute).
export function fallRate(orbit: Orbit, time: number): number {
  const step = 60_000;
  return (heightKm(radiusAt(orbit, time)) - heightKm(radiusAt(orbit, time + step))) * (3_600_000 / step);
}

// Milliseconds per orbit now: shorter as it falls.
// (Through the plunge it's the period at the plunge's start.)
export const periodNow = (orbit: Orbit, time: number): number =>
  orbit.period * (Math.max(radiusAt(orbit, time), plungeStart(orbit)) / orbit.radius) ** PERIOD_POWER;

export function positionAt(orbit: Orbit, time: number): { x: number; y: number } {
  const angle = angleAt(orbit, time);
  const radius = radiusAt(orbit, time);
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
}

// ── manoeuvres (ADR 0011) ──────────────────────────────────────────────────

// How long a satellite brought down takes to reach the top of the
// atmosphere, from any height (then it burns up as anything does, in
// DECAY.plungeMs), and how long a boost takes to climb a band.
export const MANOEUVRE = {
  descentMs: 120_000,
  climbMs: 90_000,
} as const;

// The band a boost takes a satellite to, from the band it's in now.
export const BAND_ABOVE: Record<Band, Band | null> = { low: "mid", mid: "high", high: null };

// The orbit from `time` as it is then: where it is, which way it's going,
// and its period there (a whole number of ms, as the database keeps it).
function from(orbit: Orbit, time: number) {
  const radius = radiusAt(orbit, time);
  return {
    radius,
    phase: angleAt(orbit, time),
    period: Math.round(periodNow(orbit, time)),
    epoch: time,
    direction: orbit.direction ?? 1,
  };
}

// Brought down on purpose, from `time`: it falls to the top of the
// atmosphere in MANOEUVRE.descentMs, however high it was.
export function descend(orbit: Orbit, time: number): Required<Orbit> {
  const start = from(orbit, time);
  const drop = start.radius ** M - Math.min(start.radius, burnRadius) ** M;
  return { ...start, rate: Math.max(1, drop / (RATE * MANOEUVRE.descentMs)), until: null };
}

// Boosted, from `time`: it climbs to `target` in MANOEUVRE.climbMs, then
// falls by drag alone from there.
export function climb(orbit: Orbit, time: number, target: number): Required<Orbit> {
  const start = from(orbit, time);
  const rise = target ** M - start.radius ** M;
  return { ...start, rate: -rise / (RATE * MANOEUVRE.climbMs), until: time + MANOEUVRE.climbMs };
}

// Whether an orbit is still climbing at `time`.
export const climbing = (orbit: Orbit, time: number): boolean => climbs(orbit) && time < orbit.until;

export function isOverhead(orbit: Orbit, time: number): boolean {
  const off = Math.abs(angleAt(orbit, time) - STATION_ANGLE);
  return Math.min(off, TAU - off) <= OVERHEAD_HALF_WIDTH;
}

// How long until an orbit next enters the station's window, or null if it
// burns up first. (Its period shortens as it falls, so this is a touch long
// for a high orbit; the sky re-reads it four times a second.)
export function untilOverhead(orbit: Orbit, time: number): number | null {
  if (plungeAt(orbit, time) !== null) return null;
  // a retrograde orbit comes at the window from the other side (ADR 0008)
  const angle = angleAt(orbit, time);
  const gap =
    orbit.direction === -1
      ? (angle - (STATION_ANGLE + OVERHEAD_HALF_WIDTH) + TAU) % TAU
      : (STATION_ANGLE - OVERHEAD_HALF_WIDTH - angle + TAU) % TAU;
  const ms = (gap / TAU) * periodNow(orbit, time);
  return time + ms < burnAt(orbit) ? ms : null;
}

// ── launching ──────────────────────────────────────────────────────────────

// Bands have soft edges. A launch's radius is drawn from a bell curve around
// the band's middle, wide enough that about one launch in eight strays past
// the band's edges, and cut off at its reach: SPILL half-widths either side,
// which keeps every band clear of its neighbours.
//
// The band's edges sit this many standard deviations from its middle,
export const BAND_SPREAD = 1.5;
// and its reach this many half-widths
const SPILL = 1.6;

export function bandReach(band: Band): { min: number; max: number } {
  const { minRadius, maxRadius } = BANDS[band];
  const middle = (minRadius + maxRadius) / 2;
  const half = (maxRadius - minRadius) / 2;
  return { min: middle - half * SPILL, max: middle + half * SPILL };
}

// A standard normal number, from two uniform ones (Box–Muller).
function normal(random: () => number): number {
  const u = 1 - random(); // never 0, so the log is finite
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * random());
}

// A new orbit in the band: the radius, phase and direction are random so no
// two orbits are the same, and the period is the one for that height.
export function placeInBand(band: Band, epoch: number, random = Math.random): Elements {
  const { minRadius, maxRadius } = BANDS[band];
  const middle = (minRadius + maxRadius) / 2;
  const half = (maxRadius - minRadius) / 2;
  const { min, max } = bandReach(band);
  let radius: number;
  do radius = middle + (normal(random) * half) / BAND_SPREAD;
  while (radius < min || radius > max);
  return {
    radius,
    phase: random() * TAU,
    period: Math.round(periodAt(radius)),
    epoch,
    // either way round, at random: going against the traffic is no advantage,
    // so it isn't a choice (ADR 0008)
    direction: random() < 0.5 ? 1 : -1,
  };
}
