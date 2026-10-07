import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { SkyEvent } from "../src/lib/events.ts";
import { reentryAt } from "../src/lib/orbit.ts";
import { HOUR, RESIDENTS, slotsBetween } from "../src/lib/residents.ts";

// The server's side of the resident operators (ADR 0015): the sky launches
// each one when it's due, as a satellite like anyone's, under a handle nobody
// can sign in as; a server that was stopped launches what it missed (up to a
// few hours back), at the times they were due, and never twice; and the
// residents never crowd out the sky. Driven against throwaway databases with
// the clock passed in, like collision-server.test.ts.

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const newDatabase = () => {
  const dir = mkdtempSync(join(tmpdir(), "kessler-residents-"));
  dirs.push(dir);
  return join(dir, "app.db");
};

// A server, on a database of its own or (a restart) one given, with
// derelicts off and the residents uncapped unless asked.
async function server(env: Record<string, string> = {}, database = newDatabase()) {
  process.env.DATABASE_PATH = database;
  process.env.DERELICTS = env.DERELICTS ?? "0";
  process.env.RESIDENTS_PER_HOUR = env.RESIDENTS_PER_HOUR ?? "3";
  process.env.RESIDENT_CAP = env.RESIDENT_CAP ?? "100";
  process.env.SKY_CAP = env.SKY_CAP ?? "200";
  execFileSync(process.execPath, ["scripts/migrate.mjs"], { env: process.env });
  vi.resetModules();
  const sky = await import("../src/lib/sky.ts");
  const operators = await import("../src/lib/operators.ts");
  const events = await import("../src/lib/events.ts");
  const heard: SkyEvent[] = [];
  events.subscribe((event) => heard.push(event));
  return { sky, operators, heard, database };
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
  const { sky, operators, heard } = await server();
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

  it("doesn't announce the ones it caught up on: a page opening then gets them in its snapshot", () => {
    const told = heard.flatMap((e) => (e.type === "launch" ? [e.object.launchedAt] : []));
    expect(told.every((at) => T - at <= 60_000)).toBe(true);
  });

  it("launches each one as it comes due, once, however often the sky is read, and announces it", () => {
    const next = slotsBetween(T, T + 2 * HOUR, 3);
    expect(next.length).toBeGreaterThan(0);
    for (let t = T; t <= T + 2 * HOUR; t += 60_000) sky.settle(t);
    sky.settle(T + 2 * HOUR);
    const launched = residentRows(sky.catalogue("all", undefined));
    expect(launched.map((o) => o.launchedAt)).toEqual([...due, ...next].map((s) => s.at));
    const told = heard.flatMap((e) => (e.type === "launch" ? [e.object.launchedAt] : []));
    for (const slot of next) expect(told).toContain(slot.at);
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
  const record = (sky: Awaited<ReturnType<typeof server>>["sky"]) =>
    sky
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

  it("ends with the same sky as one that ran through it", async () => {
    const stopped = await server();
    stopped.sky.settle(T);
    stopped.sky.settle(end);
    const running = await server();
    for (let t = T; t <= end; t += 30_000) running.sky.settle(t);
    running.sky.settle(end);
    expect(record(stopped.sky)).toEqual(record(running.sky));
  });

  it("launches nothing twice when it starts again, even with a schedule changed by a redeploy", async () => {
    const first = await server();
    first.sky.settle(T);
    const before = residentRows(first.sky.catalogue("all", undefined)).map((o) => o.launchedAt);
    const again = await server({}, first.database);
    again.sky.settle(T);
    expect(residentRows(again.sky.catalogue("all", undefined)).map((o) => o.launchedAt)).toEqual(before);

    // twice the launches an hour, and so different times
    const changed = await server({ RESIDENTS_PER_HOUR: "6" }, first.database);
    changed.sky.settle(T);
    const hours = new Set<string>();
    for (const o of residentRows(changed.sky.catalogue("all", undefined))) {
      const key = `${o.handle}:${Math.floor(o.launchedAt / HOUR)}`;
      expect(hours.has(key), key).toBe(false);
      hours.add(key);
    }
  });
});

describe("a resident's handle a person claimed first", () => {
  it("stays theirs, and that resident never launches", async () => {
    const { sky, operators } = await server({ RESIDENTS_PER_HOUR: "12" });
    const handle = RESIDENTS[0].handle;
    const claimed = await operators.claim(
      "early bird",
      { action: "claim", handle, passphrase: "a long passphrase" },
      "127.0.0.1",
    );
    expect(claimed).toMatchObject({ ok: true });
    sky.settle(T);
    const launched = residentRows(sky.catalogue("all", undefined));
    expect(launched.length).toBeGreaterThan(0);
    expect(launched.some((o) => o.handle === handle)).toBe(false);
    const again = await operators.signIn(
      "elsewhere",
      { action: "sign-in", handle, passphrase: "a long passphrase" },
      "127.0.0.1",
    );
    expect(again).toMatchObject({ ok: true });
  });
});

describe("the residents' share of the sky", () => {
  it("is capped: never more than RESIDENT_CAP of theirs up at once", async () => {
    const { sky } = await server({ RESIDENT_CAP: "2" });
    // long enough for theirs to come down and others to go up
    for (let t = T; t <= T + 48 * HOUR; t += 15 * 60_000) {
      sky.settle(t);
      expect(residentRows(sky.catalogue("live", undefined)).length).toBeLessThanOrEqual(2);
    }
    expect(residentRows(sky.catalogue("all", undefined)).length).toBeGreaterThan(2);
  });

  it("stops while the sky is half full, people's satellites included", async () => {
    const { sky } = await server({ SKY_CAP: "6" });
    for (const name of ["ONE", "TWO"]) {
      const result = sky.launch(`person ${name}`, { band: "high", callsign: name, beacon: "hello" }, T - 7 * HOUR);
      expect(result.ok).toBe(true);
    }
    for (let t = T; t <= T + 12 * HOUR; t += 15 * 60_000) sky.settle(t);
    const rows = sky.catalogue("all", undefined).filter((o) => o.kind === "satellite");
    const upAt = (t: number) =>
      rows.filter((o) => o.launchedAt < t && (o.fate === "live" ? reentryAt(o) : o.fateAt!) > t).length;
    const theirs = residentRows(rows);
    expect(theirs.length).toBeGreaterThan(0);
    // each went up while fewer than half of SKY_CAP were
    for (const o of theirs) expect(upAt(o.launchedAt), o.callsign!).toBeLessThan(3);
  });

  it("leaves room for a few derelicts, however many of theirs are up", async () => {
    const { sky } = await server({ DERELICTS: "20", RESIDENTS_PER_HOUR: "12", RESIDENT_CAP: "20" });
    const live = sky.liveSky(T);
    expect(live.filter((o) => o.kind === "satellite").length).toBeGreaterThanOrEqual(20);
    expect(live.filter((o) => o.kind === "derelict").length).toBeGreaterThanOrEqual(sky.DERELICT_MIN);
  });

  it("is nothing when they're turned off", async () => {
    const { sky } = await server({ RESIDENTS_PER_HOUR: "0" });
    sky.settle(T);
    sky.settle(T + 6 * HOUR);
    expect(residentRows(sky.catalogue("all", undefined))).toEqual([]);
  });
});
