// The deep performance suite: drives installed stable Chrome through the
// launchpad and the sky under constrained profiles, then probes each WebGL
// scene's GPU cost. Carried over from assignment 1's harness and adapted to a
// server-rendered app: rather than serving dist/ statically, it starts the
// built server on a throwaway database and seeds a crowded sky, so a run
// never touches data/app.db or the deployed sky. Run by hand
// (`pnpm test:performance`); CLAUDE.md says how to read the report.
import { spawn, type ChildProcess } from "node:child_process";
import { gzipSync } from "node:zlib";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { arch, cpus, hostname, platform, tmpdir, totalmem } from "node:os";
import { join, relative, resolve } from "node:path";
import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from "playwright-core";

import {
  estimateRenderDutyCycle,
  fitRenderCost,
  predictRenderMilliseconds,
  summarizeCadence,
  summarizeDurations,
  totalBlockingTime,
  type RenderCostSample,
} from "./report.ts";

const ROOT = resolve(".");
const CLIENT = join(ROOT, "dist", "client");
const SERVER_ENTRY = join(ROOT, "dist", "server", "entry.mjs");
const REPORT_DIRECTORY = join(ROOT, "performance-results");
const PROFILE_RUNS = boundedEnvironmentInteger("PERF_RUNS", 1, 1, 5);
// The sky's cost grows with what's in it (labels, trails, points), so profile
// a crowded one. Leaves room under SKY_CAP for each profile's own launch.
const SEEDED_SATELLITES = boundedEnvironmentInteger("PERF_SATELLITES", 150, 0, 190);
const HEADED = process.env.PERF_HEADED === "1" || process.env.PERF_HEADLESS === "0";
// The lower points show the shipped state; the deliberately oversized points
// push even a fast GPU beyond vsync. Only those saturated points are used to
// fit cost: an unsaturated frame interval is vsync-clamped and says nothing
// about GPU time (assignment 1, PR #20). Both scenes are far cheaper than
// assignment 1's procedural planet, so the ladder runs higher: on an M4 the
// launchpad still held vsync at 20 Mpx.
const GPU_DRAWING_PIXELS = [1_250_000, 5_000_000, 10_000_000, 20_000_000, 30_000_000, 36_000_000];
const SCENES = ["launchpad", "sky"] as const;
type SceneName = (typeof SCENES)[number];

interface NetworkConditions {
  label: string;
  latencyMilliseconds: number;
  downloadBytesPerSecond: number;
  uploadBytesPerSecond: number;
}

interface RuntimeProfile {
  name: string;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  isMobile: boolean;
  cpuSlowdown: number;
  network?: NetworkConditions;
}

const SLOW_4G: NetworkConditions = {
  label: "Slow 4G (1.6 Mbps / 150 ms RTT)",
  latencyMilliseconds: 150,
  downloadBytesPerSecond: 1_600_000 / 8,
  uploadBytesPerSecond: 750_000 / 8,
};

const RUNTIME_PROFILES: readonly RuntimeProfile[] = [
  {
    name: "marking-desktop",
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    isMobile: false,
    cpuSlowdown: 1,
  },
  {
    name: "marking-phone-constrained",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    cpuSlowdown: 4,
    network: SLOW_4G,
  },
  {
    name: "low-end-laptop",
    viewport: { width: 1366, height: 768 },
    deviceScaleFactor: 1,
    isMobile: false,
    cpuSlowdown: 6,
    network: SLOW_4G,
  },
];

// PERF_PROFILES=marking-desktop,low-end-laptop runs only those
const SELECTED_PROFILES = RUNTIME_PROFILES.filter(
  (profile) => !process.env.PERF_PROFILES || process.env.PERF_PROFILES.split(",").includes(profile.name),
);

interface BrowserObservations {
  longTasks: Array<{ startTime: number; duration: number }>;
  layoutShift: number;
  largestContentfulPaint: number;
  interactionDurations: number[];
}

interface BrowserState {
  navigation: {
    responseStart: number;
    domContentLoaded: number;
    load: number;
    transferSize: number;
    encodedBodySize: number;
  };
  firstContentfulPaint: number;
  observations: BrowserObservations;
  resources: Array<{
    name: string;
    initiatorType: string;
    duration: number;
    transferSize: number;
    encodedBodySize: number;
    decodedBodySize: number;
  }>;
  javascriptHeapBytes: number | null;
}

interface ProbeSnapshot {
  version: number;
  scene: SceneName;
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

interface PhaseResult {
  durationMilliseconds: number;
  cadence: ReturnType<typeof summarizeCadence>;
  rendersPerSecond: number | null;
  commandSubmission: ReturnType<typeof summarizeDurations> | null;
  probe: ProbeSnapshot | null;
  longTasks: ReturnType<typeof summarizeDurations>;
  totalBlockingMilliseconds: number;
}

interface LoadResult {
  responseStart: number;
  domContentLoaded: number;
  firstContentfulPaint: number;
  largestContentfulPaint: number;
  cumulativeLayoutShift: number;
  totalBlockingMilliseconds: number;
  resourceCount: number;
  transferredBytes: number;
  sceneStarted: boolean;
  sceneReadyMilliseconds: number | null;
}

interface ProfileResult {
  name: string;
  run: number;
  conditions: {
    viewport: RuntimeProfile["viewport"];
    deviceScaleFactor: number;
    cpuSlowdown: number;
    network: string;
  };
  launchpad: {
    load: LoadResult;
    idle: PhaseResult | null;
    launch: (PhaseResult & { arrived: boolean }) | null;
  };
  sky: {
    load: LoadResult;
    satellitesInSky: number | null;
    station: PhaseResult | null;
    zoom: PhaseResult | null;
    wholeSky: PhaseResult | null;
    offscreen: (PhaseResult & { canvasLeftViewport: boolean }) | null;
    javascriptHeapBytes: number | null;
    maximumInteractionMilliseconds: number;
  };
  chromePerformanceMetrics: Record<string, number>;
  errors: string[];
}

interface GpuPoint {
  scene: SceneName;
  requestedPixels: number;
  snapshot: ProbeSnapshot;
  cadence: ReturnType<typeof summarizeCadence>;
}

interface GpuFit {
  saturatedPointCount: number;
  fit: ReturnType<typeof fitRenderCost> | null;
}

interface GpuStress {
  method: string;
  representativeOfInstalledGpu: boolean;
  webgl: ProbeSnapshot["webgl"] | null;
  refreshIntervalMilliseconds: number;
  points: GpuPoint[];
  fits: Record<SceneName, GpuFit>;
}

interface Finding {
  severity: "warning" | "failure";
  code: string;
  message: string;
}

function boundedEnvironmentInteger(name: string, fallback: number, minimum: number, maximum: number): number {
  const raw = process.env[name];
  const value = raw === undefined || raw === "" ? Number.NaN : Number(raw);
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, Math.round(value))) : fallback;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function formatMilliseconds(milliseconds: number): string {
  return `${milliseconds.toFixed(1)} ms`;
}

const fixed = (value: number | null | undefined, digits = 1): string =>
  value === null || value === undefined ? "n/a" : value.toFixed(digits);

async function allFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? allFiles(path) : [path];
    }),
  );
  return nested.flat();
}

// What the browser can be sent: dist/client. The pages themselves are
// rendered per request, so their size is in each profile's transfer instead.
async function collectBuildMetrics(): Promise<Record<string, unknown>> {
  const files = await allFiles(CLIENT);
  const entries = await Promise.all(
    files.map(async (path) => {
      const contents = await readFile(path);
      return {
        path: relative(CLIENT, path),
        rawBytes: contents.byteLength,
        gzipBytes: gzipSync(contents).byteLength,
      };
    }),
  );
  const sum = (key: "rawBytes" | "gzipBytes", suffix?: string): number =>
    entries.filter((entry) => !suffix || entry.path.endsWith(suffix)).reduce((total, entry) => total + entry[key], 0);

  return {
    fileCount: entries.length,
    rawBytes: sum("rawBytes"),
    gzipBytes: sum("gzipBytes"),
    javascriptRawBytes: sum("rawBytes", ".js"),
    javascriptGzipBytes: sum("gzipBytes", ".js"),
    stylesheetRawBytes: sum("rawBytes", ".css"),
    files: entries.sort((left, right) => right.rawBytes - left.rawBytes),
  };
}

async function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

async function runToCompletion(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  await new Promise<void>((resolveRun, reject) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "ignore", "inherit"] });
    child.once("error", reject);
    child.once("exit", (code) => (code === 0 ? resolveRun() : reject(new Error(`${args.join(" ")} exited ${code}`))));
  });
}

interface Target {
  url: string;
  seeded: number;
  // false for a sky that isn't ours to launch into
  launches: boolean;
  stop: () => Promise<void>;
}

// The built server on a free port and a database of its own, as the
// Dockerfile runs it, so the profile sees production bundles and compression
// rather than the dev server's unbundled modules.
async function startServer(): Promise<Target> {
  if (process.env.PERF_URL) {
    // a real sky: profile it as it is, and launch nothing into it
    return { url: new URL("/", process.env.PERF_URL).href, seeded: 0, launches: false, stop: async () => {} };
  }
  try {
    await readFile(SERVER_ENTRY);
  } catch {
    throw new Error("Missing dist/server/entry.mjs; run `pnpm build` first");
  }

  const directory = await mkdtemp(join(tmpdir(), "kessler-perf-"));
  const port = await freePort();
  const env = {
    ...process.env,
    DATABASE_PATH: join(directory, "app.db"),
    HOST: "127.0.0.1",
    PORT: String(port),
    NODE_ENV: "production",
  };
  await runToCompletion(process.execPath, ["scripts/migrate.mjs"], env);
  const server: ChildProcess = spawn(process.execPath, [SERVER_ENTRY], { env, stdio: ["ignore", "ignore", "inherit"] });
  const url = `http://127.0.0.1:${port}/`;
  const stop = async () => {
    if (server.exitCode === null) {
      await new Promise<void>((resolveExit) => {
        server.once("exit", () => resolveExit());
        server.kill();
      });
    }
    await rm(directory, { recursive: true, force: true });
  };

  try {
    for (let attempt = 0; ; attempt++) {
      if (server.exitCode !== null) throw new Error(`the built server exited ${server.exitCode}`);
      try {
        await fetch(url);
        break;
      } catch {
        if (attempt >= 150) throw new Error(`the built server never answered at ${url}`);
        await new Promise((resolveWait) => setTimeout(resolveWait, 200));
      }
    }
    return { url, seeded: await seedSky(url), launches: true, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

// One satellite per person (the server's rule), so each seed is its own
// cookieless visitor.
async function seedSky(url: string): Promise<number> {
  const bands = ["low", "mid", "high"];
  let seeded = 0;
  for (let index = 0; index < SEEDED_SATELLITES; index++) {
    const response = await fetch(url, {
      method: "POST",
      redirect: "manual",
      headers: {
        origin: new URL(url).origin,
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        band: bands[index % bands.length],
        callsign: `PERF-${String(index + 1).padStart(3, "0")}`,
        beacon: `Profiling beacon ${index + 1}`,
      }).toString(),
    });
    if (response.status !== 201) throw new Error(`seeding launch ${index + 1} was refused (${response.status})`);
    seeded++;
  }
  return seeded;
}

async function launchChrome(): Promise<Browser> {
  const executablePath = process.env.PERF_CHROME_PATH;
  return chromium.launch({
    channel: executablePath ? undefined : "chrome",
    executablePath,
    headless: !HEADED,
    args: ["--enable-precise-memory-info"],
  });
}

async function installObservers(context: BrowserContext, profilerConfig: Record<string, unknown>): Promise<void> {
  await context.addInitScript((config) => {
    const observations: BrowserObservations = {
      longTasks: [],
      layoutShift: 0,
      largestContentfulPaint: 0,
      interactionDurations: [],
    };
    Object.defineProperty(window, "__PERFORMANCE_OBSERVATIONS__", {
      configurable: true,
      value: observations,
    });
    Object.defineProperty(window, "__KESSLER_PERFORMANCE_CONFIG__", {
      configurable: true,
      value: config,
    });

    const observe = (type: string, callback: (entries: PerformanceEntry[]) => void): void => {
      try {
        const observer = new PerformanceObserver((list) => callback(list.getEntries()));
        observer.observe({ type, buffered: true });
      } catch {
        // Older Chrome builds can omit individual entry types.
      }
    };

    observe("longtask", (entries) => {
      observations.longTasks.push(
        ...entries.map((entry) => ({
          startTime: entry.startTime,
          duration: entry.duration,
        })),
      );
    });
    observe("layout-shift", (entries) => {
      for (const entry of entries) {
        const shift = entry as PerformanceEntry & {
          value?: number;
          hadRecentInput?: boolean;
        };
        if (!shift.hadRecentInput) observations.layoutShift += shift.value ?? 0;
      }
    });
    observe("largest-contentful-paint", (entries) => {
      const last = entries.at(-1);
      if (last) observations.largestContentfulPaint = last.startTime;
    });
    observe("event", (entries) => {
      observations.interactionDurations.push(
        ...entries.map((entry) => entry.duration).filter((duration) => duration > 0),
      );
    });
  }, profilerConfig);
}

async function configureThrottling(context: BrowserContext, page: Page, profile: RuntimeProfile): Promise<CDPSession> {
  const session = await context.newCDPSession(page);
  await session.send("Network.enable");
  await session.send("Network.setCacheDisabled", { cacheDisabled: true });
  await session.send("Network.clearBrowserCache");
  await session.send("Emulation.setCPUThrottlingRate", {
    rate: profile.cpuSlowdown,
  });
  if (profile.network) {
    // Chrome 151 no longer applies the deprecated all-in-one command
    // consistently to loopback traffic. Use the replacement pair: one rule
    // shapes requests, the other keeps navigator.connection honest.
    const rawSend = session.send.bind(session) as unknown as (
      method: string,
      parameters: Record<string, unknown>,
    ) => Promise<unknown>;
    const conditions = {
      offline: false,
      latency: profile.network.latencyMilliseconds,
      downloadThroughput: profile.network.downloadBytesPerSecond,
      uploadThroughput: profile.network.uploadBytesPerSecond,
      connectionType: "cellular4g",
    };
    await rawSend("Network.emulateNetworkConditionsByRule", {
      offline: false,
      matchedNetworkConditions: [{ urlPattern: "", ...conditions }],
    });
    await rawSend("Network.overrideNetworkState", conditions);
  }
  await session.send("Performance.enable");
  return session;
}

async function collectFrameIntervals(page: Page, durationMilliseconds: number): Promise<number[]> {
  return page.evaluate(
    (duration) =>
      new Promise<number[]>((resolveIntervals) => {
        const intervals: number[] = [];
        let first = 0;
        let previous = 0;
        const sample = (now: number): void => {
          if (first === 0) first = now;
          if (previous > 0) intervals.push(now - previous);
          previous = now;
          if (now - first >= duration) resolveIntervals(intervals);
          else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }),
    durationMilliseconds,
  );
}

async function calibrateRefresh(browser: Browser): Promise<{
  intervalMilliseconds: number;
  refreshRateHz: number;
  samples: number[];
}> {
  const context = await browser.newContext({
    viewport: { width: 800, height: 600 },
  });
  try {
    const page = await context.newPage();
    await page.goto("data:text/html,<title>refresh calibration</title>");
    const samples = await collectFrameIntervals(page, 1_200);
    const summary = summarizeDurations(samples);
    return {
      intervalMilliseconds: summary.median,
      refreshRateHz: summary.median > 0 ? 1000 / summary.median : 60,
      samples,
    };
  } finally {
    await context.close();
  }
}

async function resetBrowserObservations(page: Page): Promise<void> {
  await page.evaluate(() => {
    const observations = (
      window as typeof window & {
        __PERFORMANCE_OBSERVATIONS__?: BrowserObservations;
      }
    ).__PERFORMANCE_OBSERVATIONS__;
    if (observations) observations.longTasks.length = 0;
    window.__KESSLER_PERFORMANCE__?.reset();
  });
}

async function readProbe(page: Page): Promise<ProbeSnapshot | null> {
  return page.evaluate(() => (window.__KESSLER_PERFORMANCE__?.snapshot() as ProbeSnapshot | undefined) ?? null);
}

async function readBrowserState(page: Page): Promise<BrowserState> {
  return page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const paints = performance.getEntriesByType("paint");
    const firstContentfulPaint = paints.find((entry) => entry.name === "first-contentful-paint")?.startTime ?? 0;
    const resources = performance.getEntriesByType("resource").map((entry) => {
      const resource = entry as PerformanceResourceTiming;
      return {
        name: resource.name,
        initiatorType: resource.initiatorType,
        duration: resource.duration,
        transferSize: resource.transferSize,
        encodedBodySize: resource.encodedBodySize,
        decodedBodySize: resource.decodedBodySize,
      };
    });
    const observations = (
      window as typeof window & {
        __PERFORMANCE_OBSERVATIONS__?: BrowserObservations;
      }
    ).__PERFORMANCE_OBSERVATIONS__ ?? {
      longTasks: [],
      layoutShift: 0,
      largestContentfulPaint: 0,
      interactionDurations: [],
    };
    const memory = (
      performance as Performance & {
        memory?: { usedJSHeapSize?: number };
      }
    ).memory;

    return {
      navigation: {
        responseStart: navigation?.responseStart ?? 0,
        domContentLoaded: navigation?.domContentLoadedEventEnd ?? 0,
        load: navigation?.loadEventEnd ?? 0,
        transferSize: navigation?.transferSize ?? 0,
        encodedBodySize: navigation?.encodedBodySize ?? 0,
      },
      firstContentfulPaint,
      observations: {
        longTasks: [...observations.longTasks],
        layoutShift: observations.layoutShift,
        largestContentfulPaint: observations.largestContentfulPaint,
        interactionDurations: [...observations.interactionDurations],
      },
      resources,
      javascriptHeapBytes: memory?.usedJSHeapSize ?? null,
    };
  });
}

function phaseResult(
  durationMilliseconds: number,
  frameIntervals: number[],
  refreshIntervalMilliseconds: number,
  probe: ProbeSnapshot | null,
  state: BrowserState,
): PhaseResult {
  const longTaskDurations = state.observations.longTasks.map((task) => task.duration);
  return {
    durationMilliseconds,
    cadence: summarizeCadence(frameIntervals, refreshIntervalMilliseconds),
    rendersPerSecond: probe ? probe.renderCalls / (durationMilliseconds / 1000) : null,
    commandSubmission: probe ? summarizeDurations(probe.commandSubmissionMilliseconds) : null,
    probe,
    longTasks: summarizeDurations(longTaskDurations),
    totalBlockingMilliseconds: totalBlockingTime(longTaskDurations),
  };
}

async function collectPhase(
  page: Page,
  durationMilliseconds: number,
  refreshIntervalMilliseconds: number,
): Promise<PhaseResult> {
  await resetBrowserObservations(page);
  const frameIntervals = await collectFrameIntervals(page, durationMilliseconds);
  const [probe, state] = await Promise.all([readProbe(page), readBrowserState(page)]);
  return phaseResult(durationMilliseconds, frameIntervals, refreshIntervalMilliseconds, probe, state);
}

function loadResult(state: BrowserState, sceneReadyMilliseconds: number | null): LoadResult {
  const longTasks = state.observations.longTasks.map((task) => task.duration);
  return {
    responseStart: state.navigation.responseStart,
    domContentLoaded: state.navigation.domContentLoaded,
    firstContentfulPaint: state.firstContentfulPaint,
    largestContentfulPaint: state.observations.largestContentfulPaint,
    cumulativeLayoutShift: state.observations.layoutShift,
    totalBlockingMilliseconds: totalBlockingTime(longTasks),
    resourceCount: state.resources.length + 1,
    transferredBytes:
      state.navigation.transferSize + state.resources.reduce((total, resource) => total + resource.transferSize, 0),
    sceneStarted: sceneReadyMilliseconds !== null,
    sceneReadyMilliseconds,
  };
}

// Waits for a page's scene to start, and says when it did (ms since
// navigation), or null if it never did.
async function waitForScene(page: Page, ready: string, timeout: number): Promise<number | null> {
  try {
    await page.waitForFunction((selector) => Boolean(document.querySelector(selector)), ready, { timeout });
    return page.evaluate(() => performance.now());
  } catch {
    return null;
  }
}

function watchForErrors(page: Page, errors: string[]): void {
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) {
      const source = message.location().url;
      errors.push(`console: ${message.text()}${source ? ` (${source})` : ""}`);
    }
  });
  page.on("response", (response) => {
    if (response.status() < 400) return;
    const path = new URL(response.url()).pathname;
    if (path === "/favicon.ico") return;
    errors.push(`response: ${response.status()} ${response.url()}`);
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "failed";
    // the event stream and the sky's prefetch are cut off by navigation and
    // context close, which is expected, not a failure
    if (failure === "net::ERR_ABORTED") return;
    errors.push(`request: ${request.url()} (${failure})`);
  });
}

// The launch itself: fill in the form, submit, and sample every frame of the
// flight until the page fades to the sky (body.arrived), before it navigates.
async function sampleLaunch(
  page: Page,
  refreshIntervalMilliseconds: number,
  callsign: string,
): Promise<(PhaseResult & { arrived: boolean }) | null> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('input[name="band"][value="mid"]').check({ force: true });
  await page.locator("#callsign").fill(callsign);
  await page.locator("#beacon").fill("Measuring the climb");
  await resetBrowserObservations(page);
  // started before the click, so the first frames of ignition are sampled too
  const flight = page.evaluate(
    (timeout) =>
      new Promise<{ intervals: number[]; duration: number; arrived: boolean }>((resolveFlight) => {
        const intervals: number[] = [];
        let first = 0;
        let previous = 0;
        const sample = (now: number): void => {
          if (first === 0 && document.body.classList.contains("launching")) first = now;
          if (first > 0 && previous > 0) intervals.push(now - previous);
          if (first > 0) previous = now;
          const arrived = document.body.classList.contains("arrived");
          if (arrived || (first > 0 && now - first > timeout)) {
            resolveFlight({ intervals, duration: first > 0 ? now - first : 0, arrived });
          } else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }),
    20_000,
  );
  await page.locator("form[data-launch] button[type=submit], form[data-launch] button").first().click();
  const { intervals, duration, arrived } = await flight;
  const [probe, state] = await Promise.all([readProbe(page), readBrowserState(page)]);
  if (duration === 0) return null;
  return { ...phaseResult(duration, intervals, refreshIntervalMilliseconds, probe, state), arrived };
}

function cdpMetrics(result: Awaited<ReturnType<CDPSession["send"]>>): Record<string, number> {
  const metrics = (result as { metrics?: Array<{ name: string; value: number }> }).metrics;
  return Object.fromEntries((metrics ?? []).map((metric) => [metric.name, metric.value]));
}

async function runRuntimeProfile(
  browser: Browser,
  target: Target,
  profile: RuntimeProfile,
  run: number,
  refreshIntervalMilliseconds: number,
): Promise<ProfileResult> {
  const context = await browser.newContext({
    viewport: profile.viewport,
    deviceScaleFactor: profile.deviceScaleFactor,
    isMobile: profile.isMobile,
    hasTouch: profile.isMobile,
    reducedMotion: "no-preference",
  });
  await installObservers(context, {
    enabled: true,
    maximumSamples: 600,
  });

  const { url } = target;
  const errors: string[] = [];
  try {
    // ── the launchpad, cold ──
    const pad = await context.newPage();
    watchForErrors(pad, errors);
    await configureThrottling(context, pad, profile);
    await pad.goto(url, { waitUntil: "load", timeout: 90_000 });
    const padReady = await waitForScene(pad, "body.has-scene", 30_000);
    await pad.waitForTimeout(600);
    const padLoad = loadResult(await readBrowserState(pad), padReady);
    // idle: the scene behind the form while someone fills it in
    const idle = padReady === null ? null : await collectPhase(pad, 2_000, refreshIntervalMilliseconds);
    const callsign = `PERF-${profile.name.slice(0, 6).toUpperCase()}-${run}`.slice(0, 20);
    const launch = padReady === null || !target.launches ? null : await sampleLaunch(pad, refreshIntervalMilliseconds, callsign);
    await pad.close();

    // ── the sky, cold, with this visitor's satellite in it ──
    const sky = await context.newPage();
    watchForErrors(sky, errors);
    const session = await configureThrottling(context, sky, profile);
    await sky.goto(new URL("/sky/", url).href, { waitUntil: "load", timeout: 90_000 });
    const skyReady = await waitForScene(sky, "#chart.drawn", 30_000);
    await sky.waitForTimeout(600);
    const skyLoad = loadResult(await readBrowserState(sky), skyReady);
    const satellitesInSky = await sky.evaluate(() => {
      const text = document.getElementById("count")?.textContent ?? "";
      const match = /(\d+)/.exec(text);
      return match ? Number(match[1]) : null;
    });

    let station: PhaseResult | null = null;
    let zoom: PhaseResult | null = null;
    let wholeSky: PhaseResult | null = null;
    let offscreen: (PhaseResult & { canvasLeftViewport: boolean }) | null = null;
    if (skyReady !== null) {
      station = await collectPhase(sky, 3_000, refreshIntervalMilliseconds);
      // the zoom out to the whole planet, where every satellite is in view
      // and every one wants a label
      await sky.locator("#zoom").click();
      zoom = await collectPhase(sky, 1_500, refreshIntervalMilliseconds);
      wholeSky = await collectPhase(sky, 3_000, refreshIntervalMilliseconds);
      // scrolled to the summary, the scene should rest
      await sky.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await sky.waitForTimeout(400);
      const canvasLeftViewport = await sky.evaluate(() => {
        const rect = document.getElementById("chart")!.getBoundingClientRect();
        return rect.bottom <= 0 || rect.top >= window.innerHeight;
      });
      offscreen = { ...(await collectPhase(sky, 1_500, refreshIntervalMilliseconds)), canvasLeftViewport };
    }
    const finalState = await readBrowserState(sky);
    const performanceMetrics = cdpMetrics(await session.send("Performance.getMetrics"));

    return {
      name: profile.name,
      run,
      conditions: {
        viewport: profile.viewport,
        deviceScaleFactor: profile.deviceScaleFactor,
        cpuSlowdown: profile.cpuSlowdown,
        network: profile.network?.label ?? "unthrottled",
      },
      launchpad: { load: padLoad, idle, launch },
      sky: {
        load: skyLoad,
        satellitesInSky,
        station,
        zoom,
        wholeSky,
        offscreen,
        javascriptHeapBytes: finalState.javascriptHeapBytes,
        maximumInteractionMilliseconds: summarizeDurations(finalState.observations.interactionDurations).maximum,
      },
      chromePerformanceMetrics: performanceMetrics,
      errors,
    };
  } finally {
    await context.close();
  }
}

async function runGpuStress(browser: Browser, url: string, refreshIntervalMilliseconds: number): Promise<GpuStress> {
  const points: GpuPoint[] = [];
  let webgl: ProbeSnapshot["webgl"] | null = null;

  for (const scene of SCENES) {
    for (const drawingPixels of GPU_DRAWING_PIXELS) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
        // not reduced: the launchpad then draws a single frame and stops
        reducedMotion: "no-preference",
      });
      await installObservers(context, {
        enabled: true,
        drawingPixels,
        maximumSamples: 600,
      });

      try {
        const page = await context.newPage();
        await page.goto(new URL(scene === "sky" ? "/sky/" : "/", url).href, { waitUntil: "load", timeout: 90_000 });
        await page.waitForFunction(() => Boolean(window.__KESSLER_PERFORMANCE__), undefined, { timeout: 30_000 });
        await page.waitForTimeout(900);
        await resetBrowserObservations(page);
        const intervals = await collectFrameIntervals(page, 2_200);
        const snapshot = await readProbe(page);
        if (!snapshot) throw new Error(`The ${scene} WebGL performance probe is unavailable`);
        webgl ??= snapshot.webgl;
        points.push({
          scene,
          requestedPixels: drawingPixels,
          snapshot,
          cadence: summarizeCadence(intervals, refreshIntervalMilliseconds),
        });
      } finally {
        await context.close();
      }
    }
  }

  const fitFor = (scene: SceneName): GpuFit => {
    const samples: RenderCostSample[] = points
      .filter((point) => point.scene === scene && point.cadence.median > refreshIntervalMilliseconds * 1.5)
      .map((point) => ({
        megapixels: point.snapshot.drawingBuffer.pixels / 1_000_000,
        // Once saturated, total elapsed time / delivered frames retains the
        // fractional cost that the vsync-quantized median throws away.
        milliseconds: point.cadence.mean,
      }));
    return {
      saturatedPointCount: samples.length,
      fit: samples.length >= 2 ? fitRenderCost(samples) : null,
    };
  };
  const softwareRenderer = /swiftshader|llvmpipe|software/i.test(webgl?.renderer ?? "");

  return {
    method:
      "increase drawing pixels until rAF is slower than 1.5× an independent blank-page refresh calibration, then fit mean cadence across saturated points only",
    representativeOfInstalledGpu: !softwareRenderer,
    webgl,
    refreshIntervalMilliseconds,
    points,
    fits: { launchpad: fitFor("launchpad"), sky: fitFor("sky") },
  };
}

// The drawing buffer each scene actually allocated in a profile, from its
// probe, or the shipped rule (devicePixelRatio, capped at 2) when there was
// no probe snapshot.
function shippedPixels(profile: ProfileResult, scene: SceneName): number {
  const probe = scene === "sky" ? profile.sky.station?.probe : profile.launchpad.idle?.probe;
  if (probe) return probe.drawingBuffer.pixels;
  const ratio = Math.min(profile.conditions.deviceScaleFactor, 2);
  return profile.conditions.viewport.width * profile.conditions.viewport.height * ratio * ratio;
}

interface DutyEstimate {
  profile: string;
  scene: SceneName;
  megapixels: number;
  predictedMilliseconds: number;
  dutyCycle: number;
}

function dutyEstimates(profiles: ProfileResult[], gpu: GpuStress, refreshRateHz: number): DutyEstimate[] {
  const estimates: DutyEstimate[] = [];
  for (const profile of profiles.filter((p) => p.run === 1)) {
    for (const scene of SCENES) {
      const fit = gpu.fits[scene].fit;
      if (!fit) continue;
      const pixels = shippedPixels(profile, scene);
      const predicted = predictRenderMilliseconds(fit, pixels);
      estimates.push({
        profile: profile.name,
        scene,
        megapixels: pixels / 1_000_000,
        predictedMilliseconds: predicted,
        dutyCycle: estimateRenderDutyCycle(predicted, refreshRateHz),
      });
    }
  }
  return estimates;
}

function analyseReport(report: {
  refreshCalibration: { refreshRateHz: number };
  runtimeProfiles: ProfileResult[];
  gpuStress: GpuStress;
  gpuDuty: DutyEstimate[];
}): Finding[] {
  const findings: Finding[] = [];
  for (const profile of report.runtimeProfiles) {
    const prefix = `${profile.name} run ${profile.run}`;
    const { launchpad, sky } = profile;

    if (profile.errors.length > 0) {
      findings.push({
        severity: "failure",
        code: "browser-errors",
        message: `${prefix}: ${profile.errors.join("; ")}`,
      });
    }
    for (const [page, load] of [
      ["launchpad", launchpad.load],
      ["sky", sky.load],
    ] as const) {
      if (!load.sceneStarted) {
        findings.push({
          severity: "failure",
          code: "scene-did-not-start",
          message: `${prefix}: the ${page}'s WebGL scene never started; the page fell back to its no-WebGL state.`,
        });
      }
      if (load.cumulativeLayoutShift > 0.1) {
        findings.push({
          severity: "warning",
          code: "layout-shift",
          message: `${prefix}: ${page} load CLS was ${load.cumulativeLayoutShift.toFixed(3)} (target ≤ 0.1).`,
        });
      }
      const loadBlockingBudget = profile.name === "marking-desktop" ? 200 : 600;
      if (load.totalBlockingMilliseconds > loadBlockingBudget) {
        findings.push({
          severity: "warning",
          code: "load-blocking-time",
          message: `${prefix}: ${page} load blocking time was ${formatMilliseconds(load.totalBlockingMilliseconds)} (profile budget ${loadBlockingBudget} ms).`,
        });
      }
    }
    if (launchpad.launch && !launchpad.launch.arrived) {
      findings.push({
        severity: "failure",
        code: "launch-did-not-arrive",
        message: `${prefix}: the launch never reached the sky within 20 s.`,
      });
    }
    const phases: Array<[string, PhaseResult | null]> = [
      ["launch", launchpad.launch],
      ["sky station view", sky.station],
      ["sky zoom", sky.zoom],
      ["whole sky", sky.wholeSky],
    ];
    for (const [label, phase] of phases) {
      if (!phase) continue;
      if (phase.cadence.missedFrameRatio > 0.1) {
        findings.push({
          severity: "warning",
          code: "frame-misses",
          message: `${prefix}: ${(phase.cadence.missedFrameRatio * 100).toFixed(1)}% of ${label} frames missed the calibrated refresh interval.`,
        });
      }
      if (phase.totalBlockingMilliseconds > 200) {
        findings.push({
          severity: "warning",
          code: "long-tasks",
          message: `${prefix}: ${label} accumulated ${formatMilliseconds(phase.totalBlockingMilliseconds)} of blocking time.`,
        });
      }
    }
    if (sky.offscreen?.canvasLeftViewport && (sky.offscreen.rendersPerSecond ?? 0) > 5) {
      findings.push({
        severity: "warning",
        code: "offscreen-continuous-rendering",
        message: `${prefix}: the sky rendered ${sky.offscreen.rendersPerSecond?.toFixed(1)} frames/s while scrolled out of view.`,
      });
    }
  }

  const gpu = report.gpuStress;
  for (const estimate of report.gpuDuty) {
    if (estimate.dutyCycle > 50) {
      findings.push({
        severity: "warning",
        code: "gpu-duty-cycle",
        message: `${estimate.profile}: the ${estimate.scene} scene is estimated to occupy ${estimate.dutyCycle.toFixed(1)}% of the calibrated refresh budget at its ${estimate.megapixels.toFixed(2)} Mpx drawing buffer.`,
      });
    }
  }
  for (const scene of SCENES) {
    const fit = gpu.fits[scene].fit;
    if (!fit) {
      findings.push({
        severity: "warning",
        code: "gpu-not-saturated",
        message: `Fewer than two ${scene} stress points fell below vsync; no GPU slope was reported. The scene may simply be cheap on this GPU; rerun on slower hardware to measure it.`,
      });
    } else if (gpu.fits[scene].saturatedPointCount < 3) {
      findings.push({
        severity: "warning",
        code: "gpu-fit-thin",
        message: `The ${scene} GPU fit rests on only ${gpu.fits[scene].saturatedPointCount} saturated points, so its R² says nothing and its fixed cost is an extrapolation; read its duty-cycle estimates as rough. A headed run, or slower hardware, saturates more of the ladder.`,
      });
    } else if (fit.rSquared < 0.8) {
      findings.push({
        severity: "warning",
        code: "gpu-fit-unstable",
        message: `The ${scene} GPU scaling fit had R² ${fit.rSquared.toFixed(2)}; rerun before trusting the slope.`,
      });
    }
  }
  if (!gpu.representativeOfInstalledGpu) {
    findings.push({
      severity: "warning",
      code: "software-webgl",
      message:
        "Chrome used a software WebGL renderer. CPU/network results remain useful, but rerun headed on real hardware for GPU conclusions.",
    });
  }
  return findings;
}

function markdownReport(report: {
  generatedAt: string;
  targetUrl: string;
  seededSatellites: number;
  environment: Record<string, unknown>;
  build: Record<string, unknown>;
  refreshCalibration: { intervalMilliseconds: number; refreshRateHz: number };
  runtimeProfiles: ProfileResult[];
  gpuStress: GpuStress;
  gpuDuty: DutyEstimate[];
  findings: Finding[];
}): string {
  const loadRows = report.runtimeProfiles.flatMap((profile) =>
    (["launchpad", "sky"] as const).map((page) => {
      const load = profile[page].load;
      return `| ${profile.name} #${profile.run} | ${page} | ${profile.conditions.cpuSlowdown}× / ${profile.conditions.network} | ${load.firstContentfulPaint.toFixed(0)} ms | ${load.largestContentfulPaint.toFixed(0)} ms | ${fixed(load.sceneReadyMilliseconds, 0)} ms | ${load.cumulativeLayoutShift.toFixed(3)} | ${load.totalBlockingMilliseconds.toFixed(0)} ms | ${formatBytes(load.transferredBytes)} |`;
    }),
  );
  const phaseRows = report.runtimeProfiles.flatMap((profile) => {
    const phases: Array<[string, PhaseResult | null]> = [
      ["launchpad idle", profile.launchpad.idle],
      ["launch", profile.launchpad.launch],
      ["sky station", profile.sky.station],
      ["sky zoom", profile.sky.zoom],
      ["whole sky", profile.sky.wholeSky],
      [
        profile.sky.offscreen?.canvasLeftViewport === false ? "sky scrolled (still on screen)" : "sky scrolled away",
        profile.sky.offscreen,
      ],
    ];
    return phases
      .filter((entry): entry is [string, PhaseResult] => entry[1] !== null)
      .map(
        ([label, phase]) =>
          `| ${profile.name} #${profile.run} | ${label} | ${phase.cadence.effectiveFramesPerSecond.toFixed(1)} | ${(phase.cadence.missedFrameRatio * 100).toFixed(1)}% | ${phase.cadence.p95.toFixed(1)} ms | ${fixed(phase.rendersPerSecond)} | ${fixed(phase.commandSubmission?.p95, 2)} ms | ${phase.totalBlockingMilliseconds.toFixed(0)} ms | ${profile.errors.length} |`,
      );
  });
  const gpu = report.gpuStress;
  const gpuRows = gpu.points.map(
    (point) =>
      `| ${point.scene} | ${(point.snapshot.drawingBuffer.pixels / 1_000_000).toFixed(2)} | ${point.cadence.mean.toFixed(2)} ms | ${point.cadence.median.toFixed(2)} ms | ${point.cadence.p95.toFixed(2)} ms | ${(point.cadence.missedFrameRatio * 100).toFixed(1)}% |`,
  );
  const build = report.build as {
    fileCount: number;
    rawBytes: number;
    gzipBytes: number;
    javascriptGzipBytes: number;
  };
  const formatFit = (scene: SceneName): string => {
    const { fit, saturatedPointCount } = gpu.fits[scene];
    return fit
      ? `| ${scene} | ${saturatedPointCount} | ${fit.millisecondsPerMegapixel.toFixed(2)} ms/Mpx | ${fit.fixedMilliseconds.toFixed(2)} ms | ${fit.rSquared.toFixed(3)} |`
      : `| ${scene} | ${saturatedPointCount} | n/a | n/a | n/a |`;
  };
  const dutyRows =
    report.gpuDuty.length === 0
      ? ["| n/a | n/a | n/a | n/a | n/a |"]
      : report.gpuDuty.map(
          (estimate) =>
            `| ${estimate.profile} | ${estimate.scene} | ${estimate.megapixels.toFixed(2)} | ${estimate.predictedMilliseconds.toFixed(2)} ms | ${estimate.dutyCycle.toFixed(1)}% |`,
        );
  const findings =
    report.findings.length === 0
      ? ["- No runtime warnings or failures."]
      : report.findings.map((finding) => `- **${finding.severity.toUpperCase()} · ${finding.code}:** ${finding.message}`);
  const sky = report.runtimeProfiles[0]?.sky.satellitesInSky;

  return `# Kessler performance report

Generated: ${report.generatedAt}
Target: ${report.targetUrl}
Machine label: ${String(report.environment.label)}
Chrome: ${String(report.environment.chromeVersion)} (${String(report.environment.browserMode)})

## Executive signal

- Shipped client assets: ${build.fileCount} files, ${formatBytes(build.rawBytes)} raw / ${formatBytes(build.gzipBytes)} gzip; JavaScript ${formatBytes(build.javascriptGzipBytes)} gzip.
- Sky under test: ${report.seededSatellites} seeded satellites${sky === null || sky === undefined ? "" : `, ${sky} in orbit when the first profile opened the sky`}.
- Independent blank-page refresh calibration: ${report.refreshCalibration.refreshRateHz.toFixed(1)} Hz (${report.refreshCalibration.intervalMilliseconds.toFixed(2)} ms).
- GPU representative: ${gpu.representativeOfInstalledGpu ? "yes" : "no — software renderer"}. Renderer: ${gpu.webgl?.renderer ?? "unavailable"}.

## Page loads

| Profile | page | CPU / network | FCP | LCP | scene ready | CLS | load TBT | transferred |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
${loadRows.join("\n")}

## Scene phases

| Profile | phase | FPS | missed frames | p95 frame | renders/s | p95 submit | TBT | errors |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${phaseRows.join("\n")}

FPS and missed frames are measured against the separate blank-page refresh calibration; they show jank, not GPU execution time. "Renders/s" counts the scene's own draw calls (the launchpad idles at thirty a second by design). "p95 submit" is CPU time to issue a frame's WebGL commands, not GPU time.

## WebGL saturation stress probe

Method: ${gpu.method}

| Scene | drawing buffer (Mpx) | mean frame interval | median | p95 | missed frames |
| --- | ---: | ---: | ---: | ---: | ---: |
${gpuRows.join("\n")}

| Scene | saturated points | slope | fixed cost | R² |
| --- | ---: | ---: | ---: | ---: |
${formatFit("launchpad")}
${formatFit("sky")}

Predicted GPU cost at each profile's own drawing buffer (neither scene caps pixels beyond a device pixel ratio of 2):

| Profile | scene | drawing buffer (Mpx) | predicted frame | refresh duty |
| --- | --- | ---: | ---: | ---: |
${dutyRows.join("\n")}

## Findings

${findings.join("\n")}

## Interpretation boundaries

- CPU and network throttling are controlled Chrome emulation. Chrome cannot emulate a specific low-end GPU, so compare the JSON reports from real machines rather than treating one laptop as universal.
- Ordinary requestAnimationFrame cadence is vsync-clamped and says nothing about GPU cost while the browser still makes refresh. The stress probe therefore raises drawing pixels until cadence falls below the separately calibrated refresh rate, then fits the mean delivered cadence of only those saturated points. The slope is diagnostic and machine-specific, not a CI budget.
- Headless Chrome can select a software renderer. When it does, rerun with \`PERF_HEADED=1 pnpm test:performance\` before making hardware or battery claims.
- Full raw samples, Chrome task/heap metrics, resource transfer data, and machine metadata are in the adjacent JSON report.
`;
}

async function main(): Promise<void> {
  const build = await collectBuildMetrics();
  process.stdout.write(
    process.env.PERF_URL
      ? `Profiling ${process.env.PERF_URL}...\n`
      : `Starting the built server and seeding ${SEEDED_SATELLITES} satellites...\n`,
  );
  const target = await startServer();
  let browser: Browser | undefined;

  try {
    if (SELECTED_PROFILES.length === 0) {
      throw new Error(`PERF_PROFILES matched none of ${RUNTIME_PROFILES.map((p) => p.name).join(", ")}`);
    }
    browser = await launchChrome();
    const refreshCalibration = await calibrateRefresh(browser);
    const runtimeProfiles: ProfileResult[] = [];
    for (let run = 1; run <= PROFILE_RUNS; run += 1) {
      for (const profile of SELECTED_PROFILES) {
        process.stdout.write(`Profiling ${profile.name} (${run}/${PROFILE_RUNS})...\n`);
        runtimeProfiles.push(
          await runRuntimeProfile(browser, target, profile, run, refreshCalibration.intervalMilliseconds),
        );
      }
    }

    process.stdout.write("Running WebGL saturation stress probe...\n");
    const gpuStress = await runGpuStress(browser, target.url, refreshCalibration.intervalMilliseconds);
    const gpuDuty = dutyEstimates(runtimeProfiles, gpuStress, refreshCalibration.refreshRateHz);
    const generatedAt = new Date().toISOString();
    const reportCore = {
      generatedAt,
      targetUrl: target.url,
      seededSatellites: target.seeded,
      environment: {
        label: process.env.PERF_LABEL ?? `${hostname()} (${platform()} ${arch()})`,
        hostname: hostname(),
        platform: platform(),
        architecture: arch(),
        logicalCpuCount: cpus().length,
        cpuModel: cpus()[0]?.model ?? "unknown",
        totalMemoryBytes: totalmem(),
        nodeVersion: process.version,
        chromeVersion: browser.version(),
        browserMode: HEADED ? "headed" : "headless",
        profileRuns: PROFILE_RUNS,
      },
      build,
      refreshCalibration: {
        intervalMilliseconds: refreshCalibration.intervalMilliseconds,
        refreshRateHz: refreshCalibration.refreshRateHz,
        samples: refreshCalibration.samples,
      },
      runtimeProfiles,
      gpuStress,
      gpuDuty,
    };
    const findings = analyseReport(reportCore);
    const report = { ...reportCore, findings };
    const timestamp = generatedAt.replaceAll(":", "-");

    await mkdir(REPORT_DIRECTORY, { recursive: true });
    const json = `${JSON.stringify(report, null, 2)}\n`;
    const markdown = markdownReport(report);
    await Promise.all([
      writeFile(join(REPORT_DIRECTORY, `${timestamp}.json`), json),
      writeFile(join(REPORT_DIRECTORY, `${timestamp}.md`), markdown),
      writeFile(join(REPORT_DIRECTORY, "latest.json"), json),
      writeFile(join(REPORT_DIRECTORY, "latest.md"), markdown),
    ]);

    process.stdout.write(`\n${markdown}\n`);
    process.stdout.write(
      `Reports: ${relative(ROOT, join(REPORT_DIRECTORY, "latest.md"))} and ${relative(ROOT, join(REPORT_DIRECTORY, "latest.json"))}\n`,
    );
    if (findings.some((finding) => finding.severity === "failure")) {
      process.exitCode = 1;
    }
  } finally {
    await browser?.close();
    await target.stop();
  }
}

await main();
