import type { AstroCookies } from "astro";
import { describe, expect, it } from "vitest";
import { MET_COOKIE, SEEN_COOKIE, newsFrom } from "../src/lib/seen.ts";

// What counts as news on the sky (ADR 0017): an encounter since the viewer
// last looked at Yours, or since they dismissed the sky's notice, whichever
// came later (a review of the overnight round, 2026-10-08: a dismissed
// notice came back on every visit).
const cookies = (values: Record<string, string>) =>
  ({ get: (name: string) => (name in values ? { value: values[name] } : undefined) }) as unknown as AstroCookies;

describe("news on the sky", () => {
  it("is everything, for someone who has never looked", () => {
    expect(newsFrom(cookies({}))).toBe(0);
  });

  it("starts from their last look at Yours, or from the notice they dismissed, whichever is later", () => {
    expect(newsFrom(cookies({ [SEEN_COOKIE]: "1000" }))).toBe(1000);
    expect(newsFrom(cookies({ [SEEN_COOKIE]: "1000", [MET_COOKIE]: "2000" }))).toBe(2000);
    expect(newsFrom(cookies({ [SEEN_COOKIE]: "3000", [MET_COOKIE]: "2000" }))).toBe(3000);
  });

  it("ignores a cookie that isn't a time", () => {
    expect(newsFrom(cookies({ [MET_COOKIE]: "soon" }))).toBe(0);
  });
});
