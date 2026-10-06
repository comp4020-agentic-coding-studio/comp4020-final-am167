export interface DurationSummary {
  count: number;
  minimum: number;
  mean: number;
  median: number;
  p95: number;
  maximum: number;
}

export interface CadenceSummary extends DurationSummary {
  sampleCount: number;
  refreshIntervalMilliseconds: number;
  effectiveFramesPerSecond: number;
  missedFrameCount: number;
  missedFrameRatio: number;
}

export interface RenderCostSample {
  megapixels: number;
  milliseconds: number;
}

export interface RenderCostFit {
  millisecondsPerMegapixel: number;
  fixedMilliseconds: number;
  rSquared: number;
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.max(0, Math.ceil(fraction * sorted.length) - 1);
  return sorted[Math.min(rank, sorted.length - 1)];
}

export function summarizeDurations(
  samples: readonly number[],
): DurationSummary {
  if (samples.length === 0) {
    return {
      count: 0,
      minimum: 0,
      mean: 0,
      median: 0,
      p95: 0,
      maximum: 0,
    };
  }

  const sorted = [...samples].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];

  return {
    count: sorted.length,
    minimum: sorted[0],
    mean: sorted.reduce((total, value) => total + value, 0) / sorted.length,
    median,
    p95: percentile(sorted, 0.95),
    maximum: sorted[sorted.length - 1],
  };
}

export function summarizeCadence(
  frameIntervals: readonly number[],
  refreshIntervalMilliseconds: number,
): CadenceSummary {
  const durations = summarizeDurations(frameIntervals);
  const missedFrameCount = frameIntervals.filter(
    (duration) => duration > refreshIntervalMilliseconds * 1.5,
  ).length;

  return {
    ...durations,
    sampleCount: frameIntervals.length,
    refreshIntervalMilliseconds,
    effectiveFramesPerSecond:
      durations.median > 0 ? 1000 / durations.median : 0,
    missedFrameCount,
    missedFrameRatio:
      frameIntervals.length > 0 ? missedFrameCount / frameIntervals.length : 0,
  };
}

export function totalBlockingTime(longTaskDurations: readonly number[]): number {
  return longTaskDurations.reduce(
    (total, duration) => total + Math.max(0, duration - 50),
    0,
  );
}

export function fitRenderCost(
  samples: readonly RenderCostSample[],
): RenderCostFit {
  if (samples.length < 2) {
    throw new Error("At least two GPU stress samples are required");
  }

  const meanX =
    samples.reduce((total, sample) => total + sample.megapixels, 0) /
    samples.length;
  const meanY =
    samples.reduce((total, sample) => total + sample.milliseconds, 0) /
    samples.length;
  const sumSquaresX = samples.reduce(
    (total, sample) => total + (sample.megapixels - meanX) ** 2,
    0,
  );
  if (sumSquaresX === 0) {
    throw new Error("GPU stress samples must use different drawing-buffer sizes");
  }

  const covariance = samples.reduce(
    (total, sample) =>
      total +
      (sample.megapixels - meanX) * (sample.milliseconds - meanY),
    0,
  );
  const millisecondsPerMegapixel = covariance / sumSquaresX;
  const fixedMilliseconds = meanY - millisecondsPerMegapixel * meanX;
  const residualSquares = samples.reduce((total, sample) => {
    const predicted =
      fixedMilliseconds + millisecondsPerMegapixel * sample.megapixels;
    return total + (sample.milliseconds - predicted) ** 2;
  }, 0);
  const totalSquares = samples.reduce(
    (total, sample) => total + (sample.milliseconds - meanY) ** 2,
    0,
  );

  return {
    millisecondsPerMegapixel,
    fixedMilliseconds,
    rSquared: totalSquares === 0 ? 1 : 1 - residualSquares / totalSquares,
  };
}

// Neither scene caps its drawing buffer by pixel count (only the device pixel
// ratio, at 2), so predictions are made at the buffer a profile actually
// allocated rather than at one fixed cap.
export function predictRenderMilliseconds(
  fit: RenderCostFit,
  drawingPixels: number,
): number {
  return fit.fixedMilliseconds + fit.millisecondsPerMegapixel * (drawingPixels / 1_000_000);
}

export function estimateRenderDutyCycle(
  renderMilliseconds: number,
  refreshRateHz: number,
): number {
  return (renderMilliseconds * refreshRateHz) / 10;
}
