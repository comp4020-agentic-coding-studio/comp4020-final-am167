import { describe, expect, it } from "vitest";
import { blocked } from "../src/lib/launch.ts";
import { JOIN, shardsOf, tornFrom, wordsOf } from "../src/lib/wreck.ts";

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

// The card's "torn from" (2026-10-08): a fragment's words shown inside the
// lines they came from, so "bruh" reads as a piece of "idk bruh", not as a
// word from nowhere. Worked out from how the pair dealt its words (seeded,
// so it's exact), not by searching, which marked the wrong copy of a
// repeated word and could put both runs in one line (the review).
describe("where a fragment's words were torn from", () => {
  const carried = (tokens: { word: string; carried: boolean }[]) => tokens.filter((t) => t.carried).map((t) => t.word);
  const repeats = { id: 3, text: "would, a line long enough, a line long enough, would" };
  const echoes = { id: 9, text: "up for a while, up for a while" };

  it("marks every word of both lines exactly once across the whole wreck, repeated words too", () => {
    for (const n of [1, 3, 6]) {
      const counts = [repeats, echoes].map((side) => side.text.split(/\s+/).map(() => 0));
      shardsOf(repeats, echoes, n).forEach((shard, i) => {
        if (!shard) return;
        for (const line of tornFrom(repeats, echoes, n, i, shard)) {
          line.tokens.forEach((token, k) => token.carried && counts[line.side][k]++);
        }
      });
      expect(counts.flat(), `${n} fragments`).toEqual(counts.flat().map(() => 1));
    }
  });

  it("gives each of a shard's two runs its own line, in the order the shard says them", () => {
    shardsOf(alpha, bravo, 6).forEach((shard, i) => {
      const lines = tornFrom(alpha, bravo, 6, i, shard!);
      expect(lines.map((line) => line.side).sort()).toEqual([0, 1]);
      expect(lines.flatMap((line) => carried(line.tokens))).toEqual(wordsOf(shard!));
    });
  });

  it("keeps a cascade's joins in the line but never marks them", () => {
    const debris = { id: 300, text: `to${JOIN}nominal` };
    const third = { id: 99, text: "back to the sky" };
    shardsOf(debris, third, 3).forEach((shard, i) => {
      if (!shard) return;
      for (const line of tornFrom(debris, third, 3, i, shard)) {
        expect(line.tokens.filter((t) => t.word === JOIN.trim()).every((t) => !t.carried)).toBe(true);
      }
    });
    const line = shardsOf(debris, third, 3)
      .flatMap((shard, i) => (shard ? tornFrom(debris, third, 3, i, shard) : []))
      .find((l) => l.side === 0)!;
    expect(line.tokens.map((t) => t.word)).toEqual(["to", JOIN.trim(), "nominal"]);
  });

  it("still finds the words, each run in its own line, in a shard cut another way", () => {
    // not what the pair deals now (an older wreck): found by searching
    expect(tornFrom({ id: 1, text: "idk bruh" }, { id: 2, text: null }, 3, 0, "bruh")).toEqual([
      { side: 0, tokens: [{ word: "idk", carried: false }, { word: "bruh", carried: true }] },
    ]);
    const lines = tornFrom({ id: 1, text: "up for a while" }, { id: 2, text: "up for it" }, 3, 0, `for${JOIN}up`);
    expect(lines.map((line) => line.side).sort()).toEqual([0, 1]);
  });
});
