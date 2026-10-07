import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { reentryAt } from "../src/lib/orbit.ts";

// The server's side of decay (ADR 0007): whatever has burned up leaves the
// sky, dated to the moment it burned up, and everyone watching is told. And
// launching: a person can have several satellites up, a short gap apart. The
// HTTP spec can't wait a day for a satellite to fall, so this drives the
// server's own code against a throwaway database, with the clock passed in.

// no derelicts, and launches placed by a seeded generator, so nothing here
// collides (collisions have their own tests)
process.env.DERELICTS = "0";
// nor the resident operators' launches (ADR 0015), which have their own tests
process.env.RESIDENTS = "0";
let seed = 7;
const random = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const dir = mkdtempSync(join(tmpdir(), "kessler-decay-"));
process.env.DATABASE_PATH = join(dir, "app.db");
execFileSync(process.execPath, ["scripts/migrate.mjs"], { env: process.env });

type Sky = typeof import("../src/lib/sky.ts");
type Events = typeof import("../src/lib/events.ts");
let sky: Sky;
let events: Events;
const heard: { type: string; id: number }[] = [];

beforeAll(async () => {
  sky = await import("../src/lib/sky.ts");
  events = await import("../src/lib/events.ts");
  events.subscribe((event) => {
    if (event.type === "launch" || event.type === "decay") heard.push({ type: event.type, id: event.object.id });
  });
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const DAY = 86_400_000;
const input = { band: "low" as const, callsign: "FALLER", beacon: "going down" };
const launch = (who: Parameters<Sky["launch"]>[0], values: typeof input, now: number) => sky.launch(who, values, now, random);

describe("burning up, on the server", () => {
  it("takes a burned-up satellite out of the sky, dated to its burn-up, and says so", () => {
    const launched = 1_000_000;
    const result = launch("alice", input, launched);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    const gone = reentryAt(result.object);
    expect(gone - launched).toBeLessThan(3 * DAY);

    expect(sky.settleDecay(gone - 1)).toHaveLength(0);
    const settled = sky.settleDecay(gone + 1);
    expect(settled.map((o) => o.id)).toEqual([result.object.id]);
    expect(heard).toContainEqual({ type: "decay", id: result.object.id });

    const row = sky.catalogue("all", "alice").find((o) => o.id === result.object.id)!;
    expect(row.fate).toBe("decayed");
    expect(row.fateAt).toBe(Math.round(gone));
  });

  it("does it once, however often it's asked", () => {
    const before = heard.length;
    expect(sky.settleDecay(10 * 365 * DAY)).toHaveLength(0);
    expect(heard.length).toBe(before);
  });

  it("catches up on a satellite that burned up while nobody asked", () => {
    const result = launch("bob", { ...input, callsign: "SLEEPER" }, 2_000_000);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    // a launch long after: the first read settles the old one first
    const later = reentryAt(result.object) + DAY;
    expect(launch("carol", { ...input, callsign: "WAKER" }, later).ok).toBe(true);
    const row = sky.catalogue("all", "bob").find((o) => o.id === result.object.id)!;
    expect(row.fate).toBe("decayed");
    expect(row.fateAt).toBe(Math.round(reentryAt(result.object)));
  });

  it("lets a person have several up at once, a short gap apart", () => {
    const start = 3_000_000;
    expect(launch("dana", { ...input, callsign: "FIRST" }, start).ok).toBe(true);
    // too soon after the last launch
    const early = launch("dana", { ...input, callsign: "EARLY" }, start + sky.LAUNCH_GAP - 1_000);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.errors.form).toMatch(/launch again in 1 s/);
    // the gap has passed: a second one goes up while the first is still up
    expect(launch("dana", { ...input, callsign: "SECOND" }, start + sky.LAUNCH_GAP).ok).toBe(true);
    const up = sky.liveSky(start + sky.LAUNCH_GAP).filter((o) => o.owner === "dana");
    expect(up.map((o) => o.callsign)).toEqual(["FIRST", "SECOND"]);
    // someone else isn't held up by dana's gap
    expect(launch("erin", { ...input, callsign: "OTHER" }, start + sky.LAUNCH_GAP).ok).toBe(true);
  });

  it("knows a person's first launch ever, even once it's gone", () => {
    const start = 9_000_000;
    const first = launch("fern", { ...input, band: "low", callsign: "FERN1" }, start);
    if (!first.ok) throw new Error("first launch refused");
    expect(sky.isFirstLaunch("fern", first.object.id)).toBe(true);
    // not someone else's first
    expect(sky.isFirstLaunch("gil", first.object.id)).toBe(false);
    // the first has burned up by the time of the second, which still isn't the first
    const later = Math.ceil(reentryAt(first.object)) + 1_000;
    const second = launch("fern", { ...input, callsign: "FERN2" }, later);
    if (!second.ok) throw new Error("second launch refused");
    expect(sky.liveSky(later).some((o) => o.id === first.object.id)).toBe(false);
    expect(sky.isFirstLaunch("fern", second.object.id)).toBe(false);
  });

  it("knows an operator's first launch on any device they're signed in on", () => {
    const start = 20_000_000;
    const laptop = { person: "hana-laptop", operator: 4242 };
    const first = launch(laptop, { ...input, callsign: "HANA1" }, start);
    if (!first.ok) throw new Error("first launch refused");
    expect(sky.isFirstLaunch({ person: "hana-phone", operator: 4242 }, first.object.id)).toBe(true);
    expect(sky.isFirstLaunch({ person: "hana-phone", operator: 4343 }, first.object.id)).toBe(false);
    const second = launch({ person: "hana-phone", operator: 4242 }, { ...input, callsign: "HANA2" }, start + sky.LAUNCH_GAP);
    if (!second.ok) throw new Error("second launch refused");
    expect(sky.isFirstLaunch(laptop, second.object.id)).toBe(false);
  });
});
