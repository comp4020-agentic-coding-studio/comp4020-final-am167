import { describe, expect, it } from "vitest";
import { blocked } from "../src/lib/launch.ts";
import { JOIN, shardsOf, wordsOf } from "../src/lib/wreck.ts";

// What a collision's fragments carry (ADR 0017): a run of words from each
// side, so every word of both lines survives once, scattered, each piece of
// one next to a piece of the other. Seeded by the two ids, so a replay
// makes the same shards.

const alpha = { id: 12, text: "the sea remembers every boat it ever swallowed whole" };
const bravo = { id: 40, text: "I miss my dog more than I can say out loud" };

// the words a list of shards carries from one side, in the order it gives them
const from = (shards: (string | null)[], side: string[]) =>
  shards.flatMap((shard) => (shard ? shard.split(JOIN).map(wordsOf) : [])).filter((run) => run.every((w) => side.includes(w)));

describe("a collision's shards", () => {
  it("carry every word of both lines, once, in order on each side", () => {
    const shards = shardsOf(alpha, bravo, 6);
    expect(shards).toHaveLength(6);
    const a = wordsOf(alpha.text);
    const b = wordsOf(bravo.text);
    const all = shards.flatMap((s) => (s ? wordsOf(s) : []));
    expect([...all].sort()).toEqual([...a, ...b].sort());
    // alpha's runs are dealt in order, so they read through its line
    expect(from(shards, a).flat()).toEqual(a);
    // each of bravo's runs is a stretch of its line, in order
    for (const run of from(shards, b)) expect(bravo.text).toContain(run.join(" "));
  });

  it("put a piece of each side on each fragment, when both have enough words", () => {
    for (const shard of shardsOf(alpha, bravo, 6)) {
      expect(shard).not.toBeNull();
      expect(shard!.split(JOIN)).toHaveLength(2);
    }
  });

  it("are the same every time, whichever way round they're asked", () => {
    expect(shardsOf(alpha, bravo, 6)).toEqual(shardsOf(alpha, bravo, 6));
    expect(shardsOf(bravo, alpha, 6)).toEqual(shardsOf(alpha, bravo, 6));
    // and another pair breaks differently
    expect(shardsOf({ ...alpha, id: 13 }, bravo, 6)).not.toEqual(shardsOf(alpha, bravo, 6));
  });

  it("carry only one side's words when the other is silent (a derelict)", () => {
    const shards = shardsOf(alpha, { id: 7, text: null }, 6);
    expect(shards.flatMap((s) => (s ? wordsOf(s) : []))).toEqual(wordsOf(alpha.text));
    for (const shard of shards) if (shard) expect(shard).not.toContain(JOIN.trim());
  });

  it("are silent when neither side says anything", () => {
    expect(shardsOf({ id: 1, text: null }, { id: 2, text: null }, 6)).toEqual([null, null, null, null, null, null]);
  });

  it("leave some fragments silent when the lines are shorter than the wreck", () => {
    const shards = shardsOf({ id: 1, text: "hi" }, { id: 2, text: "yes" }, 6);
    expect(shards.filter(Boolean).length).toBeLessThanOrEqual(2);
    expect(shards.flatMap((s) => (s ? wordsOf(s) : [])).sort()).toEqual(["hi", "yes"]);
  });

  it("carry a cascade's words on: debris's own shard breaks like a line", () => {
    const [shard] = shardsOf(alpha, bravo, 6);
    const third = { id: 99, text: "minding my own business up here" };
    const next = shardsOf({ id: 300, text: shard }, third, 3);
    const carried = next.flatMap((s) => (s ? wordsOf(s) : []));
    // every word of the fragment's shard goes on, and none of its joins
    for (const word of wordsOf(shard!)) expect(carried).toContain(word);
    expect(carried).not.toContain(JOIN.trim());
  });

  it("never say a word the filter refuses", () => {
    // each side is clean on its own
    const sides = ["f u", "c k me now", "s h", "i t happens", "what the", "heck is this"];
    for (const a of sides) {
      for (const b of sides) {
        for (const shard of shardsOf({ id: 1, text: a }, { id: 2, text: b }, 3)) {
          if (shard) expect(blocked(shard), shard).toBe(false);
        }
      }
    }
  });
});
