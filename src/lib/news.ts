import { nobodys, type StoryParty } from "./story.ts";

// What the sky's news line tells first (src/scripts/sky.ts, ADR 0020), kept
// apart so it can be tested. A collision staged for a watcher comes every
// few minutes and takes nobody's satellite; told first, it hid nearly every
// burn-up there was.

// A person's satellite the page has seen burn up, or one of yours destroyed
// (kept for your line under the stations).
export interface BurnUp {
  callsign: string;
  at: number;
  mine: boolean;
  // its owner brought it down (ADR 0011)
  deorbited: boolean;
  // or it didn't burn up: it was destroyed in a collision
  destroyed?: boolean;
}

// how long a burn-up stays news
export const FRESH_MS = 15 * 60_000;

// The burn-up the line puts first: one burning now (from when its plunge
// began), or the latest to burn up in the last FRESH_MS. One of yours
// destroyed isn't a burn-up: it looks past those.
export function freshBurnUp(burnUps: Iterable<BurnUp>, burningSince: number | null, time: number): { at: number } | null {
  if (burningSince !== null) return { at: burningSince };
  let found: BurnUp | null = null;
  for (const b of burnUps) if (!b.destroyed && (!found || b.at > found.at)) found = b;
  return found && time - found.at < FRESH_MS ? found : null;
}

// The collision the line may tell: the newest, unless a fresh burn-up is
// newer, or the collision took nobody's satellite. Never an older one in its
// place, which would bring old news back over new.
export function storyToTell<S extends { at: number; parties: readonly [StoryParty, StoryParty] }>(
  stories: Iterable<S>,
  burnUpAt: number | null,
): S | null {
  let newest: S | null = null;
  for (const story of stories) if (!newest || story.at > newest.at) newest = story;
  if (!newest || burnUpAt === null) return newest;
  return nobodys(newest.parties) || newest.at < burnUpAt ? null : newest;
}
