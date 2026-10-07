import { until } from "../lib/format.ts";
import { reentryAt, type Orbit } from "../lib/orbit.ts";
import { nextStation, stationOver } from "../lib/stations.ts";
import { countdown } from "./countdown.ts";

// Keeps a flying object's history counting down (ADR 0012): its next pass
// over a ground station (ADR 0014) and when it burns up, from its orbit and
// the server's clock, as the beacons panel does. Returns a way to stop.
export function keepCounting(article: HTMLElement, now: () => number): () => void {
  const orbit = article.dataset.orbit ? (JSON.parse(article.dataset.orbit) as Required<Orbit>) : null;
  const pass = article.querySelector<HTMLElement>("[data-pass]");
  const reentry = article.querySelector<HTMLElement>("[data-reentry]");
  if (!orbit) return () => {};
  const tick = () => {
    const time = now();
    if (pass) {
      const over = stationOver(orbit, time);
      const next = over ? null : nextStation(orbit, time);
      pass.textContent = over
        ? `It's over ${over.name} now.`
        : next === null
          ? "It burns up before it next gets to one."
          : `Next over ${next.station.name} in ${countdown(next.in)}.`;
    }
    if (reentry) reentry.textContent = time < reentryAt(orbit) ? `about ${until(reentryAt(orbit) - time)}` : "moments";
  };
  tick();
  const timer = setInterval(tick, 250);
  return () => clearInterval(timer);
}
