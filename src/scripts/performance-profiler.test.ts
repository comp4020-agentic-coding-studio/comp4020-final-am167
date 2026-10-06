import { describe, expect, it } from "vitest";

import {
  forcesContinuousRendering,
  parsePerformanceProfilerConfig,
} from "./performance-profiler";

describe("performance profiler configuration", () => {
  it("stays absent from the normal site unless the browser runner enables it", () => {
    expect(parsePerformanceProfilerConfig(undefined)).toBeUndefined();
    expect(parsePerformanceProfilerConfig({})).toBeUndefined();
    expect(parsePerformanceProfilerConfig({ enabled: false })).toBeUndefined();
  });

  it("accepts bounded diagnostic overrides", () => {
    expect(
      parsePerformanceProfilerConfig({
        enabled: true,
        drawingPixels: 2_500_000,
        maximumSamples: 80,
      }),
    ).toEqual({
      drawingPixels: 2_500_000,
      maximumSamples: 80,
    });
  });

  it("clamps hostile or accidental values before they reach WebGL", () => {
    expect(
      parsePerformanceProfilerConfig({
        enabled: true,
        drawingPixels: Number.POSITIVE_INFINITY,
        maximumSamples: 50_000,
      }),
    ).toEqual({
      drawingPixels: undefined,
      maximumSamples: 600,
    });
    expect(parsePerformanceProfilerConfig({ enabled: true, drawingPixels: 90_000_000 })?.drawingPixels).toBe(
      40_000_000,
    );
  });
});

describe("saturation probe render override", () => {
  it("keeps the loop running only when the probe forces a drawing buffer", () => {
    expect(
      forcesContinuousRendering({
        drawingPixels: 5_000_000,
        maximumSamples: 240,
      }),
    ).toBe(true);
  });

  it("leaves observation runs measuring the shipped scheduling behaviour", () => {
    // A profile run only watches; it must see the same pausing a reader gets.
    expect(
      forcesContinuousRendering({
        drawingPixels: undefined,
        maximumSamples: 240,
      }),
    ).toBe(false);
    expect(forcesContinuousRendering(undefined)).toBe(false);
  });
});
