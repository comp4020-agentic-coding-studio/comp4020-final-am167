// Airtime at a ground station (ADR 0014, 0016): when more than one beacon is
// overhead, they take turns, each long enough to read, a longer line a
// longer turn. Shared by the server and the browser.

// How long a turn is: a few seconds to take in who it is, then time to read.
export const TURN = { min: 4000, max: 10_000, base: 2500, perCharacter: 55 };

export const turnLength = (text: string): number =>
  Math.min(TURN.max, Math.max(TURN.min, TURN.base + TURN.perCharacter * [...text].length));

// Whose turn it is at `time`, of those overhead (in a fixed order, each with
// its turn's length): round and round from the start of the server's clock,
// so every screen shows the same one at the same moment.
export function turnAt(lengths: readonly number[], time: number): number {
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (lengths.length <= 1 || total <= 0) return 0;
  let into = ((time % total) + total) % total;
  for (let i = 0; i < lengths.length; i++) {
    if (into < lengths[i]) return i;
    into -= lengths[i];
  }
  return lengths.length - 1;
}

// How long the static overhead holds a station, all of it together.
export const STATIC_TURN = 5000;

export interface Speaker {
  id: number;
  // its line: a beacon, or a fragment's shard
  text: string;
  // a fragment's static (ADR 0017), as against a satellite's beacon
  static: boolean;
}

// Who a station is broadcasting at `time`, of those overhead: each beacon
// takes its own turn, and all the static overhead shares one between them
// (a fragment a cycle, in turn), so a cascade can crowd a station but not
// drown it. Ordered by id, and timed by the server's clock, so every screen,
// and the server crediting who was heard, agree. `turn` and `of` say which
// turn of how many it is.
export function onAir<T extends Speaker>(overhead: readonly T[], time: number): { speaker: T; turn: number; of: number } | null {
  if (overhead.length === 0) return null;
  const sorted = [...overhead].sort((a, b) => a.id - b.id);
  const beacons = sorted.filter((s) => !s.static);
  const noise = sorted.filter((s) => s.static);
  const lengths = [...beacons.map((b) => turnLength(b.text)), ...(noise.length > 0 ? [STATIC_TURN] : [])];
  const turn = turnAt(lengths, time);
  if (turn < beacons.length) return { speaker: beacons[turn], turn, of: lengths.length };
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const cycle = Math.floor(time / total);
  return { speaker: noise[((cycle % noise.length) + noise.length) % noise.length], turn, of: lengths.length };
}
