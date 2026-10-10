// Collisions (ADR 0008): when two orbits meet, and what's left when they do.
// Positions are a pure function of the orbit and the time (src/lib/orbit.ts),
// so a meeting is found in closed form, not by stepping through time: the
// server can predict it ahead, and replay it after a restart, exactly.
//
// Distances are in planet radii, angles in radians, times in server ms.

import { DECAY, angleAt, bandReach, burnAt, periodAt, radiusAt, turnedAt, type Elements, type Orbit } from "./orbit.ts";

const TAU = 2 * Math.PI;

// How close in height two satellites must be when their angles meet to
// collide. Head-on meetings and one lapping another (going the same way)
// each have their own, tuned separately with the sim running.
export const HIT = {
  headOn: 0.012,
  lapping: 0.015,
};

// How big each kind of object is, as a share of a satellite: two objects'
// hit distance is the satellites' scaled by the average of their sizes. A
// fragment is small, so debris mostly threatens satellites, and only rarely
// other debris; otherwise one collision's fragments set off the next at
// once, and a cascade clears a band in minutes.
export const SIZE = {
  satellite: 1,
  derelict: 1,
  debris: 0.2,
};

// Not every meeting is a hit: real conjunctions almost always miss. Each
// meeting of a pair is a chance, the same for every meeting, and which one
// hits is drawn once from the pair's ids (fatalMeeting, below), so it's the
// same on every replay. Lapping meetings are rare (hours apart), so each is
// a bigger chance. Head-on meetings were three times as frequent before the
// orbits slowed (ADR 0013); each is three times the chance it was, so
// collisions come about as often as they did.
//
// And not every close pair ever collides (ADR 0020): `ever` is the chance it
// does, drawn once from its ids too. Otherwise a pair in reach met so often
// over hours that nearly every satellite with a neighbour was destroyed
// before it could burn up.
export const CHANCE = {
  headOn: 0.06,
  lapping: 0.5,
  ever: 0.5,
};

// A pass closer than this share of the hit distance is dead centre: it
// always hits, at the first meeting. Random launches almost never pass that
// close; the server stages a collision this way when nothing is coming
// (src/lib/sky.ts).
export const DEAD_CENTRE = 0.02;

export type Sized = Orbit & { kind?: keyof typeof SIZE };

// What a collision leaves: a few fragments from each satellite (or
// derelict), scattered in height up to maxSpread and in angle up to
// angleSpread either side of the impact. Most keep their object's direction;
// the rest are thrown the other way. A fragment that hits something is
// pulverised and leaves nothing, so debris can destroy satellites but not
// multiply on its own: once people stop launching, a cascade runs out of
// satellites to break and the sky heals.
export const FRAGMENTS = {
  perObject: 3,
  maxSpread: 0.15,
  angleSpread: 0.1,
  keepDirection: 0.7,
};

// A collision under the launch bands only falls: its fragments go down from
// the impact, never up, and no higher than out of reach of the lowest
// launch. Heights keep their order as everything falls, so nothing launched
// since can meet them, and those knocked into the atmosphere burn up at
// once. The server stages its collisions there (src/lib/sky.ts); in the low
// band's middle their debris took nearly every low launch with it.
const FLOOR = bandReach("low").min;
const CEILING = FLOOR - (Math.max(HIT.headOn, HIT.lapping) * (SIZE.satellite + SIZE.debris)) / 2;

const directionOf = (orbit: Orbit) => orbit.direction ?? 1;

// How close in height two objects must be to collide when they meet.
export function hitDistance(a: Sized, b: Sized): number {
  const base = directionOf(a) === directionOf(b) ? HIT.lapping : HIT.headOn;
  return (base * (SIZE[a.kind ?? "satellite"] + SIZE[b.kind ?? "satellite"])) / 2;
}

// The earliest time in [from, to] at which `reached` is true, for a test
// that turns true once and stays true. To well under a millisecond: it
// bisects the offset from `from`, since clock-sized numbers (around 1.7e12)
// can't be halved that finely.
function earliest(reached: (time: number) => boolean, from: number, to: number): number {
  let lo = 0;
  let hi = to - from;
  while (hi - lo > 1e-3) {
    const mid = (lo + hi) / 2;
    if (reached(from + mid)) hi = mid;
    else lo = mid;
  }
  return from + hi;
}

// When two orbits next meet (or their nth meeting), from `from` or from
// when both exist, or null if they never will.
//
// Two objects meet when the angle between them crosses a whole turn while
// they're within the hit distance in height. Nothing collides once it's
// burning up. The search goes in pieces of time where both fall at one
// steady rate (a climb ending starts a new piece, ADR 0011):
//
// - Falling at the same rate (everything but a manoeuvre: radius³ drops at
//   one rate for all), the gap in radius³ between them is fixed, so the gap
//   in height only grows as they sink. A pair farther apart than the hit
//   distance never collides there, and a pair inside it only until the gap
//   reaches it.
// - At different rates (one brought down, or climbing), the gap in radius³
//   changes steadily, so their heights cross at most once: they're close
//   for a stretch either side of the crossing.
//
// (Within a piece the gap in height is taken to change one way on each side
// of the crossing. Two objects manoeuvring at once could in principle bend
// that; a brute-force scan of descents and climbs found no case.)
//
// While close, the angle between them changes one way only (head-on, both
// sweep towards each other; same way, the lower is always the faster, so a
// crossing of heights is a turning point and splits the stretch in two).
export function nextMeeting(a: Sized, b: Sized, from: number, nth = 1): number | null {
  const start = Math.max(from, a.epoch, b.epoch);
  const end = Math.min(burnAt(a), burnAt(b));
  if (start >= end) return null;

  const hit = hitDistance(a, b);
  const gap = (time: number) => radiusAt(a, time) - radiusAt(b, time);
  const near = (time: number) => Math.abs(gap(time)) < hit;
  const between = (time: number) => turnedAt(a, time) - turnedAt(b, time);

  // the stretches of time they're close, in order
  const stretches: [number, number][] = [];
  const climbEnds = [a.until, b.until].filter((t): t is number => t != null && t > start && t < end).sort((x, y) => x - y);
  const edges = [start, ...climbEnds, end];
  for (let i = 0; i + 1 < edges.length; i++) {
    const [s, e] = [edges[i], edges[i + 1]];
    const crossing = Math.sign(gap(s)) !== Math.sign(gap(e)) ? earliest((t) => Math.sign(gap(t)) === Math.sign(gap(e)), s, e) : null;
    if (crossing === null) {
      // moving apart, or closing in, without crossing
      if (near(s)) stretches.push([s, near(e) ? e : earliest((t) => !near(t), s, e)]);
      else if (near(e)) stretches.push([earliest(near, s, e), e]);
      continue;
    }
    stretches.push([near(s) ? s : earliest(near, s, crossing), crossing]);
    stretches.push([crossing, near(e) ? e : earliest((t) => !near(t), crossing, e)]);
  }

  // the nth whole turn crossed while close
  let left = nth;
  for (const [s, e] of stretches) {
    const first = between(s);
    const last = between(e);
    if (first === last) continue;
    const closing = last > first;
    const crossed = closing
      ? Math.floor(last / TAU) - Math.floor(first / TAU)
      : Math.ceil(first / TAU) - Math.ceil(last / TAU);
    if (crossed < left) {
      left -= crossed;
      continue;
    }
    const target = closing
      ? TAU * (Math.floor(first / TAU) + left)
      : TAU * (Math.ceil(first / TAU) - left);
    return earliest((time) => (closing ? between(time) >= target : between(time) <= target), s, e);
  }
  return null;
}

// Where two orbits meeting at `at` collide: their shared angle, halfway
// between their heights.
export function impactOf(a: Orbit, b: Orbit, at: number): { angle: number; radius: number } {
  return { angle: angleAt(a, at), radius: (radiusAt(a, at) + radiusAt(b, at)) / 2 };
}

// A small seeded generator (mulberry32), so a collision makes the same
// fragments on every replay.
function seeded(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A standard normal number, from two uniform ones (Box–Muller).
function normal(random: () => number): number {
  const u = 1 - random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * random());
}

// The fragments two objects break into when they meet at `at`: orbits that
// start there, seeded by the two objects so the same collision always makes
// the same fragments, whichever way round it's asked. Debris makes none.
export function fragmentsOf<T extends Sized & { id: number }>(a: T, b: T, at: number): Elements[] {
  const [first, second] = a.id < b.id ? [a, b] : [b, a];
  const random = seeded(first.id * 100_003 + second.id);
  const impact = impactOf(first, second, at);
  // under the launch bands, falling from no higher than CEILING
  const under = impact.radius < FLOOR;
  const top = Math.min(impact.radius, CEILING);
  const fragments: Elements[] = [];
  for (const parent of [first, second]) {
    if (parent.kind === "debris") continue;
    for (let i = 0; i < FRAGMENTS.perObject; i++) {
      const spread = Math.max(-1, Math.min(1, normal(random) / 2)) * FRAGMENTS.maxSpread;
      const radius = Math.max(under ? top - Math.abs(spread) : impact.radius + spread, DECAY.endRadius + 0.01);
      const phase = impact.angle + (random() * 2 - 1) * FRAGMENTS.angleSpread;
      const keep = random() < FRAGMENTS.keepDirection;
      fragments.push({
        radius,
        phase: ((phase % TAU) + TAU) % TAU,
        period: Math.round(periodAt(radius)),
        epoch: at,
        direction: keep ? directionOf(parent) : (-directionOf(parent) as 1 | -1),
      });
    }
  }
  return fragments;
}

// Which meeting of two objects is the one that hits (1 for the first), or
// null if none ever does: drawn from the pair's ids, so the same pair always
// gets the same answer. A pass dead centre always hits.
export function fatalMeeting(a: Sized & { id: number }, b: Sized & { id: number }): number | null {
  const start = Math.max(a.epoch, b.epoch);
  if (Math.abs(radiusAt(a, start) - radiusAt(b, start)) < hitDistance(a, b) * DEAD_CENTRE) return 1;
  const chance = directionOf(a) === directionOf(b) ? CHANCE.lapping : CHANCE.headOn;
  const [low, high] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
  const random = seeded(low * 100_003 + high + 0x5bd1e995);
  const draw = random();
  if (random() >= CHANCE.ever) return null;
  return Math.max(1, Math.ceil(Math.log(1 - draw) / Math.log(1 - chance)));
}
