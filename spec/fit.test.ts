import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { Session, callsign } from "./session.ts";

// The launchpad and the sky are each one screen on a laptop or desktop: no
// scrolling, and what matters (the Launch button; the beacons, your line and
// its buttons, the news and the links) wholly on it. That's layout, which
// the HTTP checks can't see, so this one drives a real Chrome against the
// running app and measures the rendered page in the heaviest state a person
// can reach: a satellite of their own just launched (its line and manoeuvre
// buttons on the sky, the "yours in orbit" and "launch again in" notices on
// the launchpad), with the longest lines either page can write. On a phone
// both pages scroll by design, so it doesn't check them.
//
// Chrome is found at CHROME_PATH (or PERF_CHROME_PATH, as the performance
// suite does), else the installed stable Chrome, else Playwright's own.
const baseUrl = inject("baseUrl");

// Browser windows on common laptop and desktop screens, down to 640 tall
// (a 1366×768 laptop leaves about 657 under the browser's own bars), and the
// 1512×757 a MacBook's Chrome gave when the sky overflowed.
const SCREENS: [number, number][] = [
  [1920, 1080],
  [1536, 864],
  [1512, 757],
  [1440, 800],
  [1366, 768],
  [1366, 657],
  [1280, 720],
  [1280, 640],
  [1024, 768],
  [900, 700],
];

async function launchChrome(): Promise<Browser> {
  const executablePath = process.env.CHROME_PATH ?? process.env.PERF_CHROME_PATH;
  if (executablePath) return chromium.launch({ executablePath });
  try {
    return await chromium.launch({ channel: "chrome" });
  } catch {
    try {
      return await chromium.launch();
    } catch (error) {
      throw new Error(`no Chrome to check the layout with: install Chrome, or set CHROME_PATH to one (${String(error)})`);
    }
  }
}

let browser: Browser;
let context: BrowserContext;

beforeAll(async () => {
  browser = await launchChrome();
  // a person with a satellite in orbit, launched a moment ago: in the
  // middle band, which can still be boosted and is less crowded than the
  // low one, where the spec's other launches go and debris could hit it
  // before the sky is measured
  const person = new Session(baseUrl);
  const res = await person.launch({ band: "mid", callsign: callsign("FIT").padEnd(16, "W"), beacon: "W".repeat(60) });
  expect(res.status, "the fit check's launch was refused").toBe(303);
  context = await browser.newContext({ viewport: { width: SCREENS[0][0], height: SCREENS[0][1] } });
  await context.addCookies([{ name: "kessler_person", value: person.cookie("kessler_person")!, url: baseUrl }]);
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

// What a page must show on the first screen, and how to put it in its
// heaviest state: `fill` writes in the longest form of what it says.
interface State {
  essentials: string[];
  fill: () => void;
}

interface Measured {
  size: number[];
  down: number;
  across: number;
  // essentials not shown, or not wholly on the screen
  missing: string[];
}

// Resizes and measures once the page has settled: the fit unchanged for
// three frames.
async function measure(page: Page, [width, height]: [number, number], essentials: string[]): Promise<Measured> {
  await page.setViewportSize({ width, height });
  return page.evaluate(async (essentials) => {
    let last = "";
    for (let frame = 0, same = 0; frame < 60 && same < 3; frame++) {
      await new Promise(requestAnimationFrame);
      const now = [...document.querySelectorAll<HTMLElement>("[data-fit]")].map((el) => el.dataset.fit).join("|") + document.documentElement.scrollHeight;
      same = now === last ? same + 1 : 0;
      last = now;
    }
    const root = document.documentElement;
    return {
      size: [innerWidth, innerHeight],
      down: root.scrollHeight - innerHeight,
      across: root.scrollWidth - innerWidth,
      missing: essentials.filter((selector) => {
        const el = document.querySelector(selector);
        const box = el?.getBoundingClientRect();
        return !el || !box || el.getClientRects().length === 0 || box.top < 0 || box.bottom > innerHeight;
      }),
    };
  }, essentials);
}

async function expectFits(page: Page, path: string, what: string, state: State) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(new URL(path, baseUrl).href, { waitUntil: "load" });
  await page.locator(state.essentials[0]).first().waitFor();
  await page.evaluate(state.fill);
  const problems: string[] = [];
  for (const screen of SCREENS) {
    const got = await measure(page, screen, state.essentials);
    const at = screen.join("×");
    expect(got.size, "the viewport wasn't the size asked for").toEqual(screen);
    if (got.down > 0) problems.push(`${what} scrolls down ${got.down}px at ${at}`);
    if (got.across > 0) problems.push(`${what} scrolls sideways ${got.across}px at ${at}`);
    for (const selector of got.missing) problems.push(`${what} doesn't show ${selector} at ${at}`);
  }
  expect(problems).toEqual([]);
  expect(errors, `${what} threw`).toEqual([]);
}

describe("one screen, no scrolling", () => {
  it("the launchpad, with satellites up and a launch to wait for", async () => {
    const page = await context.newPage();
    await expectFits(page, "/", "the launchpad", {
      essentials: ["#launch-wait", ".notice strong", "input[name=band][value=high]", "#callsign", "#beacon", "form[data-launch] button[type=submit]"],
      // the longest the line about yours gets: a name and "N more"
      fill: () => {
        const strong = document.querySelector(".notice strong")!;
        strong.previousSibling!.textContent = "Yours in orbit (12): ";
        strong.textContent = `${"W".repeat(16)} and 11 more`;
      },
    });
    await page.close();
  }, 120_000);

  it("the sky, with your satellite's line and buttons and the longest news", async () => {
    const page = await context.newPage();
    await expectFits(page, "/sky/", "the sky", {
      essentials: ["#your-controls button", ".post[data-station=madrid]", "#your-pass", "#sky-news", '.more a[href="/catalogue/"]', '.more a[href="/"]'],
      // the longest lines the page writes: yours, with several up and one
      // over a station, and a cascade's debris destroying a satellite.
      // The page rewrites both every second or so, so they're pinned: what
      // its script writes to them is dropped.
      fill: () => {
        const pin = (el: HTMLElement, text: string) => {
          el.hidden = false;
          el.textContent = text;
          Object.defineProperty(el, "textContent", { get: () => text, set: () => {} });
          Object.defineProperty(el, "hidden", { get: () => false, set: () => {} });
          el.replaceChildren = () => {};
        };
        const name = "W".repeat(16);
        pin(
          document.getElementById("your-pass")!,
          `You have 12 up. ${name} is over Goldstone now: everyone watching can see your beacon. It burns up in 23 h.`,
        );
        pin(document.getElementById("sky-news")!, `Debris from ${name}, ${name} and 5 others' collision destroyed ${name} 2 min ago.`);
      },
    });
    await page.close();
  }, 120_000);
});
