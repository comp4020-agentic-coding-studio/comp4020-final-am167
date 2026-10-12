import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq, like } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { SkyEvent } from "../src/lib/events.ts";
import { REGULARS } from "../src/lib/extras-cast.ts";
import { extrasBetween, type ExtraEvent, type ExtraLaunch } from "../src/lib/extras.ts";

// The server's side of the extras (ADR 0021): it launches what the schedule
// says, when it says, like anyone's launch; a server that was stopped
// launches what it missed, at the times it was due, without telling open
// pages of launches long past; a restart or a redeploy launches nothing
// twice; and nobody can sign in as an extra. Driven against throwaway
// databases with the clock passed in, as the collision tests are.

// no derelicts, and no cap, unless a test asks: they'd change the sky
process.env.DERELICTS = "0";
const CLEAN = { EXTRAS_PER_HOUR: undefined, EXTRA_CAP: "1000", DERELICTS: "0", SKY_CAP: undefined } as Record<string, string | undefined>;

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
const NOW = Math.floor(Date.now() / HOUR) * HOUR + 10 * DAY + 17 * 60_000;

const launchesIn = (from: number, to: number, rate?: number) =>
  extrasBetween(from, to, rate).filter((e): e is ExtraLaunch => e.type === "launch");
// The first time from `from`, an hour at a time, whose last day has
// something in it (the schedule follows the real date, so a test can't
// count on any one day having, say, a regular)
function dayWith(test: (events: ExtraEvent[]) => boolean, from = NOW): number {
  let t = from;
  while (!test(extrasBetween(t - DAY, t))) t += HOUR;
  return t;
}
// a day with a regular who has a handle in it
const T = dayWith((events) => events.some((e) => e.type === "launch" && e.handle !== null));

// a regular's callsign is numbered from the record, not the schedule
const isRegular = (owner: string | null) => REGULARS.some((r) => owner === `extra:${r.key}`);
const asLaunched = (l: ExtraLaunch) => [l.owner, l.at, l.regular ? "numbered" : l.callsign, l.beacon, l.band, l.question];
const asRow = (r: { owner: string | null; launchedAt: number; callsign: string | null; beacon: string | null; band: string; question: string | null }) =>
  [r.owner, r.launchedAt, isRegular(r.owner) ? "numbered" : r.callsign, r.beacon, r.band, r.question];
// each regular's satellites, in the order launched, numbered from their first
function expectNumbered(rows: { owner: string | null; callsign: string | null }[]) {
  for (const regular of REGULARS) {
    const theirs = rows.filter((r) => r.owner === `extra:${regular.key}`).map((r) => r.callsign);
    expect(theirs, regular.key).toEqual(theirs.map((_, n) => regular.callsign(n)));
  }
}

describe("the extras, on the server", () => {
  it("launches the last day's on a fresh start, at the times they were due, and tells nobody of the old ones", async () => {
    const { sky, heard, extras } = await freshServer();
    sky.settle(T);
    const due = launchesIn(T - DAY, T);
    expect(due.length).toBeGreaterThan(5);
    const rows = extras();
    expect(rows.map(asRow)).toEqual(due.map(asLaunched));
    expectNumbered(rows);
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
    expectNumbered(rows);
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
    // and a regular's numbers carry on, never repeating
    expectNumbered(third.extras());
  });

  it("ends up with the same sky whether it ran all along or caught up after a stop", async () => {
    const along = await freshServer();
    const stopped = await freshServer();
    along.sky.settle(T);
    stopped.sky.settle(T);
    for (let t = T; t <= T + 12 * HOUR; t += 30 * 60_000) along.sky.settle(t);
    stopped.sky.settle(T + 12 * HOUR);
    const all = (server: typeof along) => server.db.select().from(server.schema.objects).orderBy(server.schema.objects.id).all();
    expect(all(stopped)).toEqual(all(along));
    expect(stopped.db.select().from(stopped.schema.collisions).all()).toEqual(along.db.select().from(along.schema.collisions).all());
    expect(stopped.db.select().from(stopped.schema.manoeuvres).all()).toEqual(along.db.select().from(along.schema.manoeuvres).all());
    expect(along.extras().length).toBeGreaterThan(launchesIn(T - DAY, T).length);
  });

  it("fills in nothing behind a sky people have used: a first deploy starts from the latest thing in the record", async () => {
    const before = await freshServer({ EXTRAS_PER_HOUR: "0" });
    for (let i = 0; i < 6; i++) {
      const person = `8d2f1e0c-0000-4000-8000-${String(200 + i).padStart(12, "0")}`;
      before.sky.launch(person, { band: "high", callsign: `USED ${i}`, beacon: "people were here", question: null }, T - 10 * HOUR + i * HOUR);
    }
    const people = () => before.db.select().from(before.schema.objects).where(like(before.schema.objects.callsign, "USED%")).all();
    const was = people();
    const deployed = await server(before.path);
    deployed.sky.settle(T);
    const latest = T - 5 * HOUR;
    expect(deployed.extras().every((r) => r.launchedAt > latest)).toBe(true);
    expect(deployed.extras().map(asRow)).toEqual(launchesIn(latest, T).map(asLaunched));
    // nothing people had up was changed behind them
    expect(people().filter((p) => p.fateAt !== null && p.fateAt <= latest)).toEqual(was.filter((p) => p.fateAt !== null && p.fateAt <= latest));
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

  it("leaves a handle a person claimed first theirs: that regular never launches, so nobody seems to be them", async () => {
    const regular = launchesIn(T - DAY, T).find((l) => l.handle !== null)!;
    const { sky, operators, extras } = await freshServer();
    const person = "8d2f1e0c-0000-4000-8000-000000000003";
    const claimed = await operators.claim(person, { action: "claim", handle: regular.handle!, passphrase: "a person's own passphrase" }, "127.0.0.1", T - 2 * DAY);
    expect(claimed.ok).toBe(true);
    sky.settle(T);
    expect(extras().filter((r) => r.owner === regular.owner)).toEqual([]);
    expect(extras().length).toBeGreaterThan(0);
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

  it("brings theirs down, and boosts them, when the schedule says, telling everyone only of fresh ones", async () => {
    const end = dayWith((events) => events.some((e) => e.type === "deorbit") && events.some((e) => e.type === "boost"), T);
    const { sky, db, schema, extras, heard } = await freshServer();
    sky.settle(end);
    const planned = extrasBetween(end - DAY, end).filter((e): e is Exclude<ExtraEvent, ExtraLaunch> => e.type !== "launch");
    let done = 0;
    for (const m of planned) {
      const row = extras().find((r) => r.owner === m.owner && r.launchedAt === m.launchedAt);
      if (!row) continue;
      const moves = db.select().from(schema.manoeuvres).where(and(eq(schema.manoeuvres.object, row.id), eq(schema.manoeuvres.at, m.at))).all();
      // gone before it was due: nothing to do; and one already in its
      // last 30 seconds' plunge can't be (ADR 0011)
      if (row.fateAt !== null && row.fateAt - m.at <= 30_000) {
        expect(moves).toHaveLength(0);
        continue;
      }
      expect(moves.map((move) => move.kind), `${m.type} of ${row.callsign} at ${m.at}`).toEqual([m.type]);
      if (m.type === "deorbit") expect(row.deorbitedAt).toBe(m.at);
      done++;
    }
    expect(done).toBeGreaterThan(0);
    // all of those were long past: nobody was told
    expect(heard.filter((e) => e.type === "manoeuvre" && planned.every((m) => end - m.at > 60_000))).toEqual([]);
    // a live one is told, once
    const next = extrasBetween(end, end + 2 * DAY).find(
      (e): e is Exclude<ExtraEvent, ExtraLaunch> => e.type !== "launch" && e.launchedAt <= end && extras().some((r) => r.owner === e.owner && r.launchedAt === e.launchedAt && r.fate === "live"),
    );
    if (next) {
      sky.settle(next.at);
      const row = extras().find((r) => r.owner === next.owner && r.launchedAt === next.launchedAt)!;
      const told = heard.filter((e) => e.type === "manoeuvre" && e.object.id === row.id);
      const moved = db.select().from(schema.manoeuvres).where(and(eq(schema.manoeuvres.object, row.id), eq(schema.manoeuvres.at, next.at))).all();
      expect(told).toHaveLength(moved.length);
    }
  });

  // the extras' satellites count towards the derelicts' baseline, so they
  // could otherwise take every derelict's place
  it("keeps a few derelicts by default, however many satellites are up, topped up a gap apart", async () => {
    const { sky, db, schema } = await freshServer({ EXTRAS_PER_HOUR: "0", DERELICTS: "20" });
    for (let i = 0; i < 22; i++) {
      const person = `8d2f1e0c-0000-4000-8000-${String(300 + i).padStart(12, "0")}`;
      expect(sky.launch(person, { band: "high", callsign: `UP ${i}`, beacon: "here", question: null }, T).ok).toBe(true);
    }
    // the first settle filled the empty sky with derelicts: take them away
    db.update(schema.objects).set({ fate: "decayed", fateAt: T }).where(eq(schema.objects.kind, "derelict")).run();
    const derelicts = () =>
      db.select().from(schema.objects).where(and(eq(schema.objects.fate, "live"), eq(schema.objects.kind, "derelict"))).all().length;
    sky.keepDerelicts(T + 10 * 60_000);
    expect(derelicts()).toBe(1);
    sky.keepDerelicts(T + 60 * 60_000);
    expect(derelicts()).toBe(5);
    sky.keepDerelicts(T + 3 * 60 * 60_000);
    expect(derelicts()).toBe(5);
  });

  it("keeps however few derelicts it's asked to", async () => {
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
