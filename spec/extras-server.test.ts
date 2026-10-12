import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq, like } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { SkyEvent } from "../src/lib/events.ts";
import { extrasBetween, type ExtraEvent, type ExtraLaunch } from "../src/lib/extras.ts";

// The server's side of the extras (ADR 0021): it launches what the schedule
// says, when it says, like anyone's launch; a server that was stopped
// launches what it missed, at the times it was due, without telling open
// pages of launches long past; a restart or a redeploy launches nothing
// twice; and nobody can sign in as an extra. Driven against throwaway
// databases with the clock passed in, as the collision tests are.

// no derelicts, and no cap, unless a test asks: they'd change the sky
process.env.DERELICTS = "0";
const CLEAN = { EXTRAS_PER_HOUR: undefined, EXTRA_CAP: "1000", DERELICTS: "0", SKY_CAP: undefined };

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

async function server(path: string, env: Record<string, string | undefined> = {}) {
  for (const [name, value] of Object.entries({ ...CLEAN, ...env })) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  process.env.DATABASE_PATH = path;
  vi.resetModules();
  const sky = await import("../src/lib/sky.ts");
  const events = await import("../src/lib/events.ts");
  const operators = await import("../src/lib/operators.ts");
  const { db, schema } = await import("../src/db/index.ts");
  const heard: SkyEvent[] = [];
  events.subscribe((event) => heard.push(event));
  const extras = () =>
    db.select().from(schema.objects).where(like(schema.objects.owner, "extra:%")).orderBy(schema.objects.launchedAt, schema.objects.id).all();
  return { sky, heard, operators, db, schema, extras, path };
}

// A server with its own empty database.
async function freshServer(env: Record<string, string | undefined> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "kessler-extras-"));
  dirs.push(dir);
  const path = join(dir, "app.db");
  execFileSync(process.execPath, ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_PATH: path } });
  return server(path, env);
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// in the future, so the server's own wake-up timers never fire mid-test
const T = Math.floor(Date.now() / HOUR) * HOUR + 10 * DAY + 17 * 60_000;

const launchesIn = (from: number, to: number, rate?: number) =>
  extrasBetween(from, to, rate).filter((e): e is ExtraLaunch => e.type === "launch");
const asLaunched = (l: ExtraLaunch) => [l.owner, l.at, l.callsign, l.beacon, l.band, l.question];
const asRow = (r: { owner: string | null; launchedAt: number; callsign: string | null; beacon: string | null; band: string; question: string | null }) =>
  [r.owner, r.launchedAt, r.callsign, r.beacon, r.band, r.question];

describe("the extras, on the server", () => {
  it("launches the last day's on a fresh start, at the times they were due, and tells nobody of the old ones", async () => {
    const { sky, heard, extras } = await freshServer();
    sky.settle(T);
    const due = launchesIn(T - DAY, T);
    expect(due.length).toBeGreaterThan(5);
    const rows = extras();
    expect(rows.map(asRow)).toEqual(due.map(asLaunched));
    for (const row of rows) expect(row.kind).toBe("satellite");
    const told = new Set(heard.flatMap((e) => (e.type === "launch" ? [e.object.id] : [])));
    for (const row of rows) if (T - row.launchedAt > 60_000) expect(told.has(row.id)).toBe(false);
  });

  it("launches each one live as it comes due, once, and tells everyone", async () => {
    const { sky, heard, extras } = await freshServer();
    sky.settle(T);
    const [next] = launchesIn(T, T + 2 * DAY);
    sky.settle(next.at - 1);
    expect(extras().some((r) => r.launchedAt === next.at)).toBe(false);
    sky.settle(next.at);
    sky.settle(next.at + 5_000);
    const launched = extras().filter((r) => r.launchedAt === next.at && r.owner === next.owner);
    expect(launched).toHaveLength(1);
    const told = heard.filter((e) => e.type === "launch" && e.object.id === launched[0].id);
    expect(told).toHaveLength(1);
  });

  it("launches nothing twice across a restart, a launch or a changed schedule", async () => {
    const first = await freshServer();
    first.sky.settle(T);
    // someone launches two hours on, which settles up to then first
    first.sky.launch("8d2f1e0c-0000-4000-8000-000000000001", { band: "low", callsign: "REAL", beacon: "a person", question: null }, T + 2 * HOUR);
    // a restart three hours on, with the same schedule
    const second = await server(first.path);
    second.sky.settle(T + 3 * HOUR);
    const rows = second.extras();
    expect(rows.map(asRow)).toEqual(launchesIn(T - DAY, T + 3 * HOUR).map(asLaunched));
    // a redeploy that changes the schedule: what's due from the latest thing
    // in the record on is the new schedule's, and nothing before it is
    // filled in (it was the old schedule's, and people may have watched it)
    const latest = Math.max(...second.db.select().from(second.schema.objects).all().map((o) => o.launchedAt));
    const third = await server(first.path, { EXTRAS_PER_HOUR: "3" });
    third.sky.settle(T + 5 * HOUR);
    expect(third.extras().filter((r) => r.launchedAt <= latest).map(asRow)).toEqual(rows.filter((r) => r.launchedAt <= latest).map(asRow));
    const after = third.extras().filter((r) => r.launchedAt > latest);
    expect(after.map(asRow)).toEqual(launchesIn(latest, T + 5 * HOUR, 3).map(asLaunched));
    const keys = third.extras().map((r) => `${r.owner}@${r.launchedAt}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives a regular their handle, which nobody can sign in as or claim", async () => {
    const { sky, operators, db, schema, extras } = await freshServer();
    sky.settle(T);
    const regular = launchesIn(T - DAY, T).find((l) => l.handle !== null)!;
    expect(regular).toBeDefined();
    const theirs = extras().filter((r) => r.owner === regular.owner);
    const operator = db.select().from(schema.operators).where(eq(schema.operators.handle, regular.handle!)).get()!;
    expect(operator.extra).toBe(true);
    for (const row of theirs) expect(row.operator).toBe(operator.id);
    const person = "8d2f1e0c-0000-4000-8000-000000000002";
    for (const passphrase of ["", "correct horse battery", operator.hash, operator.salt]) {
      const signIn = await operators.signIn(person, { action: "sign-in", handle: regular.handle!, passphrase }, "203.0.113.9", T);
      expect(signIn.ok).toBe(false);
    }
    const claim = await operators.claim(person, { action: "claim", handle: regular.handle!, passphrase: "correct horse battery" }, "127.0.0.1", T);
    expect(claim.ok).toBe(false);
  });

  it("leaves a handle a person claimed first theirs: the regular launches without it", async () => {
    const regular = launchesIn(T - DAY, T).find((l) => l.handle !== null)!;
    const { sky, operators, extras } = await freshServer();
    const person = "8d2f1e0c-0000-4000-8000-000000000003";
    const claimed = await operators.claim(person, { action: "claim", handle: regular.handle!, passphrase: "a person's own passphrase" }, "127.0.0.1", T - 2 * DAY);
    expect(claimed.ok).toBe(true);
    sky.settle(T);
    const theirs = extras().filter((r) => r.owner === regular.owner);
    expect(theirs.length).toBeGreaterThan(0);
    for (const row of theirs) expect(row.operator).toBeNull();
  });

  it("keeps no more of theirs up than its cap, and none in a half-full sky", async () => {
    const { sky, extras } = await freshServer({ EXTRA_CAP: "3" });
    sky.settle(T);
    const rows = extras();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(launchesIn(T - DAY, T).length);
    for (const row of rows) {
      const up = rows.filter((r) => r.launchedAt <= row.launchedAt && (r.fateAt === null || r.fateAt > row.launchedAt));
      expect(up.length, `at ${row.launchedAt}`).toBeLessThanOrEqual(3);
    }
    const crowded = await freshServer({ SKY_CAP: "2" });
    crowded.sky.settle(T);
    for (const row of crowded.extras()) {
      const rows = crowded.extras();
      const up = rows.filter((r) => r.launchedAt <= row.launchedAt && (r.fateAt === null || r.fateAt > row.launchedAt));
      expect(up.length).toBeLessThanOrEqual(1);
    }
  });

  it("makes room for people: none launch in an hour people have launched four in", async () => {
    const { sky, extras } = await freshServer();
    sky.settle(T);
    const [next] = launchesIn(T + HOUR, T + 2 * DAY);
    for (let i = 0; i < 4; i++) {
      const person = `8d2f1e0c-0000-4000-8000-${String(100 + i).padStart(12, "0")}`;
      sky.launch(person, { band: "high", callsign: `CROWD ${i}`, beacon: "people here", question: null }, next.at - HOUR + (i + 1) * 60_000);
    }
    sky.settle(next.at);
    expect(extras().some((r) => r.launchedAt === next.at)).toBe(false);
    // and once that hour has passed, they're back
    const [later] = launchesIn(next.at - HOUR + 5 * 60_000 + HOUR, T + 3 * DAY);
    sky.settle(later.at);
    expect(extras().some((r) => r.launchedAt === later.at && r.owner === later.owner)).toBe(true);
  });

  it("brings theirs down, and boosts them, when the schedule says", async () => {
    // a day with both in it
    let end = T;
    const has = (type: string) => extrasBetween(end - DAY, end).some((e) => e.type === type);
    while (!(has("deorbit") && has("boost"))) end += HOUR;
    const { sky, db, schema, extras } = await freshServer();
    sky.settle(end);
    const planned = extrasBetween(end - DAY, end).filter((e): e is Exclude<ExtraEvent, ExtraLaunch> => e.type !== "launch");
    let done = 0;
    for (const m of planned) {
      const row = extras().find((r) => r.owner === m.owner && r.launchedAt === m.launchedAt);
      if (!row) continue;
      const moves = db.select().from(schema.manoeuvres).where(and(eq(schema.manoeuvres.object, row.id), eq(schema.manoeuvres.at, m.at))).all();
      // gone before it was due: nothing to do
      if (row.fateAt !== null && row.fateAt <= m.at) {
        expect(moves).toHaveLength(0);
        continue;
      }
      expect(moves.map((move) => move.kind), `${m.type} of ${row.callsign} at ${m.at}`).toEqual([m.type]);
      if (m.type === "deorbit") expect(row.deorbitedAt).toBe(m.at);
      done++;
    }
    expect(done).toBeGreaterThan(0);
  });

  // the extras' satellites count towards the derelicts' baseline, so they
  // could otherwise take every derelict's place
  it("keeps a few derelicts in the sky however many satellites are up", async () => {
    const { sky, db, schema } = await freshServer({ EXTRAS_PER_HOUR: "0" });
    for (let i = 0; i < 22; i++) {
      const person = `8d2f1e0c-0000-4000-8000-${String(i).padStart(12, "0")}`;
      expect(sky.launch(person, { band: "mid", callsign: `UP ${i}`, beacon: "here", question: null }, T).ok).toBe(true);
    }
    const derelicts = () =>
      db.select().from(schema.objects).where(and(eq(schema.objects.fate, "live"), eq(schema.objects.kind, "derelict"))).all().length;
    sky.keepDerelicts(T, 20, 5);
    expect(derelicts()).toBe(5);
    sky.keepDerelicts(T + 60 * 60_000, 20, 5);
    expect(derelicts()).toBe(5);
  });

  it("launches none when turned off", async () => {
    const { sky, extras } = await freshServer({ EXTRAS_PER_HOUR: "0" });
    sky.settle(T);
    sky.settle(T + DAY);
    expect(extras()).toEqual([]);
  });
});
