import { describe, expect, it } from "vitest";
import { readLaunch } from "../src/lib/launch.ts";
import { HOUR, RESIDENTS, nextSlotAfter, slotsBetween, slotsInHour } from "../src/lib/residents.ts";

// The resident operators' schedule (ADR 0019): a few launches an hour, by a
// varied cast, as a pure function of the clock. What the station launches
// for them has to pass the same rules as anyone's launch.

// a stretch of hours to draw from: a little over a month
const FIRST = Math.floor(Date.UTC(2026, 9, 1) / HOUR);
const HOURS = Array.from({ length: 800 }, (_, i) => FIRST + i);
const all = HOURS.flatMap((hour) => slotsInHour(hour, 3));

describe("the resident operators", () => {
  it("have handles anyone could have claimed, each unique whatever its case", () => {
    const keys = RESIDENTS.map((r) => r.handle.toLowerCase());
    expect(new Set(keys).size).toBe(RESIDENTS.length);
    for (const { handle } of RESIDENTS) expect(handle).toMatch(/^[A-Za-z0-9_-]{3,20}$/);
  });

  it("only launch callsigns and lines a person's launch would be allowed", () => {
    for (const slot of all) {
      const form = new FormData();
      form.set("band", slot.band);
      form.set("callsign", slot.callsign);
      form.set("beacon", slot.beacon);
      const read = readLaunch(form);
      expect(read, `${slot.callsign}: ${slot.beacon}`).toMatchObject({ ok: true });
    }
  });

  it("are a varied cast: every resident launches, in every band, saying different things", () => {
    expect(new Set(all.map((s) => s.handle)).size).toBe(RESIDENTS.length);
    expect(new Set(all.map((s) => s.band))).toEqual(new Set(["low", "mid", "high"]));
    expect(new Set(all.map((s) => s.beacon)).size).toBeGreaterThan(100);
  });

  it("number their satellites in order, so no callsign ever comes round again", () => {
    expect(new Set(all.map((s) => s.callsign)).size).toBe(all.length);
    for (const { handle } of RESIDENTS) {
      const numbers = all.filter((s) => s.handle === handle).map((s) => Number(s.callsign.match(/\d+$/)![0]));
      expect(numbers, handle).toEqual([...numbers].sort((a, b) => a - b));
    }
  });

  it("launch more often for a company than for a hobbyist", () => {
    const launches = (handle: string) => all.filter((s) => s.handle === handle).length;
    expect(launches("Wattlebird-Comms")).toBeGreaterThan(3 * launches("garage_orbital"));
  });

  it("mostly fly low, where they're heard most", () => {
    const low = all.filter((s) => s.band === "low").length / all.length;
    const high = all.filter((s) => s.band === "high").length / all.length;
    expect(low).toBeGreaterThan(0.45);
    expect(high).toBeLessThan(0.2);
  });
});

describe("the schedule", () => {
  it("is the same every time it's worked out", () => {
    expect(slotsInHour(FIRST + 5, 3)).toEqual(slotsInHour(FIRST + 5, 3));
    expect(slotsInHour(FIRST + 5, 3)).not.toEqual(slotsInHour(FIRST + 6, 3));
  });

  it("brings about `rate` launches an hour, some hours none, never one resident twice in an hour", () => {
    const counts = HOURS.map((hour) => slotsInHour(hour, 3).length);
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    expect(mean).toBeGreaterThan(2.7);
    expect(mean).toBeLessThan(3.3);
    expect(counts).toContain(0);
    expect(Math.max(...counts)).toBeGreaterThanOrEqual(6);
    for (const hour of HOURS) {
      const handles = slotsInHour(hour, 3).map((s) => s.handle);
      expect(new Set(handles).size).toBe(handles.length);
    }
  });

  it("puts each launch inside its hour, in time order", () => {
    for (const hour of HOURS.slice(0, 50)) {
      const slots = slotsInHour(hour, 3);
      for (const slot of slots) {
        expect(slot.at).toBeGreaterThanOrEqual(hour * HOUR);
        expect(slot.at).toBeLessThan((hour + 1) * HOUR);
      }
      expect(slots.map((s) => s.at)).toEqual(slots.map((s) => s.at).sort((a, b) => a - b));
    }
  });

  it("launches nothing at a rate of 0", () => {
    expect(HOURS.flatMap((hour) => slotsInHour(hour, 0))).toEqual([]);
    expect(nextSlotAfter(FIRST * HOUR, 0)).toBe(Infinity);
  });

  it("finds the launches in a stretch of time, after its start and up to its end", () => {
    const from = FIRST * HOUR + 17 * 60_000;
    const to = from + 5 * HOUR;
    const found = slotsBetween(from, to, 3);
    const expected = all.filter((s) => s.at > from && s.at <= to);
    expect(found).toEqual(expected);
    expect(slotsBetween(found[0].at, to, 3)).toEqual(expected.slice(1));
    expect(slotsBetween(from, found[0].at, 3)).toEqual([found[0]]);
  });

  it("knows when the next launch is", () => {
    const from = FIRST * HOUR + 17 * 60_000;
    const next = all.find((s) => s.at > from)!;
    expect(nextSlotAfter(from, 3)).toBe(next.at);
    expect(nextSlotAfter(next.at, 3)).toBe(all.find((s) => s.at > next.at)!.at);
  });
});
