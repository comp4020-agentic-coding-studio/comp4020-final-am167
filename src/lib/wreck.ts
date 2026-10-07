import { blocked } from "./launch.ts";

// What a collision leaves in words (ADR 0017). Each fragment carries a
// shard: a run of words from one side's line and a run from the other's,
// so every word of both survives once, scattered, each piece of one next to
// a piece of the other. Read in order, the wreck is a line neither person
// wrote. Shared by the server (which stores each fragment's shard) and the
// browser (which tells a collision with it).

// how the two runs in a shard are joined, and the wreck's shards in a line
export const JOIN = " … ";
export const BETWEEN = " / ";

// A line's words, as the wreck breaks it: by spaces, punctuation kept, and
// the joins of a shard it came from dropped, so a cascade re-cuts the words.
export const wordsOf = (text: string): string[] =>
  text.split(/\s+/).filter((word) => word !== "" && word !== JOIN.trim());

// what one side of a collision says: a satellite's beacon, a fragment's
// shard, a derelict's echo of a gone satellite's last words (or nothing)
export function lineOf(object: { kind: string; beacon: string | null; words?: string | null }): string | null {
  if (object.kind === "satellite") return object.beacon;
  return object.words ?? null;
}

// A small seeded generator (mulberry32), as collide.ts uses for fragments.
function seeded(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// a line cut into `n` runs in order, as even as they come (some empty when
// it's shorter than the wreck)
function runs(words: string[], n: number): string[][] {
  return Array.from({ length: n }, (_, i) => words.slice(Math.floor((i * words.length) / n), Math.floor(((i + 1) * words.length) / n)));
}

// The shards of `n` fragments, from two sides' lines: one side's runs dealt
// in order, the other's shuffled, which comes first drawn for each, all
// seeded by the pair, so the same collision always breaks the same way.
// Null for a fragment that carries nothing.
export function shardsOf(
  a: { id: number; text: string | null },
  b: { id: number; text: string | null },
  n: number,
): (string | null)[] {
  const [low, high] = a.id < b.id ? [a, b] : [b, a];
  const random = seeded(low.id * 100_003 + high.id + 0x2c1b3c6d);
  // the side dealt in order: the lower id's, unless it's silent, so a line
  // broken alone still reads through in order
  const [first, second] = wordsOf(low.text ?? "").length > 0 ? [low, high] : [high, low];
  const mine = runs(wordsOf(first.text ?? ""), n);
  const theirs = runs(wordsOf(second.text ?? ""), n);
  // a fair shuffle of the second side's runs
  for (let i = theirs.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [theirs[i], theirs[j]] = [theirs[j], theirs[i]];
  }
  return mine.map((run, i) => {
    const parts = [run, theirs[i]].filter((part) => part.length > 0).map((part) => part.join(" "));
    if (random() < 0.5) parts.reverse();
    if (parts.length === 0) return null;
    const shard = parts.join(JOIN);
    if (!blocked(shard)) return shard;
    // two clean lines can't spell a refused word across a join, but a run
    // of single letters could: without them, or not at all
    const plain = parts
      .map((part) => part.split(" ").filter((word) => [...word].length > 1).join(" "))
      .filter(Boolean)
      .join(JOIN);
    return plain && !blocked(plain) ? plain : null;
  });
}

// What a collision's wreck says: its fragments' shards in order, each with
// whether it's still up (the burned-up ones fall silent).
export interface WreckPiece {
  words: string;
  up: boolean;
}
