import { falling, km, until } from "../lib/format.ts";
import { fallRate, heightKm, radiusAt, reentryAt, type Orbit } from "../lib/orbit.ts";
import { nextStation, stationOver } from "../lib/stations.ts";
import { countdown } from "./countdown.ts";

// Keeps a flying object's history counting down (ADR 0012): its next pass
// over a ground station (ADR 0014), its height and when it burns up, from
// its orbit and the server's clock, as the beacons panel does. Also a card
// in Yours (ADR 0015), which marks the same parts. Returns a way to stop.
export function keepCounting(article: HTMLElement, now: () => number): () => void {
  const orbit = article.dataset.orbit ? (JSON.parse(article.dataset.orbit) as Required<Orbit>) : null;
  const pass = article.querySelector<HTMLElement>("[data-pass]");
  const reentry = article.querySelector<HTMLElement>("[data-reentry]");
  const height = article.querySelector<HTMLElement>("[data-height]");
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
    if (height) height.textContent = `${km(Math.max(0, heightKm(radiusAt(orbit, time))))}, ${falling(fallRate(orbit, time))}`;
  };
  tick();
  const timer = setInterval(tick, 250);
  return () => clearInterval(timer);
}
