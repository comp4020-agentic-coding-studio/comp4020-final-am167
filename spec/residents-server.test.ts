import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { HOUR, RESIDENTS, slotsBetween } from "../src/lib/residents.ts";

// The server's side of the resident operators (ADR 0015): the sky launches
// each one when it's due, as a satellite like anyone's, under a handle nobody
// can sign in as; a server that was stopped launches what it missed (up to a
// few hours back), at the times they were due; and the residents never crowd
// out the sky. Driven against throwaway databases with the clock passed in,
// like collision-server.test.ts.

process.env.DERELICTS = "0";

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

async function freshServer(env: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "kessler-residents-"));
  dirs.push(dir);
  process.env.DATABASE_PATH = join(dir, "app.db");
  process.env.RESIDENTS = env.RESIDENTS ?? "3";
  process.env.RESIDENT_CAP = env.RESIDENT_CAP ?? "100";
  execFileSync(process.execPath, ["scripts/migrate.mjs"], { env: process.env });
  vi.resetModules();
  const sky = await import("../src/lib/sky.ts");
  const operators = await import("../src/lib/operators.ts");
  return { sky, operators };
}

// in the future, so the server's own wake-up timers never fire mid-test
const T = Math.floor((Date.now() + 10 * 24 * HOUR) / HOUR) * HOUR + 20 * 60_000;
const residents = new Set(RESIDENTS.map((r) => r.handle));
// the residents' satellites, oldest first
const residentRows = <T extends { kind: string; handle: string | null; launchedAt: number }>(rows: T[]) =>
  rows
    .filter((o) => o.kind === "satellite" && o.handle !== null && residents.has(o.handle))
    .sort((a, b) => a.launchedAt - b.launchedAt);

describe("the resident operators, on the server", async () => {
  const { sky, operators } = await freshServer();
  sky.settle(T);
  const due = slotsBetween(T - sky.RESIDENT_BACKFILL, T, 3);

  it("launches what was due in the last few hours, when it was due, and nothing older", () => {
    const launched = residentRows(sky.catalogue("all", undefined));
    expect(due.length).toBeGreaterThan(0);
    expect(launched.map((o) => [o.launchedAt, o.handle, o.callsign, o.band])).toEqual(
      due.map((s) => [s.at, s.handle, s.callsign, s.band]),
    );
    expect(launched.every((o) => o.launchedAt > T - sky.RESIDENT_BACKFILL)).toBe(true);
  });

  it("launches each one as it comes due, once, however often the sky is read", () => {
    const next = slotsBetween(T, T + 2 * HOUR, 3);
    expect(next.length).toBeGreaterThan(0);
    for (let t = T; t <= T + 2 * HOUR; t += 60_000) sky.settle(t);
    sky.settle(T + 2 * HOUR);
    const launched = residentRows(sky.catalogue("all", undefined));
    expect(launched.map((o) => o.launchedAt)).toEqual([...due, ...next].map((s) => s.at));
  });

  it("names the resident in the satellite's record, and knows it's a resident", () => {
    const [first] = residentRows(sky.catalogue("all", undefined));
    const history = sky.historyOf(first.id, undefined, T + 2 * HOUR)!;
    expect(history.handle).toBe(first.handle);
    expect(history.resident).toBe(true);
  });

  it("keeps their handles: nobody can claim one, or sign in as one", async () => {
    const handle = RESIDENTS[0].handle;
    const claimed = await operators.claim(
      "someone",
      { action: "claim", handle: handle.toUpperCase(), passphrase: "a long passphrase" },
      "127.0.0.1",
    );
    expect(claimed).toMatchObject({ ok: false, errors: { handle: expect.stringMatching(/taken/) } });
    for (const passphrase of ["", "a long passphrase"]) {
      const signedIn = await operators.signIn("someone", { action: "sign-in", handle, passphrase }, "127.0.0.1");
      expect(signedIn).toMatchObject({ ok: false });
    }
  });

  it("tells a person's launch apart: it isn't a resident's", () => {
    const result = sky.launch("a person", { band: "low", callsign: "MINE", beacon: "hello" }, T + 2 * HOUR);
    if (!result.ok) throw new Error("launch refused");
    expect(sky.historyOf(result.object.id, "a person", T + 2 * HOUR)!.resident).toBe(false);
  });
});

describe("a server stopped for a while", () => {
  const end = T + 3 * HOUR;
  async function run(step: number | null) {
    const { sky } = await freshServer();
    if (step === null) {
      sky.settle(T);
      sky.settle(end);
    } else for (let t = T; t <= end; t += step) sky.settle(t);
    sky.settle(end);
    return sky
      .catalogue("all", undefined)
      .map(({ kind, launchedAt, callsign, radius, phase, direction, fate, fateAt, handle }) => ({
        kind,
        launchedAt,
        callsign,
        radius,
        phase,
        direction,
        fate,
        fateAt,
        handle,
      }))
      .sort((a, b) => a.launchedAt - b.launchedAt || a.radius - b.radius);
  }

  it("ends with the same sky as one that ran through it", async () => {
    expect(await run(null)).toEqual(await run(30_000));
  });
});

describe("the residents' share of the sky", () => {
  it("is capped: never more than RESIDENT_CAP of theirs up at once", async () => {
    const { sky } = await freshServer({ RESIDENT_CAP: "2" });
    // long enough for theirs to come down and others to go up
    for (let t = T; t <= T + 48 * HOUR; t += 15 * 60_000) {
      sky.settle(t);
      const up = residentRows(sky.catalogue("live", undefined));
      expect(up.length).toBeLessThanOrEqual(2);
    }
    expect(residentRows(sky.catalogue("all", undefined)).length).toBeGreaterThan(2);
  });

  it("is nothing when they're turned off", async () => {
    const { sky } = await freshServer({ RESIDENTS: "0" });
    sky.settle(T);
    sky.settle(T + 6 * HOUR);
    expect(residentRows(sky.catalogue("all", undefined))).toEqual([]);
  });
});
