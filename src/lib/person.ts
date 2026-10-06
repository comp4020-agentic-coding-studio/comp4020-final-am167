import type { AstroCookies } from "astro";

// A person is an anonymous cookie (ADR 0002, 0009): a random id, set on the
// first visit and kept for years, and replaced when they sign out.
export const PERSON_COOKIE = "kessler_person";
const TEN_YEARS = 10 * 365 * 24 * 60 * 60;

export function newPerson(cookies: AstroCookies, url: URL, headers: Headers): string {
  const person = crypto.randomUUID();
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
