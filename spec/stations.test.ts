import { describe, expect, it } from "vitest";
import { burnAt, periodAt, type Orbit } from "../src/lib/orbit.ts";
import { OVERHEAD_HALF_WIDTH, STATIONS, isOverhead, nextStation, stationOver, untilStation } from "../src/lib/stations.ts";

// The ground stations (ADR 0013): three, at the Deep Space Network's sites,
// all heard by everyone. A satellite in any station's window is overhead.
// Pure maths, so it runs without the app.

const TAU = 2 * Math.PI;
const deg = (radians: number) => (radians * 180) / Math.PI;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const byId = Object.fromEntries(STATIONS.map((s) => [s.id, s]));

// an orbit at the low band's middle that is at `angle` at time 0
const at = (angle: number, direction: 1 | -1 = 1): Orbit => ({
  radius: 1.3,
  phase: angle,
  period: Math.round(periodAt(1.3)),
  epoch: 0,
  direction,
});

describe("the ground stations", () => {
  it("are Canberra, Goldstone and Madrid, with Canberra at the top where the launchpad is", () => {
    expect(STATIONS.map((s) => s.name)).toEqual(["Canberra", "Goldstone", "Madrid"]);
    expect(byId.canberra.angle).toBeCloseTo(Math.PI / 2, 6);
  });

  it("sit where their real sites fall on the chart's plane, with no windows overlapping", () => {
    expect(deg(wrap(byId.goldstone.angle))).toBeCloseTo(-23.1, 0);
    expect(deg(wrap(byId.madrid.angle))).toBeCloseTo(-105.5, 0);
    const angles = STATIONS.map((s) => s.angle);
    for (let i = 0; i < angles.length; i++) {
      for (let j = i + 1; j < angles.length; j++) {
        expect(Math.abs(wrap(angles[i] - angles[j]))).toBeGreaterThan(2 * OVERHEAD_HALF_WIDTH);
      }
    }
  });

  it("hear a satellite in any station's window, and name the station", () => {
    for (const station of STATIONS) {
      const over = at(station.angle + OVERHEAD_HALF_WIDTH * 0.9);
      expect(isOverhead(over, 0)).toBe(true);
      expect(stationOver(over, 0)?.id).toBe(station.id);
    }
    // halfway between Goldstone and Canberra, nowhere
    const between = at((byId.goldstone.angle + byId.canberra.angle) / 2);
    expect(isOverhead(between, 0)).toBe(false);
    expect(stationOver(between, 0)).toBeNull();
  });

  it("say which station a satellite reaches next, and when, whichever way it goes", () => {
    // just past Canberra's window, going anticlockwise: Madrid is next, the
    // long way round (anticlockwise from 90° is 90° → 180° → 254.5°)
    const leaving = at(byId.canberra.angle + OVERHEAD_HALF_WIDTH + 0.01);
    const next = nextStation(leaving, 0)!;
    expect(next.station.id).toBe("madrid");
    expect(isOverhead(leaving, next.in - 50)).toBe(false);
    expect(stationOver(leaving, next.in + 50)?.id).toBe("madrid");

    // the same place, going clockwise: Goldstone is next
    const back = at(byId.canberra.angle - OVERHEAD_HALF_WIDTH - 0.01, -1);
    const other = nextStation(back, 0)!;
    expect(other.station.id).toBe("goldstone");
    expect(stationOver(back, other.in + 50)?.id).toBe("goldstone");
  });

  it("finds the first window it enters, within a lap, from anywhere", () => {
    for (const direction of [1, -1] as const) {
      for (let a = 0; a < TAU; a += 0.1) {
        const orbit = at(a, direction);
        if (stationOver(orbit, 0)) continue;
        const next = nextStation(orbit, 0)!;
        expect(next.in).toBeLessThan(orbit.period);
        expect(stationOver(orbit, next.in + 50)?.id).toBe(next.station.id);
        // nothing heard on the way
        for (let t = 0; t < next.in - 50; t += 500) expect(stationOver(orbit, t)).toBeNull();
      }
    }
  });

  it("says nothing comes for an orbit that's already burning up", () => {
    // below the top of the atmosphere: in its last plunge
    const falling = { ...at(byId.canberra.angle + 1), radius: 1.05 };
    expect(nextStation(falling, 0)).toBeNull();
  });

  it("is right in a satellite's last laps, as its period shortens: never negative, never a pass that doesn't happen", () => {
    let seed = 11;
    const random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let i = 0; i < 400; i++) {
      const radius = 1.065 + random() * 0.03;
      const orbit = { ...at(random() * TAU, random() < 0.5 ? 1 : -1), radius, period: Math.round(periodAt(radius)) };
      const time = random() * (burnAt(orbit) - orbit.epoch);
      for (const station of STATIONS) {
        const ms = untilStation(orbit, time, station);
        // where it next comes into this station's window, by brute force
        let entry: number | null = null;
        let inside = stationOver(orbit, time)?.id === station.id;
        for (let t = time; t < burnAt(orbit); t += 20) {
          const now = stationOver(orbit, t)?.id === station.id;
          if (now && !inside) {
            entry = t - time;
            break;
          }
          inside = now;
        }
        if (entry === null) expect(ms, "a pass that never happens").toBeNull();
        else {
          expect(ms).not.toBeNull();
          expect(ms!).toBeGreaterThanOrEqual(0);
          expect(Math.abs(ms! - entry)).toBeLessThan(50);
        }
      }
    }
  });
});
