import { describe, expect, it } from "vitest";
import { DAY, QUESTIONS, answered, dayOf, questionOn } from "../src/lib/questions.ts";
import { sharedQuestion } from "../src/lib/story.ts";

// The stations' question (ADR 0018): one a day, from a fixed list, the day
// turning at midnight in Canberra (standard time). A launch says which
// day's question its form showed, and answers it if that was today's or
// yesterday's.

// noon on 7 October in Canberra (AEST, UTC+10)
const noon = Date.UTC(2026, 9, 7, 2);

describe("the stations' question", () => {
  it("is a short question, from a list long enough to last weeks", () => {
    expect(QUESTIONS.length).toBeGreaterThanOrEqual(14);
    for (const q of QUESTIONS) {
      expect(q).toMatch(/\?$/);
      expect(q.length).toBeLessThanOrEqual(100);
    }
    expect(new Set(QUESTIONS).size).toBe(QUESTIONS.length);
  });

  it("is the same all day in Canberra, and the next one from its midnight", () => {
    const today = dayOf(noon);
    // just after and just before midnight in Canberra: 14:00 UTC the day before
    expect(dayOf(Date.UTC(2026, 9, 6, 14, 0, 1))).toBe(today);
    expect(dayOf(Date.UTC(2026, 9, 7, 13, 59, 59))).toBe(today);
    expect(dayOf(Date.UTC(2026, 9, 7, 14, 0, 1))).toBe(today + 1);
    expect(dayOf(noon + DAY)).toBe(today + 1);
    const list: readonly string[] = QUESTIONS;
    expect(questionOn(today + 1)).toBe(list[(list.indexOf(questionOn(today)) + 1) % list.length]);
    // and round again
    expect(questionOn(today + QUESTIONS.length)).toBe(questionOn(today));
  });

  it("is answered by a launch from today's form or yesterday's, and nothing older", () => {
    const today = dayOf(noon);
    expect(answered(String(today), noon)).toBe(questionOn(today));
    // written just before midnight, sent just after
    expect(answered(String(today - 1), noon)).toBe(questionOn(today - 1));
    expect(answered(String(today - 2), noon)).toBeNull();
    expect(answered(String(today + 1), noon)).toBeNull();
    for (const junk of [null, "", "abc", "1e3", "-1", `${today}.5`, " 1"]) expect(answered(junk, noon)).toBeNull();
  });
});

describe("two answers that collide", () => {
  const party = (question: string | null) => ({ id: 1, kind: "satellite" as const, callsign: "A", beacon: "a", operator: null, from: null, question });
  it("are told as answers to the same question", () => {
    expect(sharedQuestion([party("Who?"), party("Who?")])).toBe("Who?");
    expect(sharedQuestion([party("Who?"), party("Why?")])).toBeNull();
    expect(sharedQuestion([party(null), party(null)])).toBeNull();
  });
});
