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
