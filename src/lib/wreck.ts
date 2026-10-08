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
// it's shorter than the wreck), each with where it starts in the line
function runs(words: string[], n: number): { from: number; words: string[] }[] {
  return Array.from({ length: n }, (_, i) => {
    const from = Math.floor((i * words.length) / n);
    return { from, words: words.slice(from, Math.floor(((i + 1) * words.length) / n)) };
  });
}

// One run of a shard: which side it came from (0 or 1, as the two were
// given), where in that side's words (as wordsOf counts them), and the words.
interface Run {
  side: 0 | 1;
  from: number;
  words: string[];
}

type Side = { id: number; text: string | null };

// How `n` fragments deal two sides' lines: one side's runs in order, the
// other's shuffled, which comes first drawn for each, all seeded by the
// pair, so the same collision always breaks the same way. Each fragment's
// runs in the order its shard says them.
function dealt(a: Side, b: Side, n: number): Run[][] {
  const [low, high] = a.id < b.id ? [a, b] : [b, a];
  const random = seeded(low.id * 100_003 + high.id + 0x2c1b3c6d);
  // the side dealt in order: the lower id's, unless it's silent, so a line
  // broken alone still reads through in order
  const [first, second] = wordsOf(low.text ?? "").length > 0 ? [low, high] : [high, low];
  const sideOf = (o: Side): 0 | 1 => (o === a ? 0 : 1);
  const mine = runs(wordsOf(first.text ?? ""), n).map((run) => ({ ...run, side: sideOf(first) }));
  const theirs = runs(wordsOf(second.text ?? ""), n).map((run) => ({ ...run, side: sideOf(second) }));
  // a fair shuffle of the second side's runs
  for (let i = theirs.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [theirs[i], theirs[j]] = [theirs[j], theirs[i]];
  }
  return mine.map((run, i) => {
    const parts = [run, theirs[i]].filter((part) => part.words.length > 0);
    if (random() < 0.5) parts.reverse();
    return parts;
  });
}

// The shards of `n` fragments, from two sides' lines (see `dealt`). Null
// for a fragment that carries nothing.
export function shardsOf(a: Side, b: Side, n: number): (string | null)[] {
  return dealt(a, b, n).map((runs) => {
    const parts = runs.map((run) => run.words.join(" "));
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

// Where a fragment's words were torn from, for its card: each side's line
// (split as written, a cascade's joins kept), with the words this fragment
// carries marked, in the order its shard says them. `index` is the
// fragment's place among the `n` its collision left. Worked out from the
// deal, so each word is marked where it really came from; a shard the deal
// doesn't give now (an older wreck, or one the filter cut) is searched for
// instead, each run in a line no other run of it used.
export type Torn = { word: string; carried: boolean }[];
export function tornFrom(a: Side, b: Side, n: number, index: number, shard: string): { side: 0 | 1; tokens: Torn }[] {
  const lines = [a, b].map((side) => (side.text ?? "").split(/\s+/).filter(Boolean).map((word) => ({ word, carried: false })));
  // a side's words as wordsOf counts them, without the joins
  const words = lines.map((line) => line.filter((token) => token.word !== JOIN.trim()));
  const order: (0 | 1)[] = [];
  if (shardsOf(a, b, n)[index] === shard) {
    for (const run of dealt(a, b, n)[index]) {
      for (let k = 0; k < run.words.length; k++) words[run.side][run.from + k].carried = true;
      order.push(run.side);
    }
  } else {
    for (const run of shard.split(JOIN).map(wordsOf).filter((run) => run.length > 0)) {
      find: for (const side of [0, 1] as const) {
        if (order.includes(side)) continue;
        for (let i = 0; i + run.length <= words[side].length; i++) {
          const span = words[side].slice(i, i + run.length);
          if (span.every((token, j) => token.word === run[j])) {
            for (const token of span) token.carried = true;
            order.push(side);
            break find;
          }
        }
      }
    }
  }
  return order.map((side) => ({ side, tokens: lines[side] }));
}

// What a collision's wreck says: its fragments' shards in order, each with
// the fragment that carries it and whether it's still up (the burned-up
// ones fall silent).
export interface WreckPiece {
  id: number;
  words: string;
  up: boolean;
}
