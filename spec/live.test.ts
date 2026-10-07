import { describe, expect, inject, it } from "vitest";
import { Session, callsign, events } from "./session.ts";

// ADR 0004: one SSE stream per page. It opens with the server's clock and a
// snapshot of the live sky; after that, events (launches, in C8) reach every
// open session within about a second. Positions are never sent: each client
// draws them from the orbit elements and the server's time.
const baseUrl = inject("baseUrl");

interface SkyObject {
  id: number;
  callsign: string;
  beacon: string;
  band: string;
  radius: number;
  phase: number;
  period: number;
  epoch: number;
  mine: boolean;
}
interface Hello {
  serverTime: number;
  sky: SkyObject[];
}

async function open(session: Session) {
  const res = await fetch(session.url("/api/events"), { headers: session.headers() });
  session.keep(res);
  expect(res.headers.get("content-type")).toMatch(/^text\/event-stream/);
  return events(res);
}

describe("the event stream", () => {
  it("opens with the server's time and the live sky, marking only your own satellite", async () => {
    const a = new Session(baseUrl);
    const name = callsign();
    await a.launch({ band: "low", callsign: name, beacon: "snapshot" });

    const before = Date.now();
    const streamA = await open(a);
    const helloA = await streamA.next().finally(() => streamA.close());
    expect(helloA.event).toBe("hello");
    const { serverTime, sky } = helloA.data as Hello;
    expect(Math.abs(serverTime - before)).toBeLessThan(5000);

    const mine = sky.find((o) => o.callsign === name);
    expect(mine, "the snapshot is missing a live satellite").toBeDefined();
    expect(mine).toMatchObject({ band: "low", beacon: "snapshot", mine: true });
    for (const key of ["radius", "phase", "period", "epoch"] as const) {
      expect(mine![key]).toEqual(expect.any(Number));
    }
    expect(Object.keys(mine!)).not.toContain("owner");

    // and what the stations have heard, and how many are listening, this
    // stream included (ADR 0016)
    const { heard, heardBy, listening } = helloA.data as { heard: unknown[]; heardBy: Record<string, number>; listening: number };
    expect(Array.isArray(heard)).toBe(true);
    expect(heardBy).not.toBeNull();
    expect(typeof heardBy).toBe("object");
    expect(listening).toBeGreaterThanOrEqual(1);

    // another person sees the same orbit, not marked as theirs
    const streamB = await open(new Session(baseUrl));
    const helloB = (await streamB.next().finally(() => streamB.close())).data as Hello;
    const theirs = helloB.sky.find((o) => o.callsign === name);
    expect(theirs).toEqual({ ...mine, mine: false });
  });

  it("brings a launch to another open session within about a second", async () => {
    const stream = await open(new Session(baseUrl));
    try {
      expect((await stream.next()).event).toBe("hello");

      const name = callsign();
      const res = await new Session(baseUrl).launch({ band: "mid", callsign: name, beacon: "live" });
      expect(res.status).toBe(303);
      const sent = Date.now();

      for (;;) {
        const { event, data } = await stream.next(1000);
        if (event === "launch" && (data as SkyObject).callsign === name) {
          expect(data).toMatchObject({ band: "mid", beacon: "live", mine: false });
          break;
        }
      }
      expect(Date.now() - sent).toBeLessThan(1000);
    } finally {
      stream.close();
    }
  });
});
