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

  it("no longer calls decay unbuilt", async () => {
    const rows = [...(await page("/kessler/")).querySelectorAll(".mapping tbody tr")];
    const decay = rows.find((tr) => /drag/i.test(tr.querySelector("th")?.textContent ?? ""));
    expect(decay, "no row for decay").toBeDefined();
    expect(decay!.textContent).not.toMatch(/not built yet/i);
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
