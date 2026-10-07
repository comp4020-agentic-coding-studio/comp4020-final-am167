import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { FRAGMENTS, HIT, fatalMeeting, nextMeeting } from "../src/lib/collide.ts";
import { angleAt, periodAt, radiusAt, type Elements } from "../src/lib/orbit.ts";
import { wordsOf } from "../src/lib/wreck.ts";
import { sharedQuestion } from "../src/lib/story.ts";
import type { SkyEvent } from "../src/lib/events.ts";

// The server's side of collisions (ADR 0008): a collision is predicted and
// announced before it happens, applied when its time comes (both objects
// destroyed, a collision row, fragments tracing back to it), and a server
// that was stopped through a cascade ends up with the same sky as one that
// ran through it. The HTTP spec can't arrange two orbits to meet, so this
// drives the server's own code against throwaway databases, with the clock
// passed in.

// no derelicts unless a test asks for them: they're placed at random
process.env.DERELICTS = "0";

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

// A server with its own empty database.
async function freshServer() {
  const dir = mkdtempSync(join(tmpdir(), "kessler-collide-"));
  dirs.push(dir);
  process.env.DATABASE_PATH = join(dir, "app.db");
  execFileSync(process.execPath, ["scripts/migrate.mjs"], { env: process.env });
  vi.resetModules();
  const sky = await import("../src/lib/sky.ts");
  const events = await import("../src/lib/events.ts");
  const operators = await import("../src/lib/operators.ts");
  const { db, schema } = await import("../src/db/index.ts");
  const heard: SkyEvent[] = [];
  events.subscribe((event) => heard.push(event));
  return { sky, heard, operators, db, schema };
}

const HOUR = 3_600_000;
// in the future, so the server's own wake-up timers never fire mid-test
const T = Date.now() + 10 * 24 * HOUR;
const orbit = (radius: number, phase: number, direction: 1 | -1, epoch = T): Elements => ({
  radius,
  phase,
  period: Math.round(periodAt(radius)),
  epoch,
  direction,
});

// a repeatable stand-in for Math.random
function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

describe("a collision, on the server", async () => {
  const { sky, heard } = await freshServer();
  const a = sky.addDerelict(orbit(1.3, 0, 1), T);
  const b = sky.addDerelict(orbit(1.3 + HIT.headOn / 2, 2, -1), T);
  // most meetings miss: the pair's ids say which one hits
  const at = Math.round(nextMeeting(a, b, T, fatalMeeting(a, b))!);

  it("is announced to everyone before it happens", () => {
    const conjunction = heard.find((e) => e.type === "conjunction");
    expect(conjunction).toMatchObject({ type: "conjunction", conjunction: { a: a.id, b: b.id, at } });
    expect(sky.conjunctions(T).map((c) => [c.a, c.b, c.at])).toEqual([[a.id, b.id, at]]);
  });

  it("hasn't happened a moment before", () => {
    expect(sky.settle(at - 1).collisions).toHaveLength(0);
    expect(sky.liveSky(at - 1).map((o) => o.id)).toEqual([a.id, b.id]);
  });

  it("destroys both when its time comes, and leaves fragments that trace back to it", () => {
    const [collision] = sky.settle(at + 1).collisions;
    expect(collision).toMatchObject({ at, a: a.id, b: b.id });

    const rows = sky.catalogue("all", undefined);
    for (const id of [a.id, b.id]) expect(rows.find((o) => o.id === id)).toMatchObject({ fate: "destroyed", fateAt: at });
    const fragments = rows.filter((o) => o.kind === "debris");
    expect(fragments).toHaveLength(2 * FRAGMENTS.perObject);
    for (const fragment of fragments) {
      expect(fragment).toMatchObject({ fate: "live", sourceCollision: collision.id, epoch: at, launchedAt: at });
    }
  });

  it("tells everyone what collided, with both beacons, and the fragments", () => {
    const event = heard.find((e) => e.type === "collision");
    if (event?.type !== "collision") throw new Error("no collision event");
    expect(event.collision.objects.map((o) => o.id)).toEqual([a.id, b.id]);
    expect(event.collision.fragments).toHaveLength(2 * FRAGMENTS.perObject);
  });

  it("happens once, however often it's asked, and its fragments never hit each other", () => {
    const before = heard.filter((e) => e.type === "collision").length;
    expect(sky.settle(at + 6 * HOUR).collisions).toHaveLength(0);
    expect(heard.filter((e) => e.type === "collision").length).toBe(before);
    expect(sky.collisionLog()).toHaveLength(1);
  });
});

describe("a cascade while the server was stopped", () => {
  // forty dead satellites crowded into one thin shell, going both ways
  const random = seeded(42);
  const crowd = Array.from({ length: 40 }, () =>
    orbit(1.3 + (random() - 0.5) * 0.06, random() * 2 * Math.PI, random() < 0.5 ? 1 : -1),
  );
  const end = T + 2 * HOUR;

  async function run(step: number | null) {
    const { sky } = await freshServer();
    for (const o of crowd) sky.addDerelict(o, T);
    if (step === null) sky.settle(end);
    else for (let t = T; t <= end; t += step) sky.settle(t);
    sky.settle(end);
    const record = sky
      .catalogue("all", undefined)
      .map(({ id, kind, fate, fateAt, sourceCollision, radius, phase, direction }) => ({
        id,
        kind,
        fate,
        fateAt,
        sourceCollision,
        radius,
        phase,
        direction,
      }));
    return { record, collisions: sky.collisionLog() };
  }

  it("ends with the same sky as a server that ran through it", async () => {
    const stopped = await run(null);
    const running = await run(5_000);
    // a real cascade: debris hit something
    const debris = new Set(stopped.record.filter((o) => o.kind === "debris").map((o) => o.id));
    expect(stopped.collisions.some((c) => debris.has(c.a) || debris.has(c.b))).toBe(true);
    expect(running.collisions).toEqual(stopped.collisions);
    expect(running.record).toEqual(stopped.record);
    // two hours of sky stepped through 1,440 times: about three seconds
    // alone, more with the whole suite running beside it
  }, 20_000);
});

describe("derelicts", async () => {
  const { sky, heard } = await freshServer();

  it("top the sky up to the baseline, arriving as launches by nobody", () => {
    sky.keepDerelicts(T, 5);
    const live = sky.liveSky(T);
    expect(live.filter((o) => o.kind === "derelict")).toHaveLength(5);
    expect(live.every((o) => o.owner === null)).toBe(true);
    const launches = heard.filter((e) => e.type === "launch");
    expect(launches).toHaveLength(5);
    sky.keepDerelicts(T + 1, 5);
    expect(sky.liveSky(T + 1).filter((o) => o.kind === "derelict")).toHaveLength(5);
  });
});

describe("who a collision names (ADR 0010)", async () => {
  const { sky, heard, operators, db, schema } = await freshServer();
  // satellites on chosen orbits, as if launched (a launch's orbit is random)
  const put = (values: Partial<typeof schema.objects.$inferInsert> & Elements) => {
    const row = db
      .insert(schema.objects)
      .values({ kind: "satellite", band: "low", launchedAt: values.epoch, ...values })
      .returning()
      .get();
    return { ...row, kind: "satellite" as const, direction: values.direction };
  };
  const alpha = put({ owner: "alice", callsign: "ALPHA", beacon: "hello from alpha", ...orbit(1.3, 0, 1) });
  const bravo = put({ owner: "bob", callsign: "BRAVO", beacon: "bravo here", ...orbit(1.3 + HIT.headOn / 2, 2, -1) });
  const at = Math.round(nextMeeting(alpha, bravo, T, fatalMeeting(alpha, bravo))!);
  const collisions = () => heard.flatMap((e) => (e.type === "collision" ? [e.collision] : []));

  it("names both, with their beacons and their operators' handles, as a couplet", async () => {
    // the hit is predicted first; then bob claims a handle (ADR 0009) and
    // alice doesn't, and the collision names them as they are by then
    expect(sky.conjunctions(T).map((c) => c.at)).toEqual([at]);
    const claimed = await operators.claim("bob", { action: "claim", handle: "bravo_ops", passphrase: "long enough" }, "test");
    expect(claimed.ok).toBe(true);
    sky.settle(at + 1);
    const [collision] = collisions();
    expect(collision.parties).toEqual([
      { id: alpha.id, kind: "satellite", callsign: "ALPHA", beacon: "hello from alpha", words: null, question: null, operator: null, from: null },
      { id: bravo.id, kind: "satellite", callsign: "BRAVO", beacon: "bravo here", words: null, question: null, operator: "bravo_ops", from: null },
    ]);
  });

  // ADR 0017: the wreck keeps both lines' words
  it("breaks both beacons into the fragments: every word of each, once", () => {
    const [collision] = collisions();
    const carried = collision.fragments.flatMap((f) => (f.words ? wordsOf(f.words) : []));
    expect(carried.sort()).toEqual([...wordsOf("hello from alpha"), ...wordsOf("bravo here")].sort());
    // and says so, in order, as the collision is told
    expect(collision.wreck.map((piece) => piece.words)).toEqual(collision.fragments.flatMap((f) => (f.words ? [f.words] : [])));
    expect(collision.wreck.every((piece) => piece.up)).toBe(true);
  });

  it("passes the blame for debris back to the satellites it came from", () => {
    // a third satellite at a fragment's height, going the other way: the
    // fragment (or one of its siblings) hits it
    const [first] = collisions();
    const fragment = first.fragments[0];
    const start = at + 1;
    const charlie = put({
      owner: "carol",
      callsign: "CHARLIE",
      beacon: "minding my own business",
      ...orbit(radiusAt(fragment, start), angleAt(fragment, start) + 1, fragment.direction === 1 ? -1 : 1, start),
    });
    sky.settle(start + 6 * HOUR);
    const hit = collisions().find((c) => c.parties.some((p) => p.id === charlie.id));
    expect(hit, "nothing hit CHARLIE").toBeDefined();
    const debris = hit!.parties.find((p) => p.id !== charlie.id)!;
    expect(debris.kind).toBe("debris");
    expect(debris.from!.map((p) => [p.callsign, p.operator])).toEqual([
      ["ALPHA", null],
      ["BRAVO", "bravo_ops"],
    ]);
    // the cascade carries the words on (ADR 0017): CHARLIE's fragments carry
    // CHARLIE's line and what the debris that hit it was carrying
    const carried = hit!.fragments.flatMap((f) => (f.words ? wordsOf(f.words) : []));
    for (const word of wordsOf("minding my own business")) expect(carried).toContain(word);
    for (const word of wordsOf(debris.words ?? "")) expect(carried).toContain(word);
  });

  // ADR 0012: where an object came from, and what followed it
  it("keeps each object's history: what it met, and what its debris went on to destroy", () => {
    const now = at + 6 * HOUR;
    const charlie = collisions().find((c) => c.parties.some((p) => p.callsign === "CHARLIE"))!;
    const charlieId = charlie.parties.find((p) => p.callsign === "CHARLIE")!.id;
    // every fragment downstream of ALPHA: its roots include it
    const descended = sky
      .catalogue("all", undefined)
      .filter((o) => o.kind === "debris" && o.from!.some((root) => root.id === alpha.id));

    const history = sky.historyOf(alpha.id, "someone else", now)!;
    expect(history).toMatchObject({ callsign: "ALPHA", fate: "destroyed", fateAt: at, handle: null, mine: false });
    // what the wreck says, some of it fallen silent by now
    expect(history.end!.wreck.map((piece) => piece.words).join(" ")).toContain("alpha");
    // gone, so its beacon is read in full
    expect(history.beacon).toBe("hello from alpha");
    expect(history.end).toMatchObject({ at, with: { id: bravo.id, callsign: "BRAVO" } });
    expect(history.origin).toBeNull();
    expect(history.followed.left).toBe(collisions()[0].fragments.length);
    expect(history.followed.fragments).toBe(descended.length);
    expect(history.followed.up).toBe(descended.filter((o) => o.fate === "live").length);
    expect(history.followed.collisions).toBeGreaterThanOrEqual(1);
    expect(history.followed.destroyed.map((o) => o.callsign)).toContain("CHARLIE");

    // the fragment that hit CHARLIE came from ALPHA and BRAVO's collision
    const debris = charlie.parties.find((p) => p.id !== charlieId)!;
    const fragment = sky.historyOf(debris.id, undefined, now)!;
    expect(fragment.kind).toBe("debris");
    // what it carries: a piece of both lines
    expect(fragment.words).toBe(debris.words);
    expect(fragment.origin!.parties.map((p) => p.id)).toEqual([alpha.id, bravo.id]);
    expect(fragment.origin!.roots.map((r) => r.callsign)).toEqual(["ALPHA", "BRAVO"]);
    expect(fragment.end!.with.id).toBe(charlieId);

    // CHARLIE was destroyed by debris, not by anything it did
    const victim = sky.historyOf(charlieId, undefined, now)!;
    expect(victim.end!.with.from!.map((r) => r.callsign)).toEqual(["ALPHA", "BRAVO"]);
    expect(victim.followed.destroyed.map((o) => o.callsign)).not.toContain("ALPHA");
    expect(sky.historyOf(999_999, undefined, now)).toBeNull();
  });

  it("leaves each owner an encounter: who they met, what that side said, and what the wreck says", () => {
    const now = at + 6 * HOUR;
    const [met] = sky.encountersOf("alice", now);
    expect(met).toMatchObject({ yours: { id: alpha.id, callsign: "ALPHA" }, other: { id: bravo.id, callsign: "BRAVO", beacon: "bravo here", operator: "bravo_ops" } });
    expect(met.wreck.length).toBeGreaterThan(0);
    // bob sees the same meeting from his side
    expect(sky.encountersOf("bob", now)[0]).toMatchObject({ yours: { id: bravo.id }, other: { id: alpha.id, beacon: "hello from alpha" } });
    // carol's satellite was destroyed by debris, carrying what it carried
    // (two short lines over six fragments leave some of them silent)
    const [hit] = sky.encountersOf("carol", now);
    expect(hit.other.kind).toBe("debris");
    expect(hit.other.words).toBe(sky.historyOf(hit.other.id, undefined, now)!.words);
    expect(hit.other.from!.map((r) => r.callsign)).toEqual(["ALPHA", "BRAVO"]);
    expect(sky.encountersOf("nobody", now)).toEqual([]);
  });

  it("withholds a flying satellite's beacon from everyone but its owner", () => {
    const now = at + 6 * HOUR;
    const delta = put({ owner: "dave", callsign: "DELTA", beacon: "still up here", ...orbit(2.4, 0, 1, now) });
    const theirs = sky.historyOf(delta.id, "someone else", now)!;
    expect(theirs).toMatchObject({ fate: "live", beacon: null, withheld: true, end: null });
    // the next of the three ground stations it reaches (ADR 0014)
    expect(theirs.nextPass!.at).toBeGreaterThan(now);
    expect(["Canberra", "Goldstone", "Madrid"]).toContain(theirs.nextPass!.station);
    expect(theirs.reentryAt).toBeGreaterThan(theirs.nextPass!.at);
    expect(theirs.followed).toEqual({ left: 0, collisions: 0, fragments: 0, up: 0, destroyed: [] });
    expect(sky.historyOf(delta.id, "dave", now)).toMatchObject({ beacon: "still up here", withheld: false, mine: true });
  });
});

// ADR 0018: two answers to the same question that collide are told as such
describe("two answers that collide", async () => {
  const { sky, db, schema } = await freshServer();
  const put = (owner: string, question: string, values: Elements) =>
    db
      .insert(schema.objects)
      .values({ kind: "satellite", owner, callsign: owner.toUpperCase(), beacon: `${owner}'s answer`, question, band: "low", launchedAt: values.epoch, ...values })
      .returning()
      .get();
  // the same height, opposite ways: dead centre, so their first meeting hits
  const a = { ...put("ann", "Who do you wish were listening?", orbit(1.33, 0, 1)), kind: "satellite" as const, direction: 1 as const };
  const b = { ...put("ben", "Who do you wish were listening?", orbit(1.33, 2, -1)), kind: "satellite" as const, direction: -1 as const };

  it("keeps the question each was answering, so the collision can say so", () => {
    const at = Math.round(nextMeeting(a, b, T, fatalMeeting(a, b))!);
    sky.settle(at + 1);
    const [story] = sky.recentCollisions(1);
    expect(story.parties.map((p) => p.question)).toEqual(["Who do you wish were listening?", "Who do you wish were listening?"]);
    expect(sharedQuestion(story.parties)).toBe("Who do you wish were listening?");
  });
});

describe("a collision staged over a station", async () => {
  const { sky } = await freshServer();
  const { STATIONS } = await import("../src/lib/stations.ts");

  it("puts two derelicts on a head-on course to meet over a ground station soon, when nothing else is coming", () => {
    const staged = sky.stageCollision(T);
    expect(staged).not.toBeNull();
    expect(staged!.at - T).toBeGreaterThan(10_000);
    expect(staged!.at - T).toBeLessThan(60_000);
    const off = (angle: number) => Math.abs(Math.atan2(Math.sin(staged!.angle - angle), Math.cos(staged!.angle - angle)));
    expect(Math.min(...STATIONS.map((s) => off(s.angle)))).toBeLessThan(0.05);
    const up = sky.liveSky(T);
    expect(up.filter((o) => o.kind === "derelict").map((o) => o.id).sort()).toEqual([staged!.a, staged!.b].sort());
  });

  it("doesn't stage another while one is coming, or soon after", () => {
    expect(sky.stageCollision(T + 1)).toBeNull();
    const after = sky.conjunctions(T)[0].at + 1;
    sky.settle(after);
    expect(sky.stageCollision(after + 60_000)).toBeNull();
    expect(sky.stageCollision(after + sky.STAGE.every)).not.toBeNull();
  });
});

describe("a collision staged over another station", async () => {
  const { sky } = await freshServer();
  const { STATIONS } = await import("../src/lib/stations.ts");

  it("can meet over Goldstone or Madrid, not only Canberra (ADR 0014)", () => {
    // the first draw picks the way round, the second the station
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      const staged = sky.stageCollision(T)!;
      const goldstone = STATIONS.find((s) => s.id === "goldstone")!;
      expect(Math.abs(Math.atan2(Math.sin(staged.angle - goldstone.angle), Math.cos(staged.angle - goldstone.angle)))).toBeLessThan(0.05);
    } finally {
      random.mockRestore();
    }
  });
});
