import { createHash } from "node:crypto";

// The server's record of who did what (crit 10; ADR 0022): one plain line
// on stdout per thing a person does or is refused, and per thing the server
// does on its own, so `flyctl logs` alone tells two people apart and says
// who touched what. A line is `event key=value ...`; a value that isn't a
// plain word is quoted with JSON's escaping, so a line is always one line.
// Errors stay on console.error: they aren't part of this record.

type Value = string | number | boolean | null | undefined;

// A bare value: nothing a reader could mistake for a space, a quote, an
// `=` or the end of the line.
const PLAIN = /^[\p{L}\p{N}_.:#@/,+-]+$/u;
// Anything that could break a line or turn it round on screen, left after
// JSON's escaping: line and paragraph separators, controls, bidi marks.
const UNSAFE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

export function format(value: string): string {
  if (PLAIN.test(value)) return value;
  // each UTF-16 unit, so a character past the first plane is a pair
  const escape = (c: string) => [...Array(c.length).keys()].map((i) => `\\u${c.charCodeAt(i).toString(16).padStart(4, "0")}`).join("");
  return JSON.stringify(value).replace(UNSAFE, escape);
}

// One line: the event, then each field that has a value, in the order given.
export function line(event: string, fields: Record<string, Value>): string {
  const parts = [event];
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined) continue;
    parts.push(`${key}=${format(String(value))}`);
  }
  return parts.join(" ");
}

export function log(event: string, fields: Record<string, Value>): void {
  console.log(line(event, fields));
}

// A moment as the record gives it, for the server's own events: settle can
// catch up on what happened while it was stopped, so a line's own time
// isn't always when it was written.
export const iso = (ms: number): string => new Date(ms).toISOString();

// A person's short id: the start of a SHA-256 of their cookie, so two
// people (two Chrome profiles, both anonymous) read differently, and the
// cookie, which is all it takes to act as them, is never written down.
export const shortId = (person: string): string => createHash("sha256").update(person).digest("hex").slice(0, 6);

// Who someone is in the record: their handle if they're signed in, `anon`
// if not, and their cookie's short id.
export const whoIs = (person: string | undefined, handle: string | null): string =>
  `${handle ?? "anon"}#${person ? shortId(person) : "none"}`;

// What someone typed into a refused form, cut short: a refusal can carry
// anything, at any length.
export const clip = (text: string, most = 160): string => ([...text].length > most ? `${[...text].slice(0, most).join("")}…` : text);
