import { isBand, type Band } from "./orbit.ts";

// What a launch form may carry (PLAN.md, "Beacon rules"). The beacon is shown
// to everyone and kept forever (ADR 0003), so it's short, plain and filtered.

export const CALLSIGN_MAX = 16;
// a thought, not a slogan, and readable in the dozen seconds a low
// satellite is over a station (ADR 0016)
export const BEACON_MAX = 140;

export interface LaunchInput {
  band: Band;
  callsign: string;
  beacon: string;
}

export type LaunchErrors = Partial<Record<"band" | "callsign" | "beacon" | "form", string>>;

export type LaunchValues = Record<"band" | "callsign" | "beacon", string>;

// Anything that reads as an address: a scheme, "www.", a name.tld with no
// space around the dot, or the usual dodges ("bit . ly", "example(dot)com").
// "e.g." and "3.14" get through; "end.Then" doesn't, which is a fair price.
const LINK = [
  /[\p{L}\p{N}]+:\/\//u,
  /\bwww\./iu,
  /[\p{L}\p{N}-]+\.\p{L}{2,}/u,
  /[\p{L}\p{N}-]+\s*[([{]\s*dot\s*[)\]}]\s*\p{L}{2,}/iu,
  /\s(\.|dot)\s*(com|net|org|io|co|ly|me|ru|ai|app|dev|gg|xyz|au|uk|tv)\b/iu,
];
const linky = (text: string) => LINK.some((pattern) => pattern.test(text));

// A small, crude list, matched word by word so ordinary words that happen to
// contain one ("sky", "grape", "therapist", "Scunthorpe") aren't caught. It
// won't stop someone determined; it stops the obvious, which is what a short
// line shown to every stranger needs.
const BLOCKED = [
  "fuck", "shit", "cunt", "bitch", "nigger", "nigga", "faggot", "fag", "retard",
  "kike", "spic", "chink", "tranny", "whore", "slut", "rape", "rapist", "nazi", "kys",
];
// endings that still leave the word itself: "fucking", "shitty", "bitches"
const ENDINGS = ["", "s", "es", "ed", "er", "ers", "ing", "in", "y", "ty", "head", "heads"];
// words with no innocent reading even inside another word: "motherfucker"
const ANYWHERE = ["fuck", "faggot", "nigger"];

// Lowercase letters only, with common stand-ins mapped back, so "sh1t" and
// "f.u.c.k" still match.
function squash(word: string): string {
  return word
    .toLowerCase()
    .replace(/[0@]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/[5$]/g, "s")
    .replace(/7/g, "t")
    .replace(/[^\p{L}]/gu, "");
}

function words(text: string): string[] {
  // runs of single letters ("f u c k") are read as one word too
  const tokens = text.split(/\s+/).map(squash).filter(Boolean);
  const spaced = text.match(/(?:\b\p{L}\b\s*){3,}/gu)?.map(squash) ?? [];
  return [...tokens, ...spaced];
}

export const blocked = (text: string) =>
  words(text).some(
    (word) =>
      BLOCKED.some((bad) => ENDINGS.some((end) => word === bad + end)) ||
      ANYWHERE.some((bad) => word.includes(bad)),
  );

export function readLaunch(
  form: FormData,
): { ok: true; input: LaunchInput } | { ok: false; errors: LaunchErrors; values: LaunchValues } {
  const values: LaunchValues = {
    band: String(form.get("band") ?? ""),
    callsign: String(form.get("callsign") ?? "").trim(),
    beacon: String(form.get("beacon") ?? "").trim().replace(/\s+/g, " "),
  };
  const errors: LaunchErrors = {};

  if (!isBand(values.band)) errors.band = "Pick an altitude band.";

  const { callsign, beacon } = values;
  if (callsign.length === 0) errors.callsign = "Give your satellite a callsign.";
  else if ([...callsign].length > CALLSIGN_MAX)
    errors.callsign = `A callsign is at most ${CALLSIGN_MAX} characters.`;
  else if (!/^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u.test(callsign))
    errors.callsign = "Use letters, numbers, spaces, hyphens or underscores.";
  else if (blocked(callsign)) errors.callsign = "That callsign has a word we don't broadcast. Pick another.";

  if (beacon.length === 0) errors.beacon = "Write the line your satellite will broadcast.";
  else if ([...beacon].length > BEACON_MAX)
    errors.beacon = `A beacon is at most ${BEACON_MAX} characters.`;
  else if (/\p{Cc}/u.test(beacon)) errors.beacon = "Plain text only.";
  else if (linky(beacon)) errors.beacon = "No links: the beacon is a line, not an advert.";
  else if (blocked(beacon)) errors.beacon = "That line has a word we don't broadcast. Try rewording it.";

  if (Object.keys(errors).length > 0) return { ok: false, errors, values };
  return { ok: true, input: { band: values.band as Band, callsign, beacon } };
}
