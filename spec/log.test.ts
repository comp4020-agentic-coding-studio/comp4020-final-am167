import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AstroCookies } from "astro";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HIT, fatalMeeting, nextMeeting } from "../src/lib/collide.ts";
import { extrasBetween, type ExtraLaunch } from "../src/lib/extras.ts";
import { DECAY, bandAt, periodAt, reentryAt } from "../src/lib/orbit.ts";

// The server's record of who did what (crit 10, "Fly by instruments"): one
// plain line on stdout per thing a person does, or is refused, and per thing
// the server does on its own, so someone reading `flyctl logs` alone can
// tell two people apart and say who touched what. Driven against throwaway
// databases with the clock passed in, as the other server tests are, with
// stdout captured. These test what a line says, not how it's spelled.

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

// every line written to stdout while a test runs
let out: string[] = [];
beforeEach(() => {
  out = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    out.push(args.map(String).join(" "));
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

// A line, read back: its event and its fields. A value is bare, or quoted
// with JSON's escaping.
interface Line {
  event: string;
  fields: Record<string, string>;
  raw: string;
}
function parse(raw: string): Line {
  const [event, ...rest] = raw.split(" ");
  const fields: Record<string, string> = {};
  const pattern = /([a-z_]+)=("(?:[^"\\]|\\.)*"|\S*)/gy;
  const tail = rest.join(" ");
  let at = 0;
  for (;;) {
    while (tail[at] === " ") at++;
    if (at >= tail.length) break;
    pattern.lastIndex = at;
    const match = pattern.exec(tail);
    if (!match) throw new Error(`can't read ${JSON.stringify(raw)} at ${at}`);
    fields[match[1]] = match[2].startsWith('"') ? JSON.parse(match[2]) : match[2];
    at = pattern.lastIndex;
  }
  return { event, fields, raw };
}
const lines = () => out.map(parse);
const linesOf = (event: string) => lines().filter((line) => line.event === event);

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// in the future, so the server's own wake-up timers never fire mid-test
const T = Math.floor(Date.now() / HOUR) * HOUR + 10 * DAY;

// two people's cookies, as the middleware makes them
const ALICE = "6f1c2a7e-1111-4aaa-8bbb-0123456789ab";
const BOB = "9d4e8b03-2222-4ccc-9ddd-fedcba987654";

async function server(path: string, env: Record<string, string | undefined> = {}) {
  for (const [name, value] of Object.entries({ DERELICTS: "0", EXTRAS_PER_HOUR: "0", ...env })) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  process.env.DATABASE_PATH = path;
  vi.resetModules();
  const sky = await import("../src/lib/sky.ts");
  const operators = await import("../src/lib/operators.ts");
  const person = await import("../src/lib/person.ts");
  const log = await import("../src/lib/log.ts");
  const { db, schema } = await import("../src/db/index.ts");
  // a satellite on a chosen orbit, as if launched (a launch's orbit is random)
  const put = (owner: string, radius: number, phase: number, direction: 1 | -1, epoch = T, operator: number | null = null) => {
    const row = db
      .insert(schema.objects)
      .values({
        kind: "satellite",
        owner,
        operator,
        callsign: `SAT ${owner.slice(0, 4)}`,
        beacon: `${owner.slice(0, 4)} up here`,
        band: bandAt(radius),
        launchedAt: epoch,
        radius,
        phase,
        period: Math.round(periodAt(radius)),
        epoch,
        direction,
      })
      .returning()
      .get();
    return { ...row, kind: "satellite" as const, direction };
  };
  return { sky, operators, person, log, db, schema, put, path };
}

async function freshServer(env: Record<string, string | undefined> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "kessler-log-"));
  dirs.push(dir);
  const path = join(dir, "app.db");
  execFileSync(process.execPath, ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_PATH: path } });
  return server(path, env);
}

// a launch form as the launchpad posts it
const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
};

// No line may carry a person's cookie, or any stretch of it long enough to
// be worth anything.
function expectNoCookie(raw: string, ...cookies: string[]) {
  for (const cookie of cookies) {
    const bare = cookie.replaceAll("-", "");
    for (let i = 0; i + 8 <= bare.length; i++) expect(raw.replaceAll("-", "")).not.toContain(bare.slice(i, i + 8));
  }
}

describe("a line", async () => {
  const { log } = await freshServer();

  it("stays on one line, whatever a value holds, and reads back as it was", () => {
    const awkward = 'say "hi"\nand = goodbye \u2028 \u202e back\\slash';
    log.log("launch", { who: "anon#abcdef", beacon: awkward, sat: 7 });
    expect(out).toHaveLength(1);
    expect(out[0]).not.toMatch(/[\n\r\u2028\u2029\u202e]/);
    const [line] = lines();
    expect(line.event).toBe("launch");
    expect(line.fields).toEqual({ who: "anon#abcdef", beacon: awkward, sat: "7" });
  });

  it("tells two cookies apart by a short id that is no part of either", () => {
    const a = log.whoIs(ALICE, null);
    const b = log.whoIs(BOB, null);
    expect(a).toMatch(/^anon#[0-9a-f]{4,6}$/);
    expect(b).toMatch(/^anon#[0-9a-f]{4,6}$/);
    expect(a).not.toBe(b);
    // the same cookie is the same person each time
    expect(log.whoIs(ALICE, null)).toBe(a);
    // signed in, the handle comes first
    expect(log.whoIs(ALICE, "ada")).toBe(`ada#${a.split("#")[1]}`);
    expectNoCookie(a + b, ALICE, BOB);
  });
});

describe("a visit", async () => {
  const { person } = await freshServer();

  it("is a line when a new person's cookie is set, naming them by their short id only", () => {
    const set: string[] = [];
    const cookies = { set: (_name: string, value: string) => void set.push(value) } as unknown as AstroCookies;
    const id = person.newVisitor(cookies, new URL("http://localhost/sky/"), new Headers());
    expect(set).toEqual([id]);
    const [visit] = linesOf("visit");
    expect(visit.fields.who).toMatch(/^anon#[0-9a-f]{4,6}$/);
    expect(visit.fields.path).toBe("/sky/");
    expectNoCookie(out.join("\n"), id);
  });
});

describe("launching", async () => {
  const { sky } = await freshServer();
  const alice = { person: ALICE, operator: null };

  it("names who launched it, the satellite, its callsign, band and words", () => {
    const result = sky.launchFrom(alice, form({ band: "mid", callsign: "PIP 1", beacon: 'hello, "sky"' }), T);
    expect(result.ok).toBe(true);
    const [line] = linesOf("launch");
    expect(line.fields).toMatchObject({ who: sky.whoOf(alice), callsign: "PIP 1", band: "mid", beacon: 'hello, "sky"' });
    expect(Number(line.fields.sat)).toBe(result.ok && result.object.id);
    expectNoCookie(out.join("\n"), ALICE);
  });

  it("is a refusal, with its reason, a minute after the last", () => {
    const result = sky.launchFrom(alice, form({ band: "low", callsign: "PIP 2", beacon: "again" }), T + 10_000);
    expect(result.ok).toBe(false);
    expect(linesOf("launch")).toHaveLength(0);
    const [line] = linesOf("launch-refused");
    expect(line.fields).toMatchObject({ who: sky.whoOf(alice), reason: "gap", callsign: "PIP 2", band: "low" });
  });

  it("is a refusal, with its reason, when the form breaks the launch rules", () => {
    const bob = { person: BOB, operator: null };
    const result = sky.launchFrom(bob, form({ band: "sideways", callsign: "", beacon: "visit www.example.com" }), T);
    expect(result.ok).toBe(false);
    const [line] = linesOf("launch-refused");
    expect(line.fields.who).toBe(sky.whoOf(bob));
    expect(line.fields.reason).toContain("band");
    expect(line.fields.reason).toContain("callsign");
    expect(line.fields.reason).toContain("beacon");
  });

  it("is a refusal when the form can't be read", () => {
    sky.launchFrom({ person: BOB, operator: null }, null, T);
    expect(linesOf("launch-refused")[0].fields.reason).toBe("unreadable");
  });
});

describe("deorbiting and boosting", async () => {
  const { sky, put } = await freshServer();
  const alice = { person: ALICE, operator: null };
  const bob = { person: BOB, operator: null };
  const hers = put(ALICE, 1.35, 1, 1);
  const his = put(BOB, 1.3, 2, 1);
  const high = put(BOB, 2.4, 3, -1);

  it("names whose satellite it was and who brought it down", () => {
    expect(sky.deorbit(bob, his.id, T + 1_000).ok).toBe(true);
    const [line] = linesOf("deorbit");
    expect(line.fields).toMatchObject({ who: sky.whoOf(bob), sat: String(his.id), callsign: his.callsign });
  });

  it("refuses someone else's, naming the satellite and its owner", () => {
    expect(sky.deorbit(bob, hers.id, T + 2_000).ok).toBe(false);
    expect(sky.boost(bob, hers.id, T + 3_000).ok).toBe(false);
    const [deorbit] = linesOf("deorbit-refused");
    const [boost] = linesOf("boost-refused");
    for (const line of [deorbit, boost]) {
      expect(line.fields).toMatchObject({ who: sky.whoOf(bob), sat: String(hers.id), owner: sky.whoOf(alice), reason: "not-yours" });
    }
    expect(sky.whoOf(bob)).not.toBe(sky.whoOf(alice));
    expectNoCookie(out.join("\n"), ALICE, BOB);
  });

  it("refuses one already coming down, and says so", () => {
    expect(sky.deorbit(bob, his.id, T + 4_000).ok).toBe(false);
    expect(linesOf("deorbit-refused")[0].fields).toMatchObject({ sat: String(his.id), reason: "coming-down", owner: sky.whoOf(bob) });
  });

  it("names the band a boost goes from and to", () => {
    expect(sky.boost(alice, hers.id, T + 5_000, () => 0.5).ok).toBe(true);
    const [line] = linesOf("boost");
    expect(line.fields).toMatchObject({ who: sky.whoOf(alice), sat: String(hers.id), from: "low", to: "mid" });
  });

  it("refuses a second boost for want of fuel, and one from the top band", () => {
    expect(sky.boost(alice, hers.id, T + 6_000).ok).toBe(false);
    expect(sky.boost(bob, high.id, T + 7_000).ok).toBe(false);
    expect(linesOf("boost-refused").map((l) => l.fields.reason)).toEqual(["no-fuel", "top-band"]);
  });

  it("tells an owner theirs has gone, rather than that it isn't theirs", () => {
    // bob's, brought down at T + 1s, gone from the sky three minutes on
    const later = T + 1_000 + 3 * 60_000;
    expect(sky.deorbit(bob, his.id, later)).toMatchObject({ ok: false, why: "gone" });
    expect(linesOf("deorbit-refused")[0].fields).toMatchObject({ who: sky.whoOf(bob), sat: String(his.id), reason: "gone" });
    // and to anyone else, it still isn't theirs
    expect(sky.deorbit(alice, his.id, later)).toMatchObject({ ok: false, why: "not-yours" });
  });

  it("refuses one that isn't there, saying so", () => {
    expect(sky.deorbit(bob, 99_999, T + 8_000).ok).toBe(false);
    expect(linesOf("deorbit-refused")[0].fields).toMatchObject({ sat: "99999", reason: "not-yours", owner: "none" });
  });
});

describe("a signed-in operator's satellite", async () => {
  const { sky, operators, put } = await freshServer();

  it("is named by its operator's handle, whichever device launched it", async () => {
    const claimed = await operators.claim(ALICE, { action: "claim", handle: "ada_ops", passphrase: "correct horse battery" }, "127.0.0.1", T);
    expect(claimed.ok).toBe(true);
    const id = claimed.ok ? claimed.operator.id : 0;
    // launched from her laptop; she's on her phone now
    const sat = put(ALICE, 1.35, 1, 1, T, id);
    const phone = { person: "phone-cookie-0000-4000-8000-000000000000", operator: id };
    expect(sky.deorbit(BOB, sat.id, T + 1_000).ok).toBe(false);
    expect(linesOf("deorbit-refused")[0].fields.owner).toBe("ada_ops");
    expect(sky.whoOf(phone)).toMatch(/^ada_ops#/);
  });
});

describe("operators", async () => {
  const { operators } = await freshServer();
  const passphrase = "correct horse battery";
  const read = (action: string, handle: string, pass = passphrase) => {
    const data = new FormData();
    data.set("action", action);
    data.set("handle", handle);
    data.set("passphrase", pass);
    return data;
  };
  let aliceNow = "";

  it("logs a claim: who claimed which handle, and who they are now", async () => {
    const result = await operators.operate(ALICE, read("claim", "ada_ops"), "127.0.0.1", T);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    aliceNow = result.person;
    const [line] = linesOf("claim");
    expect(line.fields.who).toMatch(/^anon#/);
    expect(line.fields.handle).toBe("ada_ops");
    expect(line.fields.now).toMatch(/^ada_ops#[0-9a-f]{4,6}$/);
    expect(line.fields.now.split("#")[1]).not.toBe(line.fields.who.split("#")[1]);
    // how many of the device's satellites became the operator's
    expect(line.fields.took).toBe("0");
  });

  it("logs a refused claim with the handle tried and why", async () => {
    const result = await operators.operate(BOB, read("claim", "ADA_ops", "another long one"), "127.0.0.1", T);
    expect(result.ok).toBe(false);
    expect(linesOf("claim-refused")[0].fields).toMatchObject({ handle: "ADA_ops", reason: "taken" });
    await operators.operate(BOB, read("claim", "x", "short"), "127.0.0.1", T);
    expect(linesOf("claim-refused")[1].fields.reason).toMatch(/handle/);
  });

  it("won't let anyone claim a word the record uses for who someone is", async () => {
    for (const reserved of ["anon", "Nobody", "NONE", "extra"]) {
      const result = await operators.operate(BOB, read("claim", reserved, "a long enough one"), "127.0.0.1", T);
      expect(result.ok, reserved).toBe(false);
    }
    expect(linesOf("claim-refused").map((l) => l.fields.reason)).toEqual(["handle-reserved", "handle-reserved", "handle-reserved", "handle-reserved"]);
  });

  it("never logs a handle tried that couldn't be one, in case it's a passphrase", async () => {
    await operators.operate(BOB, read("sign-in", "my secret phrase", "my secret phrase"), "203.0.113.7", T);
    await operators.operate(BOB, read("claim", "hunter2hunter2!", "short"), "127.0.0.1", T);
    expect(out.join("\n")).not.toContain("secret");
    expect(out.join("\n")).not.toContain("hunter2");
    const [signIn] = linesOf("sign-in-refused");
    expect(signIn.fields).toMatchObject({ handle_length: "16", reason: "no-such-handle" });
    expect(signIn.fields.handle).toBeUndefined();
  });

  it("logs a refused sign-in with the handle tried and why", async () => {
    await operators.operate(BOB, read("sign-in", "ada_ops", "not the passphrase"), "203.0.113.5", T);
    await operators.operate(BOB, read("sign-in", "nobody_here", "whatever it is"), "203.0.113.5", T);
    const [wrong, unknown] = linesOf("sign-in-refused");
    expect(wrong.fields).toMatchObject({ handle: "ada_ops", reason: "wrong-passphrase" });
    expect(unknown.fields).toMatchObject({ handle: "nobody_here", reason: "no-such-handle" });
  });

  it("logs a sign-in and a sign-out, with who the device is before and after", async () => {
    const signedIn = await operators.operate(BOB, read("sign-in", "ada_ops"), "203.0.113.5", T);
    expect(signedIn.ok).toBe(true);
    const [inLine] = linesOf("sign-in");
    expect(inLine.fields.who).toMatch(/^anon#/);
    expect(inLine.fields).toMatchObject({ handle: "ada_ops" });
    expect(inLine.fields.now).toMatch(/^ada_ops#/);
    const signedOut = await operators.operate(aliceNow, read("sign-out", ""), "127.0.0.1", T);
    expect(signedOut.ok).toBe(true);
    const [outLine] = linesOf("sign-out");
    expect(outLine.fields.who).toMatch(/^ada_ops#/);
    expect(outLine.fields.now).toMatch(/^anon#/);
  });

  it("never writes a passphrase, tried or right, nor a cookie", () => {
    const all = out.join("\n");
    for (const tried of [passphrase, "another long one", "not the passphrase", "whatever it is"]) expect(all).not.toContain(tried);
    expect(all).not.toContain("short");
    expectNoCookie(all, ALICE, BOB, aliceNow);
  });
});

describe("what the server does on its own", async () => {
  const { sky, put, path } = await freshServer();
  const a = put(ALICE, 1.3, 0, 1);
  const b = put(BOB, 1.3 + HIT.headOn / 2, 2, -1);
  const nth = fatalMeeting(a, b);
  if (nth === null) throw new Error("this pair never collides: pick another");
  const at = Math.round(nextMeeting(a, b, T, nth)!);
  // one that's falling through the bottom of the sky, after the collision
  const lone = put(BOB, 1.06, 1, 1, at + 120_000);
  const burns = Math.round(reentryAt(lone));

  it("logs a collision with both objects, both owners and its fragments, at the moment it happened", () => {
    sky.settle(at + 60_000);
    const [line] = linesOf("collision");
    expect(line.fields).toMatchObject({
      at: new Date(at).toISOString(),
      a: String(a.id),
      a_owner: sky.whoOf({ person: ALICE, operator: null }),
      b: String(b.id),
      b_owner: sky.whoOf({ person: BOB, operator: null }),
    });
    expect(Number(line.fields.fragments)).toBeGreaterThan(0);
  });

  it("logs a burn-up at the moment it burned up, naming whose it was", () => {
    sky.settle(burns + DECAY.plungeMs + 60_000);
    const mine = linesOf("burn-up").filter((l) => l.fields.sat === String(lone.id));
    expect(mine).toHaveLength(1);
    expect(mine[0].fields).toMatchObject({ at: new Date(burns).toISOString(), owner: sky.whoOf({ person: BOB, operator: null }) });
    // who= is only ever someone who did something
    expect(mine[0].fields.who).toBeUndefined();
  });

  it("never logs the same thing twice, even across a restart", async () => {
    const before = out.length;
    const again = await server(path);
    again.sky.settle(burns + DECAY.plungeMs + 120_000);
    const after = out.slice(before).map(parse);
    expect(after.filter((l) => l.event === "collision" || (l.event === "burn-up" && l.fields.sat === String(lone.id)))).toEqual([]);
  });

  it("logs a derelict put up and a collision staged, each at its time", async () => {
    const derelicts = await freshServer({ DERELICTS: "3" });
    const now = T + DAY;
    derelicts.sky.keepDerelicts(now);
    const added = linesOf("derelict");
    expect(added).toHaveLength(3);
    for (const line of added) expect(line.fields).toMatchObject({ at: new Date(now).toISOString() });
    expect(Number(added[0].fields.sat)).toBeGreaterThan(0);
    // a pair is only sent where it keeps to itself, so it may take a few goes
    let staged: ReturnType<typeof derelicts.sky.stageCollision> = null;
    let when = now;
    while (!staged && when < now + HOUR) staged = derelicts.sky.stageCollision((when += 60_000));
    expect(staged).not.toBeNull();
    const [line] = linesOf("staged");
    expect(line.fields).toMatchObject({ at: new Date(when).toISOString(), a: String(staged!.a), b: String(staged!.b), due: new Date(staged!.at).toISOString() });
    expect(line.fields.over).toBeTruthy();
  });
});

describe("the extras", async () => {
  // a day with a regular's launch and a one-off's in it
  let day = T;
  while (!extrasBetween(day - DAY, day).some((e) => e.type === "launch" && e.handle !== null)) day += HOUR;
  const { sky, path, db, schema } = await freshServer({ EXTRAS_PER_HOUR: undefined, EXTRA_CAP: "1000" });

  it("logs their launches as an extra's, at the time each was due, once", async () => {
    sky.settle(day);
    const launched = linesOf("launch");
    const due = extrasBetween(day - DAY, day).filter((e): e is ExtraLaunch => e.type === "launch");
    expect(launched.length).toBeGreaterThan(0);
    // exactly the extras' launches now in the record, one line each
    const rows = db.select().from(schema.objects).all().filter((o) => o.owner?.startsWith("extra:"));
    expect(launched.map((l) => Number(l.fields.sat)).sort((x, y) => x - y)).toEqual(rows.map((o) => o.id).sort((x, y) => x - y));
    for (const line of launched) {
      expect(line.fields.who).toMatch(/^extra:/);
      expect(due.some((e) => e.owner === line.fields.who && new Date(e.at).toISOString() === line.fields.at)).toBe(true);
      expect(line.fields).toHaveProperty("callsign");
      expect(line.fields).toHaveProperty("beacon");
    }
    const before = out.length;
    const again = await server(path, { EXTRAS_PER_HOUR: undefined, EXTRA_CAP: "1000" });
    again.sky.settle(day + 1_000);
    expect(out.slice(before).map(parse).filter((l) => l.event === "launch" && Date.parse(l.fields.at) < day)).toEqual([]);
  });

  it("logs their manoeuvres as an extra's", () => {
    sky.settle(day + 2 * DAY);
    const moves = lines().filter((l) => l.event === "deorbit" || l.event === "boost");
    expect(moves.length).toBeGreaterThan(0);
    for (const line of moves) {
      expect(line.fields.who).toMatch(/^extra:/);
      expect(line.fields.at).toMatch(/^\d{4}-\d\d-\d\dT/);
    }
  });
});
