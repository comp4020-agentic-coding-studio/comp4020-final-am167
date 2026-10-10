import type { AstroCookies } from "astro";

// When someone last looked at Yours (the review, 2026-10-07): what happened
// to their satellites since (an encounter, more people hearing them) is
// news, said on the sky and marked in Yours. A cookie, like the person.
export const SEEN_COOKIE = "kessler_seen";
const A_YEAR = 365 * 24 * 60 * 60;

// The news the sky's notice told them of (an encounter, or theirs burning
// up), by when the newest of it happened, once they've dismissed it there:
// set by the page's script, so not httpOnly.
export const MET_COOKIE = "kessler_met";

const timeIn = (cookies: AstroCookies, name: string) => {
  const at = Number(cookies.get(name)?.value);
  return Number.isFinite(at) && at > 0 ? at : 0;
};

// when they last looked, or 0 if they never have
export const lastLooked = (cookies: AstroCookies): number => timeIn(cookies, SEEN_COOKIE);

// What's news on the sky: anything after their last look at Yours, or
// after the encounter whose notice they dismissed, whichever is later.
export const newsFrom = (cookies: AstroCookies): number => Math.max(lastLooked(cookies), timeIn(cookies, MET_COOKIE));

export function looked(cookies: AstroCookies, now: number, url: URL, headers: Headers): void {
  const https = url.protocol === "https:" || headers.get("x-forwarded-proto") === "https";
  cookies.set(SEEN_COOKIE, String(now), { path: "/", httpOnly: true, sameSite: "lax", secure: https, maxAge: A_YEAR });
}
