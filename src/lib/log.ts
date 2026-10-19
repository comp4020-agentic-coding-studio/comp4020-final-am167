import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomBytes } from "node:crypto";

// The server's record of who did what (crit 10; ADR 0023, 0024): one plain
// line on stdout per request, per thing a person does or is refused, and
// per thing the server does on its own, so `flyctl logs` alone tells two
// people apart and says who touched what. A line is `event key=value ...`;
// a value that isn't a plain word is quoted with JSON's escaping, so a line
// is always one line. A line written while serving a request starts with
// that request's id, `[3f9a1c] `. Errors are lines too, on stderr, with the
// error after them.

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

// The request being served, carried through its async work: its id, and
// who it's from once the middleware knows.
interface Serving {
  id: string;
  method: string;
  path: string;
  who: string | null;
}
const serving = new AsyncLocalStorage<Serving>();

// A line, tagged with the request it's written in, if any.
const tagged = (event: string, fields: Record<string, Value>): string => {
  const now = serving.getStore();
  return now ? `[${now.id}] ${line(event, fields)}` : line(event, fields);
};

export function log(event: string, fields: Record<string, Value>): void {
  console.log(tagged(event, fields));
}

// An error, as a line saying what failed (and, inside a request, for whom
// and where, so it can be tried again), then the error itself.
export function logError(what: string, error: unknown): void {
  const now = serving.getStore();
  const where = now ? { who: now.who ?? "none", method: now.method, path: now.path } : {};
  console.error(tagged("error", { ...where, what }), error);
}

// Serves a request (ADR 0024): every line written while `answer` runs is
// tagged with a fresh id, and once it's answered, a `request` line says who
// it was from, what they asked for, and how it went. A request that throws
// is an `error` line (Astro prints the stack after) and a 500.
export async function served(request: Request, answer: () => Promise<Response>): Promise<Response> {
  const now: Serving = {
    id: randomBytes(3).toString("hex"),
    method: request.method,
    path: clip(new URL(request.url).pathname, 80),
    who: null,
  };
  const started = performance.now();
  const done = (status: number) =>
    log("request", { who: now.who ?? "none", method: now.method, path: now.path, status, ms: Math.round(performance.now() - started) });
  return serving.run(now, async () => {
    try {
      const response = await answer();
      done(response.status);
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(tagged("error", { who: now.who ?? "none", method: now.method, path: now.path, what: "page", message: clip(message) }));
      done(500);
      throw error;
    }
  });
}

// Who the request being served is from, in the record's words (`whoIs`).
export function identify(who: string): void {
  const now = serving.getStore();
  if (now) now.who = who;
}

// `fn`, kept in the request it was made in: for a callback something else
// calls later, such as a stream's closing.
export const inThisRequest = <A extends unknown[], R>(fn: (...args: A) => R): ((...args: A) => R) => AsyncLocalStorage.bind(fn);

// `fn`, out of any request: for the server's own timers, which a request
// may start but which aren't its doing, so what they write has no id
// (ADR 0024). A timer otherwise keeps the id of the request that set it.
export const onItsOwn = <A extends unknown[], R>(fn: (...args: A) => R): ((...args: A) => R) =>
  (...args) => serving.exit(() => fn(...args));

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
