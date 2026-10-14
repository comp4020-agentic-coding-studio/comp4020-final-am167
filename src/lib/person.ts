import type { AstroCookies } from "astro";
import { clip, log, whoIs } from "./log.ts";

// A person is an anonymous cookie (ADR 0002, 0009): a random id, set on the
// first visit and kept for years, and replaced when they sign out.
export const PERSON_COOKIE = "kessler_person";
const TEN_YEARS = 10 * 365 * 24 * 60 * 60;

// Sets this browser's cookie to `person`: a new one, unless given.
export function newPerson(cookies: AstroCookies, url: URL, headers: Headers, person: string = crypto.randomUUID()): string {
  // Fly's proxy terminates TLS, so the request the app sees is plain http
  const https = url.protocol === "https:" || headers.get("x-forwarded-proto") === "https";
  cookies.set(PERSON_COOKIE, person, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: https,
    maxAge: TEN_YEARS,
  });
  return person;
}

// Someone new: a browser with no cookie (or one that isn't ours) gets one,
// and the record notes the visit (ADR 0023), naming them by its short id.
export function newVisitor(cookies: AstroCookies, url: URL, headers: Headers): string {
  const person = newPerson(cookies, url, headers);
  log("visit", { who: whoIs(person, null), path: clip(url.pathname, 80) });
  return person;
}
