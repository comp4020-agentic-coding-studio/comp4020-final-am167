import { chromium, type Browser, type BrowserContext } from "playwright-core";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { callsign } from "../spec/session.ts";

// The launchpad and the sky are each one screen on a desktop: everything,
// the Launch button included, is in view without scrolling the page. Only a
// real browser can lay a page out, so this drives installed Chrome against the
// running app at APP_URL, like the spec suite, but runs on its own
// (`pnpm test:layout`): CI has no Chrome.
const baseUrl = inject("baseUrl");

// The marking viewport, then laptops as Chrome shows them: the screen's
// default resolution less the menu bar and the browser's own toolbar.
const VIEWPORTS = [
  { name: "the marking desktop", width: 1920, height: 1080 },
  { name: "a 14-inch MacBook Pro", width: 1512, height: 860 },
  { name: "a 13-inch MacBook Air", width: 1440, height: 790 },
];

const PAGES = [
  { name: "the launchpad", path: "/" },
  { name: "the sky", path: "/sky/" },
];

let browser: Browser;
// Someone who has just launched: the launchpad then carries notices
// (yours in orbit, the wait until the next launch) that a new visitor's lacks.
let launched: Awaited<ReturnType<BrowserContext["storageState"]>>;

beforeAll(async () => {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext();
  const res = await context.request.post(new URL("/", baseUrl).href, {
    form: { band: "low", callsign: callsign("L"), beacon: "checking the layout" },
    headers: { origin: new URL(baseUrl).origin },
    maxRedirects: 0,
  });
  if (res.status() !== 303) throw new Error(`the setup launch was refused (${res.status()}); is the sky full?`);
  launched = await context.storageState();
  await context.close();
});

afterAll(async () => {
  await browser?.close();
});

interface Fit {
  viewport: { width: number; height: number };
  overflow: number;
  clipped: string[];
}

async function measure(path: string, viewport: { width: number; height: number }, visitor: "new" | "launched"): Promise<Fit> {
  const context = await browser.newContext({ viewport, storageState: visitor === "launched" ? launched : undefined });
  try {
    const page = await context.newPage();
    await page.goto(new URL(path, baseUrl).href, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    // let the page's scripts finish fitting the scene to the window
    await page.waitForTimeout(500);
    return await page.evaluate(() => {
      const root = document.scrollingElement!;
      // A control inside a panel that scrolls on its own is still in reach.
      const inScrollingPanel = (el: Element) => {
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const { overflowY } = getComputedStyle(p);
          if (overflowY === "auto" || overflowY === "scroll") return true;
        }
        return false;
      };
      // Anything else must be on screen, so the page can't pass by hiding
      // its overflow instead of fitting.
      const clipped = [...document.querySelectorAll("a[href], button, input, select, textarea, summary")]
        .filter((el) => el.checkVisibility({ visibilityProperty: true }) && !inScrollingPanel(el))
        .map((el) => ({ el, box: el.getBoundingClientRect() }))
        .filter(({ box }) => box.width > 0 && box.height > 0 && (box.top < -0.5 || box.bottom > innerHeight + 0.5))
        .map(({ el, box }) => {
          const label = (el.textContent?.trim() || el.getAttribute("aria-label") || el.getAttribute("name") || "").slice(0, 40);
          return `<${el.tagName.toLowerCase()}> "${label}" at y ${Math.round(box.top)}–${Math.round(box.bottom)}`;
        });
      return {
        viewport: { width: innerWidth, height: innerHeight },
        overflow: root.scrollHeight - root.clientHeight,
        clipped,
      };
    });
  } finally {
    await context.close();
  }
}

for (const viewport of VIEWPORTS) {
  describe(`at ${viewport.width}x${viewport.height} (${viewport.name})`, () => {
    for (const { name, path } of PAGES) {
      for (const visitor of ["new", "launched"] as const) {
        const who = visitor === "new" ? "a new visitor" : "someone who has just launched";
        it(`${name} doesn't scroll vertically for ${who}`, async () => {
          const fit = await measure(path, viewport, visitor);
          expect(fit.viewport, "the browser didn't take the viewport").toEqual({
            width: viewport.width,
            height: viewport.height,
          });
          expect(fit.overflow, `${path} is ${fit.overflow}px taller than the window`).toBeLessThanOrEqual(0);
          expect(fit.clipped, `${path} has controls off screen`).toEqual([]);
        });
      }
    }
  });
}
