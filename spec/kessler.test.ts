import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";
import { Session } from "./session.ts";

// People who don't know what Kessler syndrome is miss the app's argument, so
// a plain-language page explains it, and the launchpad and the sky link to it.
// It's server-rendered, so it reads the same without JavaScript.
const baseUrl = inject("baseUrl");
const doc = (html: string) => new JSDOM(html).window.document;
const page = async (path: string) => doc(await (await new Session(baseUrl).get(path)).text());

describe("the Kessler syndrome page", () => {
  it("is served at /kessler/ and says what it explains", async () => {
    const res = await new Session(baseUrl).get("/kessler/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const h1 = doc(await res.text()).querySelector("h1");
    expect(h1?.textContent).toMatch(/Kessler syndrome/i);
  });

  it("names the real cases and the paper the idea comes from", async () => {
    const text = (await page("/kessler/")).body.textContent ?? "";
    expect(text).toMatch(/Fengyun-1C/);
    expect(text).toMatch(/Iridium 33/);
    expect(text).toMatch(/[KC]osmos[- ]2251/);
    expect(text).toMatch(/Kessler[^.]*Cour-Palais/);
    expect(text).toMatch(/1978/);
  });

  it("ties the idea back to the app: the sky to watch and a satellite to launch", async () => {
    const kessler = await page("/kessler/");
    const main = kessler.querySelector("main")!;
    expect(main.querySelector('a[href="/sky/"]'), "no link to the sky").not.toBeNull();
    expect(main.querySelector('a[href="/"]'), "no link to the launchpad").not.toBeNull();
  });

  it.each([
    ["decay", /drag/i],
    ["collisions", /collision makes fragments/i],
    ["lineage", /traced/i],
    ["deorbiting", /bring a satellite down/i],
  ])("no longer calls %s unbuilt", async (name, heading) => {
    const rows = [...(await page("/kessler/")).querySelectorAll(".mapping tbody tr")];
    const row = rows.find((tr) => heading.test(tr.querySelector("th")?.textContent ?? ""));
    expect(row, `no row for ${name}`).toBeDefined();
    expect(row!.textContent).not.toMatch(/not built yet/i);
  });

  it("says the collision physics is a toy (ADR 0008)", async () => {
    const text = (await page("/kessler/")).querySelector("main")!.textContent ?? "";
    expect(text).toMatch(/opposite ways|other way/i);
    expect(text).toMatch(/real collisions/i);
  });

  // the Why page says what the app is for and argues it (ADR 0018), so this
  // page keeps to the physics and doesn't argue it twice (the user's
  // review, 2026-10-08)
  it("leaves what the app is for to the Why page, which cites what it argues from", async () => {
    const main = (await page("/kessler/")).querySelector("main")!;
    expect(main.querySelector('a[href="/why/"]'), "no link to /why/").not.toBeNull();
    const text = main.textContent ?? "";
    expect(text, "argues Ostrom's commons again").not.toMatch(/Ostrom/);
    expect(text, "explains being heard again").not.toMatch(/stations keep count|heard by everyone/i);
    const why = (await page("/why/")).querySelector("main")!;
    const sources = why.querySelector(".sources")?.textContent ?? "";
    expect(sources).toMatch(/Hardin[^]*1968/);
    expect(sources).toMatch(/Kessler[^]*Cour-Palais[^]*1978/);
    expect(sources).toMatch(/Ostrom[^]*1990/);
  });

  // Astro drops the space where a line of text breaks before or after a tag,
  // which ran citations together ("Science162", "belt.Journal") and said
  // "every3 minutes" (the user's review, 2026-10-08)
  it.each(["/kessler/", "/why/"])("keeps the spaces in %s's sources and figures", async (path) => {
    const main = (await page(path)).querySelector("main")!;
    for (const el of main.querySelectorAll(".sources cite, .sources a")) {
      const before = el.previousSibling?.textContent ?? " ";
      const after = el.nextSibling?.textContent ?? " ";
      expect(before, `nothing before ${el.textContent}`).toMatch(/[\s(]$/);
      expect(after, `nothing after ${el.textContent}`).toMatch(/^[\s.,)]|^$/);
    }
    expect(main.textContent).not.toMatch(/every\d/);
  });

  for (const [name, path] of [
    ["the launchpad", "/"],
    ["the sky", "/sky/"],
  ] as const) {
    it(`is linked from ${name}`, async () => {
      const main = (await page(path)).querySelector("main")!;
      expect(main.querySelector('a[href="/kessler/"]'), `${name} doesn't link to /kessler/ in its content`).not.toBeNull();
    });
  }
});
