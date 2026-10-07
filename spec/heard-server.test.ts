import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { DECAY, bandAt, burnAt, periodAt } from "../src/lib/orbit.ts";
import { OVERHEAD_HALF_WIDTH, STATIONS, stationOver } from "../src/lib/stations.ts";
import { onAir } from "../src/lib/airtime.ts";
import type { SkyEvent } from "../src/lib/events.ts";

// Being heard (ADR 0016): a beacon passing over a ground station while
// people are listening is a transmission, and everyone listening who isn't
// its owner has heard it, once each, however many passes. A pass with
// nobody listening isn't heard. Driven against throwaway databases with the
// clock passed in, as the collision tests are.

process.env.DERELICTS = "0";

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const HOUR = 3_600_000;
// in the future, so the server's own wake-up timers never fire mid-test
const T = Date.now() + 10 * 24 * HOUR;
const CANBERRA = STATIONS[0];
// just short of Canberra's window, going round the usual way: in it within
// a couple of seconds
const NEAR_CANBERRA = CANBERRA.angle - OVERHEAD_HALF_WIDTH - 0.05;

async function freshServer() {
  const dir = mkdtempSync(join(tmpdir(), "kessler-heard-"));
  dirs.push(dir);
  process.env.DATABASE_PATH = join(dir, "app.db");
  execFileSync(process.execPath, ["scripts/migrate.mjs"], { env: process.env });
  vi.resetModules();
  const sky = await import("../src/lib/sky.ts");
  const heard = await import("../src/lib/heard.ts");
  const events = await import("../src/lib/events.ts");
  const { db, schema } = await import("../src/db/index.ts");
  const told: SkyEvent[] = [];
  events.subscribe((event) => told.push(event));
  // an object on a chosen orbit, as if launched (a launch's orbit is random)
  const put = (
    owner: string | null,
    { radius = 1.3, phase = NEAR_CANBERRA, kind = "satellite" as "satellite" | "derelict", epoch = T, beacon = `${owner} says hello` } = {},
  ) =>
    db
      .insert(schema.objects)
      .values({
        kind,
        owner,
        callsign: kind === "satellite" ? `SAT-${owner}` : null,
        beacon: kind === "satellite" ? beacon : null,
        band: bandAt(radius),
        launchedAt: epoch,
        radius,
        phase,
        period: Math.round(periodAt(radius)),
        epoch,
        direction: 1,
      })
      .returning()
      .get();
  const key = (person: string) => heard.listenerKey({ person, operator: null });
  const ears = (...people: string[]) => new Set(people.map(key));
  return { sky, heard, told, db, schema, put, key, ears };
}

describe("a beacon passing over a station", () => {
  it("is heard by everyone listening, and logged", async () => {
    const { heard, told, put, ears } = await freshServer();
    const sat = put("alice");
    const passes = heard.listen(T, T + 10_000, ears("bob", "carol"));
    expect(passes).toHaveLength(1);
    expect(passes[0]).toMatchObject({ object: sat.id, station: "canberra", listeners: 2 });
    expect(passes[0].at).toBeGreaterThan(T);
    expect(passes[0].at).toBeLessThan(T + 10_000);
    expect(heard.heardBy(sat.id)).toBe(2);
    const event = told.find((e) => e.type === "heard");
    expect(event).toMatchObject({ type: "heard", heard: { id: sat.id, station: "Canberra", heardBy: 2, passes: 1 } });
  });

  it("doesn't count its owner", async () => {
    const { heard, put, ears } = await freshServer();
    const sat = put("alice");
    const [pass] = heard.listen(T, T + 10_000, ears("alice", "bob"));
    expect(pass.listeners).toBe(1);
    expect(heard.heardBy(sat.id)).toBe(1);
  });

  it("is logged, heard by nobody yet, when only its owner is listening", async () => {
    const { heard, put, ears } = await freshServer();
    const sat = put("alice");
    const [pass] = heard.listen(T, T + 10_000, ears("alice"));
    expect(pass).toMatchObject({ object: sat.id, listeners: 0 });
    expect(heard.heardBy(sat.id)).toBe(0);
  });

  it("counts each person once, however many passes they hear", async () => {
    const { heard, put, ears } = await freshServer();
    const sat = put("alice");
    // nearly a whole lap: over each of the three stations once
    const lap = Math.round(periodAt(1.3)) - 5_000;
    const passes = heard.listen(T, T + lap, ears("bob", "carol"));
    expect(passes.map((p) => p.station).sort()).toEqual(["canberra", "goldstone", "madrid"]);
    heard.listen(T + lap, T + 2 * lap, ears("bob", "dan"));
    expect(heard.heardBy(sat.id)).toBe(3);
    expect(heard.recentlyHeard(10, undefined, T + 2 * lap)[0]).toMatchObject({ id: sat.id, heardBy: 3, passes: 6 });
  });

  it("isn't heard when nobody is listening, and nothing is logged", async () => {
    const { heard, put, ears } = await freshServer();
    const sat = put("alice");
    expect(heard.listen(T, T + 10_000, ears())).toEqual([]);
    expect(heard.heardBy(sat.id)).toBe(0);
    expect(heard.recentlyHeard(10, undefined, T + 10_000)).toEqual([]);
  });

  it("is heard only once it's up", async () => {
    const { heard, put, ears } = await freshServer();
    // launched 5 s in, straight into Canberra's window
    const sat = put("alice", { phase: CANBERRA.angle, epoch: T + 5_000 });
    expect(heard.listen(T, T + 4_000, ears("bob"))).toEqual([]);
    const [pass] = heard.listen(T + 4_000, T + 10_000, ears("bob"));
    expect(pass).toMatchObject({ object: sat.id, station: "canberra" });
    expect(pass.at).toBeGreaterThanOrEqual(T + 5_000);
  });

  // the review, 2026-10-07: heard means on air, not merely overhead
  it("is heard only when it gets a turn on air, and once a pass", async () => {
    const { sky, heard, put, ears } = await freshServer();
    // five long lines over Canberra at once: ten seconds a turn, in a
    // window about thirteen seconds long, so not all of them get one
    const long = "a line long enough to need a whole turn to itself, near the limit of what a beacon can say, and then a bit more".padEnd(140, ".");
    const sats = ["a", "b", "c", "d", "e"].map((who) => put(who, { phase: NEAR_CANBERRA + 0.0001 * who.charCodeAt(0), beacon: long }));
    const window = 60_000;
    const passes = heard.listen(T, T + window, ears("zed"));
    const ids = passes.map((p) => p.object);
    // never the same satellite twice over one station in one pass
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeLessThan(sats.length);
    // and each was on air when it was heard, by the rule every screen plays
    for (const pass of passes) {
      const here = sky
        .liveSky(pass.at)
        .filter((o) => stationOver(o, pass.at)?.id === pass.station && o.beacon)
        .map((o) => ({ id: o.id, text: o.beacon!, static: false }));
      expect(onAir(here, pass.at)?.speaker.id).toBe(pass.object);
    }
  });

  it("shares one turn between all the static overhead", async () => {
    const { heard, db, schema, put, ears } = await freshServer();
    const sat = put("alice");
    const pieces = [1, 2, 3, 4].map((n) => put(null, { kind: "derelict", phase: NEAR_CANBERRA + n * 0.0001 }));
    for (const piece of pieces) {
      db.update(schema.objects).set({ kind: "debris", words: `piece ${piece.id} … of two lines` }).where(eq(schema.objects.id, piece.id)).run();
    }
    const passes = heard.listen(T, T + 20_000, ears("bob"));
    // the beacon gets through
    expect(passes.map((p) => p.object)).toContain(sat.id);
  });

  it("is never heard from a satellite that burns up first", async () => {
    const { heard, put, ears } = await freshServer();
    // low enough to be in its last plunge: it never reaches the window
    const sat = put("alice", { radius: DECAY.burnRadius + 0.0005, phase: NEAR_CANBERRA - 1.5 });
    expect(burnAt({ ...sat, direction: 1 })).toBeLessThan(T + 60_000);
    expect(heard.listen(T, T + 60_000, ears("bob")).filter((p) => p.object === sat.id)).toEqual([]);
  });

  it("is silent from a derelict", async () => {
    const { heard, put, ears } = await freshServer();
    put(null, { kind: "derelict" });
    expect(heard.listen(T, T + 10_000, ears("bob"))).toEqual([]);
  });

  // ADR 0017: a fragment carrying words is heard, as static
  it("is static from a fragment that carries words, and silence from one that doesn't", async () => {
    const { heard, db, schema, put, ears } = await freshServer();
    const talking = put(null, { kind: "derelict" });
    const silent = put(null, { kind: "derelict", phase: NEAR_CANBERRA + 0.01 });
    db.update(schema.objects).set({ kind: "debris", words: "the sea … more than I" }).where(eq(schema.objects.id, talking.id)).run();
    db.update(schema.objects).set({ kind: "debris" }).where(eq(schema.objects.id, silent.id)).run();
    const passes = heard.listen(T, T + 10_000, ears("bob"));
    expect(passes.map((p) => p.object)).toEqual([talking.id]);
    expect(heard.recentlyHeard(10, undefined, T + 10_000)[0]).toMatchObject({ id: talking.id, kind: "debris", words: "the sea … more than I", beacon: null });
  });
});

describe("a heard event, on each stream", () => {
  it("says whether it's the viewer's, and never whose it is", async () => {
    const { heard, told, put, ears } = await freshServer();
    const { forViewer } = await import("../src/lib/stream.ts");
    put("alice");
    heard.listen(T, T + 10_000, ears("bob"));
    const event = told.find((e) => e.type === "heard")!;
    const forAlice = forViewer(event, { person: "alice", operator: null }) as Record<string, unknown>;
    const forBob = forViewer(event, { person: "bob", operator: null }) as Record<string, unknown>;
    expect(forAlice.mine).toBe(true);
    expect(forBob.mine).toBe(false);
    for (const seen of [forAlice, forBob]) {
      expect(seen).not.toHaveProperty("owner");
      expect(seen).not.toHaveProperty("operator");
      expect(JSON.stringify(seen)).not.toContain('"alice"');
      expect(seen).toMatchObject({ station: "Canberra", heardBy: 1, passes: 1, beacon: "alice says hello" });
    }
  });
});

describe("what was heard", () => {
  it("is each beacon once, the latest pass first, with who launched it and its line", async () => {
    const { heard, put, ears } = await freshServer();
    // one a little behind the other: it comes over Canberra second
    const behind = put("alice", { phase: NEAR_CANBERRA - 0.02 });
    const ahead = put("bob", { phase: NEAR_CANBERRA + 0.01 });
    heard.listen(T, T + 10_000, ears("carol"));
    const feed = heard.recentlyHeard(10, undefined, T + 10_000);
    expect(feed.map((f) => f.id)).toEqual([behind.id, ahead.id]);
    expect(feed[0]).toMatchObject({ callsign: "SAT-alice", beacon: "alice says hello", station: "Canberra", heardBy: 1, passes: 1, handle: null, mine: false });
    expect(feed[1]).toMatchObject({ beacon: "bob says hello" });
  });

  it("marks your own, never saying whose the others are", async () => {
    const { heard, put, ears } = await freshServer();
    const sat = put("alice");
    heard.listen(T, T + 10_000, ears("bob"));
    const [mine] = heard.recentlyHeard(10, "alice", T + 10_000);
    expect(mine).toMatchObject({ id: sat.id, mine: true });
    expect(JSON.stringify(heard.recentlyHeard(10, "bob", T + 10_000))).not.toContain('"alice"');
  });
});

// the review, 2026-10-07: a wreck's static is one card, not one a fragment
describe("a wreck's static in the feed", () => {
  it("is one card for all its fragments, counting their passes and what's still up", async () => {
    const { heard, db, schema, put, ears } = await freshServer();
    const pieces = [0, 1, 2].map((n) => put(null, { kind: "derelict", phase: NEAR_CANBERRA - n * 0.6 }));
    for (const piece of pieces) {
      db.update(schema.objects).set({ kind: "debris", sourceCollision: 77, words: `piece ${piece.id} … of two lines` }).where(eq(schema.objects.id, piece.id)).run();
    }
    // a lap: each piece comes over each station
    const lap = Math.round(periodAt(1.3)) - 5_000;
    const passes = heard.listen(T, T + lap, ears("bob", "carol"));
    expect(passes.length).toBeGreaterThan(3);
    const feed = heard.recentlyHeard(10, undefined, T + lap);
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({ key: "c:77", kind: "debris", pieces: 3, up: 3, passes: passes.length, heardBy: 2 });
  });

  it("keeps a satellite's card its own", async () => {
    const { heard, put, ears } = await freshServer();
    const sat = put("alice");
    heard.listen(T, T + 10_000, ears("bob"));
    expect(heard.recentlyHeard(10, undefined, T + 10_000)[0]).toMatchObject({ key: `o:${sat.id}`, pieces: null });
  });
});

describe("a history", () => {
  it("withholds a flying satellite's beacon from strangers until it's been heard", async () => {
    const { sky, heard, put, ears } = await freshServer();
    const sat = put("alice");
    const before = sky.historyOf(sat.id, "bob", T);
    expect(before?.beacon).toBeNull();
    expect(before?.withheld).toBe(true);
    heard.listen(T, T + 10_000, ears("carol"));
    const after = sky.historyOf(sat.id, "bob", T + 10_000);
    expect(after?.beacon).toBe("alice says hello");
    expect(after?.heard).toEqual({ by: 1, passes: 1 });
  });
});

describe("listening", () => {
  it("counts people, not their tabs", async () => {
    const { heard } = await freshServer();
    const events = await import("../src/lib/events.ts");
    const bob = heard.listenerKey({ person: "bob", operator: null });
    const offs = [events.subscribe(() => {}, bob), events.subscribe(() => {}, bob), events.subscribe(() => {}, heard.listenerKey({ person: "carol", operator: null }))];
    expect(events.audience().size).toBe(2);
    for (const off of offs) off();
    expect(events.audience().size).toBe(0);
  });

  it("doesn't count a stream whose cookie was made just for it", async () => {
    const { heard } = await freshServer();
    expect(heard.listenerFor({ person: "fresh", newPerson: true, operator: null })).toBeNull();
    expect(heard.listenerFor({ person: "kept", newPerson: false, operator: null })).toBe(heard.listenerKey({ person: "kept", operator: null }));
  });

  it("tells everyone how many are listening once it settles, and recounts a stream that broke", async () => {
    vi.useFakeTimers();
    try {
      const { told } = await freshServer();
      const events = await import("../src/lib/events.ts");
      events.subscribe(() => {}, "p:one");
      events.subscribe(() => {
        throw new Error("gone");
      }, "p:two");
      await vi.advanceTimersByTimeAsync(2_000);
      const counts = () => told.flatMap((e) => (e.type === "audience" ? [e.listening] : []));
      expect(counts().at(-1)).toBe(2);
      // the broken one is dropped the next time anything is told
      events.publish({ type: "audience", listening: 0 });
      await vi.advanceTimersByTimeAsync(2_000);
      expect(counts().at(-1)).toBe(1);
      expect(events.audience().size).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("listens every second by itself, once started", async () => {
    vi.useFakeTimers({ now: T });
    try {
      const { heard, put, key } = await freshServer();
      const events = await import("../src/lib/events.ts");
      const sat = put("alice");
      const off = events.subscribe(() => {}, key("bob"));
      heard.startListening();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(heard.heardBy(sat.id)).toBe(1);
      off();
    } finally {
      vi.useRealTimers();
    }
  });

  it("knows a signed-in operator as the same listener on any device, and never keeps a cookie", async () => {
    const { heard } = await freshServer();
    expect(heard.listenerKey({ person: "phone", operator: 7 })).toBe(heard.listenerKey({ person: "laptop", operator: 7 }));
    expect(heard.listenerKey({ person: "a-cookie-value", operator: null })).not.toContain("a-cookie-value");
  });
});
