import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DECAY, reentryAt } from "../src/lib/orbit.ts";

// The server's side of decay (ADR 0007): whatever has burned up leaves the
// sky, dated to the moment it burned up, everyone watching is told, and its
// owner can launch again once the cooldown from that moment has passed. The
// HTTP spec can't wait a day for a satellite to fall, so this drives the
// server's own code against a throwaway database, with the clock passed in.

// no derelicts, and launches placed by a seeded generator, so nothing here
// collides (collisions have their own tests)
process.env.DERELICTS = "0";
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
const launch = (person: string, values: typeof input, now: number) => sky.launch(person, values, now, random);

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

  it("lets the owner launch again once the cooldown from the burn-up has passed", () => {
    const first = launch("dana", { ...input, callsign: "FIRST" }, 3_000_000);
    if (!first.ok) throw new Error(JSON.stringify(first.errors));
    const gone = reentryAt(first.object);
    // still up: one live satellite each
    expect(launch("dana", { ...input, callsign: "EARLY" }, gone - DECAY.plungeMs).ok).toBe(false);
    // burned up, but the pad hasn't reopened
    const cooling = launch("dana", { ...input, callsign: "COOLING" }, gone + 60_000);
    expect(cooling.ok).toBe(false);
    if (!cooling.ok) expect(cooling.errors.form).toMatch(/reopens/);
    expect(launch("dana", { ...input, callsign: "AGAIN" }, gone + sky.RELAUNCH_COOLDOWN + 1).ok).toBe(true);
  });
});
