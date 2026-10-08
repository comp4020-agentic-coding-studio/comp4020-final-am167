import { describe, expect, it } from "vitest";
import { bandNow, momentsOf, plain, summaryOf, tracedTo } from "../src/lib/chronicle.ts";
import { periodAt } from "../src/lib/orbit.ts";
import type { History, Party, Step } from "../src/lib/sky.ts";

// How an object's card tells its story (src/lib/chronicle.ts), against
// made-up histories: the cases a staged sky rarely reaches. Written from
// the adversarial review of the redesigned card (2026-10-08). Pure wording,
// so it runs without the app; spec/collision-server.test.ts tells real
// staged collisions.

const T = 1_800_000_000_000;
const HOUR = 3_600_000;
let ids = 100;

const satellite = (callsign: string | null, beacon: string | null, operator: string | null = null): Party => ({
  id: ++ids,
  kind: "satellite",
  callsign,
  beacon,
  words: null,
  question: null,
  echoOf: null,
  operator,
  from: null,
});
const derelict = (words: string | null = null, echoOf: string | null = null): Party => ({
  id: ++ids,
  kind: "derelict",
  callsign: null,
  beacon: null,
  words,
  question: null,
  echoOf,
  operator: null,
  from: null,
});
const debris = (words: string | null, ...roots: Party[]): Party => ({
  id: ++ids,
  kind: "debris",
  callsign: null,
  beacon: null,
  words,
  question: null,
  echoOf: null,
  operator: null,
  from: roots.map(({ id, kind, callsign, operator }) => ({ id, kind, callsign, operator })),
});
const step = (collision: number, at: number, parties: [Party, Party], sources: [number | null, number | null] = [null, null]): Step => ({
  collision,
  at,
  parties,
  sources,
});

function history(over: Partial<History>): History {
  return {
    id: ++ids,
    kind: "debris",
    callsign: null,
    band: "low",
    launchedAt: T,
    handle: null,
    mine: false,
    fate: "live",
    fateAt: null,
    beacon: null,
    withheld: false,
    heard: { by: 0, passes: 0 },
    nextPass: null,
    reentryAt: T + HOUR,
    orbit: null,
    deorbitedAt: null,
    boosts: 0,
    manoeuvres: [],
    words: null,
    echoOf: null,
    question: null,
    origin: null,
    ancestry: [],
    end: null,
    followed: { left: 0, collisions: 0, fragments: 0, up: 0, destroyed: [] },
    ...over,
  };
}

const told = (h: History, now = T + HOUR) => momentsOf(h).map((m) => m.lines.map((line) => plain(line, now)));

describe("an object's card", () => {
  it("tells two derelicts apart, and says which one was carrying words", () => {
    const one = derelict(null);
    const two = derelict("I was here for a while.", "LANTERN");
    const tail = debris(null, one, two);
    const moth = satellite("MOTH", "every bird I've seen");
    const h = history({
      origin: { collision: 2, at: T, parties: [tail, moth], roots: [...tail.from!, { id: moth.id, kind: "satellite", callsign: "MOTH", operator: null }], left: 3, index: 0 },
      ancestry: [step(1, T - HOUR, [one, two]), step(2, T, [tail, moth], [1, null])],
    });
    const [first, second] = told(h);
    expect(first).toEqual([
      "Two derelicts collided.",
      "Derelicts are dead satellites nobody owns. One was carrying LANTERN's last words: “I was here for a while.”",
    ]);
    expect(second[0]).toBe("Debris from that collision hit MOTH and destroyed it.");
    // both carrying words
    const both = history({ ancestry: [step(1, T, [derelict("a", "ONE"), derelict("b", "TWO")])] });
    expect(told(both)[0].slice(1)).toEqual([
      "Derelicts are dead satellites nobody owns. One was carrying ONE's last words: “a”.",
      "The other was carrying TWO's last words: “b”.",
    ]);
  });

  it("calls a derelict met before 'another derelict'", () => {
    const [a, b, c] = [derelict(), satellite("ALPHA", "hi"), derelict()];
    const tail = debris(null, a, b);
    const h = history({ ancestry: [step(1, T - HOUR, [b, a]), step(2, T, [tail, c], [1, null])] });
    const [first, second] = told(h);
    expect(first[0]).toBe("ALPHA and a derelict collided.");
    expect(second[0]).toBe("Debris from that collision hit another derelict and destroyed it.");
  });

  it("never lets 'the derelict' mean itself, on a derelict's own card", () => {
    const other = derelict("so long", "EMBER");
    const h = history({
      kind: "derelict",
      fate: "destroyed",
      fateAt: T,
      end: { collision: 5, at: T, with: other, wreck: [] },
      followed: { left: 6, collisions: 0, fragments: 6, up: 6, destroyed: [] },
    });
    const end = told(h)[1];
    expect(end[0]).toBe("It collided with another derelict. Both were destroyed.");
    expect(end).toContain("The other derelict was carrying EMBER's last words: “so long”.");
  });

  it("says what the debris was carrying, not 'it', when debris destroys a satellite", () => {
    const hit = debris("nominal", satellite("WATTLE", "x"), derelict());
    const h = history({
      kind: "satellite",
      callsign: "T-KIAGOB",
      beacon: "back to the sky",
      fate: "destroyed",
      fateAt: T,
      end: { collision: 9, at: T, with: hit, wreck: [{ id: 1, words: "back", up: true }] },
      followed: { left: 3, collisions: 0, fragments: 3, up: 3, destroyed: [] },
    });
    const end = told(h)[1];
    expect(end[0]).toBe("Hit by debris and destroyed.");
    expect(end).toContain("The debris was carrying “nominal”.");
    expect(end.join(" ")).not.toMatch(/\bIt was carrying/);
  });

  it("doesn't put a full stop after a line that ends in its own", () => {
    const h = history({ ancestry: [step(1, T, [satellite("SOL", "Radio may crackle."), satellite("ASK", "anyone there?")])] });
    expect(told(h)[0]).toEqual([
      "SOL and ASK collided.",
      "SOL was launched without a handle. Its beacon said “Radio may crackle.”",
      "ASK was launched without a handle. Its beacon said “anyone there?”",
    ]);
  });

  it("says how many of a wreck's fragments carry words", () => {
    const end = (left: number, carrying: number) =>
      told(
        history({
          kind: "satellite",
          callsign: "X",
          fate: "destroyed",
          fateAt: T,
          end: { collision: 1, at: T, with: satellite("Y", null), wreck: Array.from({ length: carrying }, (_, i) => ({ id: i + 1, words: "w", up: true })) },
          followed: { left, collisions: 0, fragments: left, up: left, destroyed: [] },
        }),
      )[1].at(-1);
    expect(end(6, 1)).toBe("The collision left 6 fragments; 1 carries words:");
    expect(end(6, 2)).toBe("The collision left 6 fragments; 2 carry words:");
    expect(end(3, 3)).toBe("The collision left 3 fragments. The words they carry:");
    expect(end(3, 0)).toBe("The collision left 3 fragments, carrying no words.");
  });

  it("explains the join between two lines' pieces, once", () => {
    const h = history({
      kind: "satellite",
      callsign: "X",
      fate: "destroyed",
      fateAt: T,
      end: { collision: 1, at: T, with: satellite("Y", "b c"), wreck: [{ id: 1, words: "a … b", up: true }, { id: 2, words: "c … d", up: true }] },
      followed: { left: 2, collisions: 0, fragments: 2, up: 2, destroyed: [] },
    });
    const lines = told(h).flat();
    expect(lines.filter((line) => line.includes("“…” joins")).length).toBe(1);
  });

  it("shows where a long cascade began, folds the middle, and never folds a single step", () => {
    const chain = (n: number) => {
      const steps: Step[] = [step(1, T, [satellite("S1", "a"), satellite("S2", "b")])];
      for (let i = 2; i <= n; i++) steps.push(step(i, T + i * HOUR, [debris(null), satellite(`S${i + 1}`, "c")], [i - 1, null]));
      return history({ ancestry: steps, launchedAt: T + n * HOUR, origin: { collision: n, at: T + n * HOUR, parties: steps[n - 1].parties, roots: [], left: 3, index: 0 } });
    };
    const kinds = (h: History) => momentsOf(h).map((m) => m.kind);
    expect(kinds(chain(5))).toEqual(["past", "past", "past", "past", "past", "this", "now"]);
    const long = momentsOf(chain(7));
    expect(long.map((m) => m.kind)).toEqual(["past", "gap", "past", "past", "past", "this", "now"]);
    expect(plain(long[0].lines[0], T)).toBe("S1 and S2 collided.");
    expect(plain(long[1].lines[0], T)).toBe("Then 3 more collisions in the chain.");
    // the step after the fold came from a collision that isn't shown
    expect(plain(long[2].lines[0], T)).toBe("Debris from an earlier collision hit S6 and destroyed it.");
  });

  it("lists who a lineage traces back to oldest first, the derelicts counted together", () => {
    const [a, b] = [satellite("FIRST", "x", "ann"), satellite("SECOND", "y")];
    const [d1, d2] = [derelict(), derelict()];
    const c = satellite("LAST", "z");
    const h = history({
      ancestry: [step(1, T, [a, b]), step(2, T + 1, [debris(null), d1], [1, null]), step(3, T + 2, [debris(null), d2], [2, null]), step(4, T + 3, [debris(null), c], [3, null])],
    });
    expect(tracedTo(h)).toEqual([
      { name: "FIRST", whose: "launched by ann" },
      { name: "SECOND", whose: "launched without a handle" },
      { name: "LAST", whose: "launched without a handle" },
      { name: "Two derelicts", whose: "nobody's" },
    ]);
  });

  it("names a satellite without a callsign as a satellite, not debris", () => {
    const h = history({ ancestry: [step(1, T, [satellite(null, null), derelict()])] });
    expect(told(h)[0][0]).toBe("A satellite and a derelict collided.");
  });

  it("gives the band an object is in now, after a boost or as it falls", () => {
    const radius = 1.8;
    const orbit = { radius, phase: 0, period: Math.round(periodAt(radius)), epoch: T, direction: 1 as const, rate: 1, until: null };
    expect(bandNow(history({ band: "low", orbit }), T)).toBe("mid");
    expect(bandNow(history({ band: "high", orbit: null, fate: "decayed" }), T)).toBe("high");
  });

  it("leaves the state of something still up to its chips, and says how something gone ended", () => {
    const up = history({ kind: "satellite", callsign: "UP", launchedAt: T });
    expect(plain(summaryOf(up), T + HOUR)).toBe("Launched without a handle 1 h ago.");
    const gone = history({ kind: "satellite", callsign: "GONE", fate: "decayed", fateAt: T + HOUR });
    expect(plain(summaryOf(gone), T + 2 * HOUR)).toBe("Launched without a handle 2 h ago. Burned up 1 h ago.");
  });
});
