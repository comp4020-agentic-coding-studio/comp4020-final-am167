import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";
import { Session, callsign } from "./session.ts";

// The sky page stays one screen: the scene, what the station hears, and a
// short summary of the sky. The full record of everything ever launched is
// the catalogue, on its own page. Both work without JavaScript.
const baseUrl = inject("baseUrl");
const doc = (html: string) => new JSDOM(html).window.document;

interface SkyObject {
  id: number;
  callsign: string;
  band: "low" | "mid" | "high";
  launchedAt: number;
}

async function skyPage(session = new Session(baseUrl)) {
  const page = doc(await (await session.get("/sky/")).text());
  const data = JSON.parse(page.getElementById("sky-data")!.textContent!) as { sky: SkyObject[] };
  return { page, sky: data.sky };
}

describe("the sky page", () => {
  it("sums up what's in orbit per band instead of listing it", async () => {
    await new Session(baseUrl).launch({ band: "high", callsign: callsign(), beacon: "counted" });
    const { page, sky } = await skyPage();
    expect(page.querySelector("table"), "the sky page still has a table").toBeNull();
    for (const band of ["low", "mid", "high"] as const) {
      const shown = page.querySelector(`[data-band-count="${band}"]`)?.textContent;
      expect(Number(shown), `${band} count`).toBe(sky.filter((o) => o.band === band).length);
    }
  });

  it("lists the latest launches, newest first", async () => {
    const name = callsign();
    await new Session(baseUrl).launch({ band: "mid", callsign: name, beacon: "recent" });
    const { page, sky } = await skyPage();
    const items = [...page.querySelectorAll("#recent li")].map((li) => li.textContent ?? "");
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(6);
    const newest = [...sky].sort((a, b) => b.launchedAt - a.launchedAt);
    items.forEach((text, i) => expect(text).toContain(newest[i].callsign));
    // a beacon is only heard over the station, never in the summary
    expect(items.join(" ")).not.toContain("recent");
  });

  it("links to the full catalogue", async () => {
    const { page } = await skyPage();
    expect(page.querySelector('a[href="/catalogue/"]')).not.toBeNull();
  });
});

describe("the catalogue", () => {
  it("lists every satellite in orbit, with its band, and marks yours", async () => {
    const a = new Session(baseUrl);
    const name = callsign();
    await a.launch({ band: "low", callsign: name, beacon: "in the record" });
    const page = doc(await (await a.get("/catalogue/")).text());
    const row = [...page.querySelectorAll("tbody tr")].find((tr) => tr.textContent?.includes(name));
    expect(row, "the launch isn't in the catalogue").toBeDefined();
    expect(row!.textContent).toMatch(/Low/);
    expect(row!.textContent).toMatch(/In orbit/);
    expect(row!.textContent).toMatch(/yours/);
    expect(row!.textContent).not.toContain("in the record");
  });

  it("can show everything ever launched, by a plain link", async () => {
    const name = callsign();
    await new Session(baseUrl).launch({ band: "mid", callsign: name, beacon: "ever" });
    const page = doc(await (await new Session(baseUrl).get("/catalogue/")).text());
    const all = page.querySelector<HTMLAnchorElement>('a[href="/catalogue/?show=all"]');
    expect(all, "no link to everything ever launched").not.toBeNull();
    const everything = await new Session(baseUrl).get("/catalogue/?show=all");
    expect(everything.status).toBe(200);
    expect(await everything.text()).toContain(name);
  });
});
