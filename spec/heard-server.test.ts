import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { DECAY, bandAt, burnAt, periodAt } from "../src/lib/orbit.ts";
import { OVERHEAD_HALF_WIDTH, STATIONS } from "../src/lib/stations.ts";
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
    // a whole lap: over all three stations
    const lap = Math.round(periodAt(1.3)) + 10_000;
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

  it("is heard only from when it's launched", async () => {
    const { heard, put, ears } = await freshServer();
    // launched 5 s in, already in the window: it hasn't come into it
    const sat = put("alice", { phase: CANBERRA.angle, epoch: T + 5_000 });
    expect(heard.listen(T, T + 10_000, ears("bob")).filter((p) => p.object === sat.id)).toEqual([]);
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

  it("knows a signed-in operator as the same listener on any device, and never keeps a cookie", async () => {
    const { heard } = await freshServer();
    expect(heard.listenerKey({ person: "phone", operator: 7 })).toBe(heard.listenerKey({ person: "laptop", operator: 7 }));
    expect(heard.listenerKey({ person: "a-cookie-value", operator: null })).not.toContain("a-cookie-value");
  });
});
