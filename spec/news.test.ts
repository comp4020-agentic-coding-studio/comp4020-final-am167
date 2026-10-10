import { describe, expect, it } from "vitest";
import { freshBurnUp, storyToTell, type BurnUp } from "../src/lib/news.ts";
import type { StoryParty } from "../src/lib/story.ts";

// What the sky's news line tells first (src/scripts/sky.ts, ADR 0020): a
// person's satellite burning up comes before a collision that took nobody's
// satellite, or one older than the burn-up; and old news never comes back
// in place of new.

const MIN = 60_000;
const party = (id: number, kind: StoryParty["kind"], from: StoryParty["from"] = null): StoryParty => ({
  id,
  kind,
  callsign: kind === "satellite" ? `SAT${id}` : null,
  beacon: null,
  operator: null,
  from,
});
const derelicts = (id: number, at: number) => ({ id, at, parties: [party(1, "derelict"), party(2, "derelict")] as [StoryParty, StoryParty] });
const someones = (id: number, at: number) => ({ id, at, parties: [party(3, "satellite"), party(4, "derelict")] as [StoryParty, StoryParty] });
const burnUp = (at: number, extra: Partial<BurnUp> = {}): BurnUp => ({ callsign: "EMBER", at, mine: false, deorbited: false, ...extra });

describe("the news line's burn-up", () => {
  const now = 100 * MIN;

  it("is one burning now, or the latest to burn up in the last 15 minutes", () => {
    expect(freshBurnUp([burnUp(now - 20 * MIN)], null, now)).toBeNull();
    expect(freshBurnUp([burnUp(now - 20 * MIN), burnUp(now - 3 * MIN)], null, now)?.at).toBe(now - 3 * MIN);
    expect(freshBurnUp([], now - 10_000, now)?.at).toBe(now - 10_000);
  });

  it("isn't one of yours destroyed: it looks past that to the last real burn-up", () => {
    const burns = [burnUp(now - 6 * MIN), burnUp(now - 2 * MIN, { mine: true, destroyed: true })];
    expect(freshBurnUp(burns, null, now)?.at).toBe(now - 6 * MIN);
  });
});

describe("the collision the news line tells", () => {
  const now = 100 * MIN;

  it("is the newest, when nothing has burned up lately", () => {
    expect(storyToTell([derelicts(2, now - MIN), someones(1, now - 9 * MIN)], null)?.id).toBe(2);
  });

  it("gives way to a burn-up when it took nobody's satellite", () => {
    expect(storyToTell([derelicts(2, now - MIN)], now - 5 * MIN)).toBeNull();
    const wreck = { id: 3, at: now - MIN, parties: [party(5, "debris", [party(1, "derelict"), party(2, "derelict")]), party(6, "derelict")] as [StoryParty, StoryParty] };
    expect(storyToTell([wreck], now - 5 * MIN)).toBeNull();
  });

  it("gives way to a newer burn-up, even when it took someone's", () => {
    expect(storyToTell([someones(1, now - 9 * MIN)], now - 3 * MIN)).toBeNull();
    expect(storyToTell([someones(1, now - MIN)], now - 3 * MIN)?.id).toBe(1);
  });

  it("never brings back an older collision in place of a newer one", () => {
    expect(storyToTell([derelicts(2, now - MIN), someones(1, now - 12 * MIN)], now - 5 * MIN)).toBeNull();
  });
});
