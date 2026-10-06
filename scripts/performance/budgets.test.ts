import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// What the browser can be sent. The pages are rendered per request, so only
// the client bundle is checked here; their size is in the deep suite's report.
const CLIENT = resolve("dist", "client");

// These are regression budgets, not claims about every network or device. They
// are intentionally a little above the current build so normal build-tool
// churn does not make the suite flaky while a large accidental addition still
// gets caught in review.
const BUDGETS = {
  totalGzipBytes: 270_000,
  javascriptRawBytes: 850_000,
  javascriptGzipBytes: 255_000,
  // three.js alone, shared by both scenes
  threeGzipBytes: 155_000,
  // the sky's scene, most of it the coastline
  sceneGzipBytes: 85_000,
  launchpadGzipBytes: 14_000,
  stylesheetRawBytes: 20_000,
  // what a page must download before it works, with no scene yet
  entryGzipBytes: 12_000,
} as const;

function allFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? allFiles(path) : [path];
  });
}

const formatBytes = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KiB`;
const raw = (path: string): number => readFileSync(path).byteLength;
const gzip = (path: string): number => gzipSync(readFileSync(path)).byteLength;
const sum = (paths: string[], size: (path: string) => number): number =>
  paths.reduce((total, path) => total + size(path), 0);

function clientFiles(): string[] {
  expect(statSync(CLIENT).isDirectory(), "Run `pnpm build` before performance tests").toBe(true);
  return allFiles(CLIENT);
}

// The chunk whose file name starts with `name.` (Vite appends a hash).
function chunk(files: string[], name: string): string {
  const found = files.filter((path) => basename(path).startsWith(`${name}.`) && path.endsWith(".js"));
  expect(found, `one ${name} chunk`).toHaveLength(1);
  return found[0];
}

// The relative chunks a module imports statically, as opposed to import().
function staticImports(path: string): string[] {
  const source = readFileSync(path, "utf8");
  return [...source.matchAll(/(?:from|import)\s*"\.\/([^"]+)"/g)].map((match) => match[1]);
}

describe("performance budgets: shipped client", () => {
  const files = clientFiles();
  const javascript = files.filter((path) => path.endsWith(".js"));
  const stylesheets = files.filter((path) => path.endsWith(".css"));
  // Astro names each page's own script after the page
  const entries = javascript.filter((path) => basename(path).includes("astro_type_script"));

  it("keeps the whole client payload within the transfer budget", () => {
    const total = sum(files, gzip);
    expect(total, `gzip payload is ${formatBytes(total)}`).toBeLessThanOrEqual(BUDGETS.totalGzipBytes);
  });

  it("keeps the JavaScript and stylesheets within their budgets", () => {
    const javascriptRaw = sum(javascript, raw);
    const javascriptGzip = sum(javascript, gzip);
    const stylesheetRaw = sum(stylesheets, raw);
    expect(javascriptRaw, `JavaScript is ${formatBytes(javascriptRaw)}`).toBeLessThanOrEqual(
      BUDGETS.javascriptRawBytes,
    );
    expect(javascriptGzip, `gzip JavaScript is ${formatBytes(javascriptGzip)}`).toBeLessThanOrEqual(
      BUDGETS.javascriptGzipBytes,
    );
    expect(stylesheetRaw, `stylesheets are ${formatBytes(stylesheetRaw)}`).toBeLessThanOrEqual(
      BUDGETS.stylesheetRawBytes,
    );
  });

  it("keeps each scene's chunk within its budget", () => {
    for (const [name, budget] of [
      ["three", BUDGETS.threeGzipBytes],
      ["scene", BUDGETS.sceneGzipBytes],
      ["launchpad", BUDGETS.launchpadGzipBytes],
    ] as const) {
      const bytes = gzip(chunk(files, name));
      expect(bytes, `gzip ${name} is ${formatBytes(bytes)}`).toBeLessThanOrEqual(budget);
    }
  });

  it("loads three.js only after a page already works", () => {
    // Both pages work before their scene arrives (the form posts, the station
    // listens), so three.js must stay behind a dynamic import, never in the
    // static graph of a page's own script.
    expect(entries.length).toBeGreaterThan(0);
    const three = basename(chunk(files, "three"));
    for (const entry of entries) {
      const seen = new Set<string>();
      const queue = [basename(entry)];
      while (queue.length > 0) {
        const next = queue.pop()!;
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(...staticImports(join(CLIENT, "_astro", next)));
      }
      expect([...seen], `${basename(entry)} statically imports three.js`).not.toContain(three);
      const bytes = sum(
        [...seen].map((name) => join(CLIENT, "_astro", name)),
        gzip,
      );
      expect(bytes, `${basename(entry)} needs ${formatBytes(bytes)} before it works`).toBeLessThanOrEqual(
        BUDGETS.entryGzipBytes,
      );
    }
  });
});
