import { until } from "../lib/format.ts";
import { isOverhead, reentryAt, untilOverhead, type Orbit } from "../lib/orbit.ts";
import { countdown } from "./countdown.ts";

// Keeps a flying object's history counting down (ADR 0012): its next pass
// over the station and when it burns up, from its orbit and the server's
// clock, as the station panel does. Returns a way to stop.
export function keepCounting(article: HTMLElement, now: () => number): () => void {
  const orbit = article.dataset.orbit ? (JSON.parse(article.dataset.orbit) as Required<Orbit>) : null;
  const pass = article.querySelector<HTMLElement>("[data-pass]");
  const reentry = article.querySelector<HTMLElement>("[data-reentry]");
  if (!orbit) return () => {};
  const tick = () => {
    const time = now();
    if (pass) {
      const ms = untilOverhead(orbit, time);
      pass.textContent = isOverhead(orbit, time)
        ? "It's over the station now."
        : ms === null
          ? "It burns up before it next gets there."
          : `Next pass in ${countdown(ms)}.`;
    }
    if (reentry) reentry.textContent = time < reentryAt(orbit) ? `about ${until(reentryAt(orbit) - time)}` : "moments";
  };
  tick();
  const timer = setInterval(tick, 250);
  return () => clearInterval(timer);
}
