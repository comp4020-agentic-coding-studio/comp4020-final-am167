import { describe, expect, it } from "vitest";

import {
  estimateRenderDutyCycle,
  fitRenderCost,
  predictRenderMilliseconds,
  summarizeCadence,
  summarizeDurations,
  totalBlockingTime,
} from "./report";

describe("performance report calculations", () => {
  it("summarises duration samples without mutating their order", () => {
    const samples = [40, 10, 30, 20];

    expect(summarizeDurations(samples)).toEqual({
      count: 4,
      minimum: 10,
      mean: 25,
      median: 25,
      p95: 40,
      maximum: 40,
    });
    expect(samples).toEqual([40, 10, 30, 20]);
  });

  it("reports frame misses against a separately measured refresh interval", () => {
    const cadence = summarizeCadence([8.2, 8.4, 16.8, 25.1], 8.33);

    expect(cadence.sampleCount).toBe(4);
    expect(cadence.refreshIntervalMilliseconds).toBe(8.33);
    expect(cadence.missedFrameCount).toBe(2);
    expect(cadence.missedFrameRatio).toBe(0.5);
    expect(cadence.effectiveFramesPerSecond).toBeCloseTo(79.365, 2);
  });

  it("computes total blocking time from only the part above 50 ms", () => {
    expect(totalBlockingTime([12, 50, 75, 130])).toBe(105);
  });

  it("fits saturated render cost per megapixel", () => {
    const fit = fitRenderCost([
      { megapixels: 0.5, milliseconds: 2 },
      { megapixels: 1, milliseconds: 3.5 },
      { megapixels: 2, milliseconds: 6.5 },
      { megapixels: 3, milliseconds: 9.5 },
    ]);

    expect(fit.millisecondsPerMegapixel).toBeCloseTo(3, 8);
    expect(fit.fixedMilliseconds).toBeCloseTo(0.5, 8);
    expect(fit.rSquared).toBeCloseTo(1, 8);
  });

  it("predicts render cost at a measured drawing buffer", () => {
    const fit = { millisecondsPerMegapixel: 3, fixedMilliseconds: 0.5, rSquared: 1 };
    expect(predictRenderMilliseconds(fit, 1_250_000)).toBeCloseTo(4.25, 8);
    expect(predictRenderMilliseconds(fit, 1920 * 1080)).toBeCloseTo(6.7208, 4);
  });

  it("expresses render cost as refresh-budget occupancy", () => {
    expect(estimateRenderDutyCycle(7, 120)).toBe(84);
    expect(estimateRenderDutyCycle(7, 60)).toBe(42);
  });
});
