import type { AstroCookies } from "astro";

// When someone last looked at Yours (the review, 2026-10-07): what happened
// to their satellites since (an encounter, more people hearing them) is
// news, said on the sky and marked in Yours. A cookie, like the person.
export const SEEN_COOKIE = "kessler_seen";
const A_YEAR = 365 * 24 * 60 * 60;

// when they last looked, or 0 if they never have
export function lastLooked(cookies: AstroCookies): number {
  const at = Number(cookies.get(SEEN_COOKIE)?.value);
  return Number.isFinite(at) && at > 0 ? at : 0;
}

export function looked(cookies: AstroCookies, now: number, url: URL, headers: Headers): void {
  const https = url.protocol === "https:" || headers.get("x-forwarded-proto") === "https";
  cookies.set(SEEN_COOKIE, String(now), { path: "/", httpOnly: true, sameSite: "lax", secure: https, maxAge: A_YEAR });
}
