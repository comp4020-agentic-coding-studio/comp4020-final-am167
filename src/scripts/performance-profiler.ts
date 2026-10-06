import type { WebGLRenderer } from "three";

// A diagnostic hook for scripts/performance/run.ts, inert unless that runner
// sets window.__KESSLER_PERFORMANCE_CONFIG__ before the page loads. It counts
// the renders a scene actually issues and, for the GPU saturation probe,
// forces the drawing buffer to a requested size.

export type ProfiledScene = "launchpad" | "sky";

export interface PerformanceProfilerConfig {
  drawingPixels?: number;
  maximumSamples: number;
}

interface PerformanceProfilerRequest {
  enabled?: unknown;
  drawingPixels?: unknown;
  maximumSamples?: unknown;
}

export interface PerformanceProfilerSnapshot {
  version: 1;
  scene: ProfiledScene;
  renderCalls: number;
  commandSubmissionMilliseconds: number[];
  renderFrameIntervals: number[];
  drawingBuffer: {
    cssWidth: number;
    cssHeight: number;
    width: number;
    height: number;
    pixels: number;
    pixelRatio: number;
  };
  webgl: {
    version: string;
    vendor: string;
    renderer: string;
    maximumTextureSize: number;
  };
}

export interface PerformanceProfilerApi {
  reset: () => void;
  snapshot: () => PerformanceProfilerSnapshot;
}

declare global {
  interface Window {
    __KESSLER_PERFORMANCE_CONFIG__?: PerformanceProfilerRequest;
    __KESSLER_PERFORMANCE__?: PerformanceProfilerApi;
  }
}

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

export function parsePerformanceProfilerConfig(
  value: unknown,
): PerformanceProfilerConfig | undefined {
  if (!value || typeof value !== "object") return undefined;
  const request = value as PerformanceProfilerRequest;
  if (request.enabled !== true) return undefined;

  const drawingPixels =
    typeof request.drawingPixels === "number" &&
    Number.isFinite(request.drawingPixels)
      ? Math.min(40_000_000, Math.max(100_000, request.drawingPixels))
      : undefined;

  return {
    drawingPixels,
    maximumSamples: boundedInteger(request.maximumSamples, 240, 10, 600),
  };
}

/**
 * True when the saturation probe is forcing a drawing-buffer size rather than
 * just observing. The launchpad draws its idle scene at thirty frames a
 * second, and a frame interval held at 33 ms by that throttle would read as a
 * saturated GPU, so the probe lifts it to measure what a frame really costs.
 * Plain observation runs do not set `drawingPixels` and do not get the
 * override, so what they measure is the shipped scheduling behaviour.
 */
export function forcesContinuousRendering(
  config: PerformanceProfilerConfig | undefined,
): boolean {
  return config?.drawingPixels !== undefined;
}

function rendererDescription(context: WebGLRenderingContext): {
  version: string;
  vendor: string;
  renderer: string;
  maximumTextureSize: number;
} {
  const debug = context.getExtension("WEBGL_debug_renderer_info") as
    | {
        UNMASKED_VENDOR_WEBGL: number;
        UNMASKED_RENDERER_WEBGL: number;
      }
    | null;
  const parameter = (name: number): string => {
    const value = context.getParameter(name) as unknown;
    return typeof value === "string" ? value : String(value ?? "unknown");
  };

  return {
    version: parameter(context.VERSION),
    vendor: parameter(debug?.UNMASKED_VENDOR_WEBGL ?? context.VENDOR),
    renderer: parameter(debug?.UNMASKED_RENDERER_WEBGL ?? context.RENDERER),
    maximumTextureSize: Number(context.getParameter(context.MAX_TEXTURE_SIZE)),
  };
}

function appendBounded(
  target: number[],
  value: number,
  maximumSamples: number,
): void {
  if (!Number.isFinite(value)) return;
  target.push(value);
  if (target.length > maximumSamples) target.shift();
}

export class PerformanceProfiler {
  readonly config: PerformanceProfilerConfig;

  private readonly context: WebGLRenderingContext;
  private readonly webgl: PerformanceProfilerSnapshot["webgl"];
  private renderCalls = 0;
  private lastRenderAt = 0;
  private commandSubmissionMilliseconds: number[] = [];
  private renderFrameIntervals: number[] = [];

  constructor(
    renderer: WebGLRenderer,
    private readonly canvas: HTMLCanvasElement,
    private readonly scene: ProfiledScene,
    config: PerformanceProfilerConfig,
  ) {
    this.config = config;
    this.context = renderer.getContext();
    this.webgl = rendererDescription(this.context);
  }

  drawingPixelRatio(
    cssWidth: number,
    cssHeight: number,
    defaultRatio: number,
  ): number {
    if (!this.config.drawingPixels) return defaultRatio;
    const requested = Math.sqrt(
      this.config.drawingPixels / (cssWidth * cssHeight),
    );
    const maximumDimensionRatio = Math.min(
      this.webgl.maximumTextureSize / cssWidth,
      this.webgl.maximumTextureSize / cssHeight,
    );
    return Math.min(6, maximumDimensionRatio, Math.max(0.25, requested));
  }

  render(draw: () => void): void {
    const now = performance.now();
    this.renderCalls += 1;
    if (this.lastRenderAt > 0) {
      appendBounded(
        this.renderFrameIntervals,
        now - this.lastRenderAt,
        this.config.maximumSamples,
      );
    }
    this.lastRenderAt = now;

    const startedAt = performance.now();
    draw();
    const submittedAt = performance.now();
    appendBounded(
      this.commandSubmissionMilliseconds,
      submittedAt - startedAt,
      this.config.maximumSamples,
    );
  }

  reset(): void {
    this.renderCalls = 0;
    this.lastRenderAt = 0;
    this.commandSubmissionMilliseconds = [];
    this.renderFrameIntervals = [];
  }

  snapshot(): PerformanceProfilerSnapshot {
    const bounds = this.canvas.getBoundingClientRect();
    const pixels = this.canvas.width * this.canvas.height;
    return {
      version: 1,
      scene: this.scene,
      renderCalls: this.renderCalls,
      commandSubmissionMilliseconds: [...this.commandSubmissionMilliseconds],
      renderFrameIntervals: [...this.renderFrameIntervals],
      drawingBuffer: {
        cssWidth: bounds.width,
        cssHeight: bounds.height,
        width: this.canvas.width,
        height: this.canvas.height,
        pixels,
        pixelRatio:
          bounds.width > 0 && bounds.height > 0
            ? Math.sqrt(pixels / (bounds.width * bounds.height))
            : 0,
      },
      webgl: { ...this.webgl },
    };
  }
}

export function attachPerformanceProfiler(
  renderer: WebGLRenderer,
  canvas: HTMLCanvasElement,
  scene: ProfiledScene,
): PerformanceProfiler | undefined {
  const config = parsePerformanceProfilerConfig(
    window.__KESSLER_PERFORMANCE_CONFIG__,
  );
  if (!config) return undefined;

  const profiler = new PerformanceProfiler(renderer, canvas, scene, config);
  window.__KESSLER_PERFORMANCE__ = {
    reset: () => profiler.reset(),
    snapshot: () => profiler.snapshot(),
  };
  return profiler;
}
