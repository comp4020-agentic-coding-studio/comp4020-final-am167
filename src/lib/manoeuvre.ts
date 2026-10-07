import { until } from "./format.ts";
import { BAND_ABOVE, BANDS, bandAt, burnAt, climbing, plungeAt, radiusAt, reentryAt, type Band, type Orbit } from "./orbit.ts";

// What an owner can do with a satellite of theirs (ADR 0011), and how a page
// says where it stands: shared by the server and the browser.

// How many boosts a satellite's fuel is good for.
export const FUEL = 1;

// what a manoeuvre needs to know of a satellite
export type Manoeuvrable = Orbit & { deorbitedAt: number | null; boosts: number };

// why one is refused, for a page to say without JavaScript
export type Refusal = "not-yours" | "coming-down" | "burning" | "no-fuel" | "top-band";

export const REFUSALS: Record<Refusal, string> = {
  "not-yours": "That isn't one of your satellites in orbit.",
  "coming-down": "It's already coming down.",
  burning: "It's already burning up on re-entry.",
  "no-fuel": `It has no fuel left: a satellite can boost ${FUEL === 1 ? "once" : `${FUEL} times`}.`,
  "top-band": "It's in the high band already: there's nowhere higher to go.",
};

export const isRefusal = (value: unknown): value is Refusal =>
  typeof value === "string" && Object.hasOwn(REFUSALS, value);

// What a satellite can do now: be brought down, be boosted (and to which
// band), or not, and why not.
export function canManoeuvre(
  object: Manoeuvrable,
  now: number,
): { deorbit: Refusal | null; boost: Refusal | null; to: Band | null } {
  if (object.deorbitedAt !== null) return { deorbit: "coming-down", boost: "coming-down", to: null };
  if (now >= burnAt(object)) return { deorbit: "burning", boost: "burning", to: null };
  const to = BAND_ABOVE[bandAt(radiusAt(object, now))];
  return {
    deorbit: null,
    boost: object.boosts >= FUEL || climbing(object, now) ? "no-fuel" : to === null ? "top-band" : null,
    to,
  };
}

// "Low band, burns up in 4 h", "Climbing to the mid band", "Coming down:
// burns up in 2 min", "Burning up on re-entry".
export function standing(object: Manoeuvrable, now: number): string {
  if (plungeAt(object, now) !== null) return "Burning up on re-entry";
  const left = until(reentryAt(object) - now);
  if (object.deorbitedAt !== null) return `Coming down: burns up in ${left}`;
  const band = bandAt(radiusAt(object, now));
  if (climbing(object, now)) {
    const to = bandAt(radiusAt(object, object.until ?? now));
    return `Climbing to the ${BANDS[to].label.toLowerCase()} band`;
  }
  return `${BANDS[band].label} band, burns up in ${left}`;
}
