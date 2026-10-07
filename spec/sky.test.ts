import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";
import { bandAt, bandReach, heightKm, radiusAt } from "../src/lib/orbit.ts";
import { Session, callsign, post } from "./session.ts";

// The sky page stays one screen: the scene, what the ground stations hear, and a
// short summary of the sky. The full record of everything ever launched is
// the catalogue, on its own page. Both work without JavaScript.
const baseUrl = inject("baseUrl");
const doc = (html: string) => new JSDOM(html).window.document;

interface SkyObject {
  id: number;
  kind: "satellite" | "derelict" | "debris";
  callsign: string;
  band: "low" | "mid" | "high";
  launchedAt: number;
  radius: number;
  phase: number;
  period: number;
  epoch: number;
}

async function skyPage(session = new Session(baseUrl)) {
  const page = doc(await (await session.get("/sky/")).text());
  const data = JSON.parse(page.getElementById("sky-data")!.textContent!) as { serverTime: number; sky: SkyObject[] };
  return { page, sky: data.sky, serverTime: data.serverTime };
}

describe("the sky page", () => {
  it("explains how the sky works after your first launch, and only then", async () => {
    const a = new Session(baseUrl);
    const res = await a.launch({ band: "low", callsign: callsign(), beacon: "first one" });
    const where = res.headers.get("location")!;
    const page = doc(await (await a.get(where)).text());
    const dialog = page.querySelector("dialog#first-launch");
    expect(dialog, "no explainer after a first launch").not.toBeNull();
    // open without JavaScript too
    expect(dialog!.hasAttribute("open")).toBe(true);
    const text = dialog!.textContent!;
    for (const point of [/beacon/i, /burns? up/i, /collide/i, /debris/i, /5 minutes/i, /boost/i, /bring it down/i]) {
      expect(text, String(point)).toMatch(point);
    }
    // it can be closed without JavaScript beyond the dialog's own
    expect(dialog!.querySelector('form[method="dialog"] button')).not.toBeNull();

    // not on the sky otherwise, or for someone else following the same link
    expect((await skyPage(a)).page.querySelector("dialog#first-launch")).toBeNull();
    const b = doc(await (await new Session(baseUrl).get(where)).text());
    expect(b.querySelector("dialog#first-launch")).toBeNull();
  });

  it("doesn't offer a handle in the explainer to someone who has one", async () => {
    const a = new Session(baseUrl);
    const h = `op_${Math.random().toString(36).slice(2, 10)}`;
    await post(a, "/operator/", { action: "claim", handle: h, passphrase: "correct horse battery" });
    const res = await a.launch({ band: "mid", callsign: callsign(), beacon: "signed in first" });
    const dialog = doc(await (await a.get(res.headers.get("location")!)).text()).querySelector("dialog#first-launch");
    expect(dialog, "no explainer for an operator's first launch").not.toBeNull();
    expect(dialog!.querySelector('a[href^="/operator/"]')).toBeNull();
  });

  it("sums up what's in orbit per band instead of listing it", async () => {
    await new Session(baseUrl).launch({ band: "high", callsign: callsign(), beacon: "counted" });
    const { page, sky, serverTime } = await skyPage();
    expect(page.querySelector("table"), "the sky page still has a table").toBeNull();
    // counted by where each one is now, since orbits fall through the bands
    // (ADR 0007), not the band it was launched into
    for (const band of ["low", "mid", "high"] as const) {
      const shown = page.querySelector(`[data-band-count="${band}"]`)?.textContent;
      const there = sky.filter((o) => bandAt(radiusAt(o, serverTime)) === band).length;
      expect(Number(shown), `${band} count`).toBe(there);
    }
  });

  it("lists the latest launches by people, newest first", async () => {
    const name = callsign();
    await new Session(baseUrl).launch({ band: "mid", callsign: name, beacon: "recent" });
    const { page, sky } = await skyPage();
    const items = [...page.querySelectorAll("#recent li")].map((li) => li.textContent ?? "");
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(6);
    // derelicts and debris aren't launches (ADR 0008)
    const newest = sky.filter((o) => o.kind === "satellite").sort((a, b) => b.launchedAt - a.launchedAt);
    items.forEach((text, i) => expect(text).toContain(newest[i].callsign));
    // a beacon is only heard over a ground station, never in the summary
    expect(items.join(" ")).not.toContain("recent");
  });

  it("links to the full catalogue", async () => {
    const { page } = await skyPage();
    expect(page.querySelector('a[href="/catalogue/"]')).not.toBeNull();
  });

  // ADR 0014: three ground stations, all heard by everyone
  it("has a beacon panel with a row for each of the three ground stations", async () => {
    const { page } = await skyPage();
    const panel = page.querySelector(".station")!;
    expect(panel.querySelector("h2")?.textContent).toBe("Beacons");
    const rows = [...panel.querySelectorAll("[data-station]")];
    expect(rows.map((row) => row.getAttribute("data-station"))).toEqual(["canberra", "goldstone", "madrid"]);
    expect(rows.map((row) => row.querySelector(".post-name")?.textContent)).toEqual(["Canberra", "Goldstone", "Madrid"]);
    // what each hears is announced as it changes
    for (const row of rows) expect(row.querySelector("[aria-live]")).not.toBeNull();
  });

  // the user's review, 2026-10-08: the page got crowded, so its boxes fold
  it("serves its three boxes open, each with a hidden button to fold it", async () => {
    const { page } = await skyPage();
    const boxes = [...page.querySelectorAll("[data-collapsible]")];
    expect(boxes.map((b) => b.querySelector("h2")?.textContent)).toEqual(["Sky now", "Beacons", "Heard"]);
    for (const box of boxes) {
      const button = box.querySelector(".box-toggle")!;
      expect(button, "no button").not.toBeNull();
      expect(button.hasAttribute("hidden"), "button shown without the script").toBe(true);
      expect(button.getAttribute("aria-expanded")).toBe("true");
      const body = page.getElementById(button.getAttribute("aria-controls") ?? "")!;
      expect(box.contains(body), "it folds something outside its box").toBe(true);
      expect(body.hasAttribute("hidden")).toBe(false);
      // the heading stays when it's folded
      expect(body.contains(box.querySelector("h2"))).toBe(false);
    }
  });

  it("says who's listening, and lists what the stations have heard, without JavaScript", async () => {
    const { page } = await skyPage();
    const rail = page.querySelector(".rail")!;
    expect(rail, "no beacons column").not.toBeNull();
    // the stations live, and how many people are here (this viewer among them)
    expect(rail.querySelector(".station [data-station]")).not.toBeNull();
    const listening = rail.querySelector("#listening")!;
    expect(Number(listening.getAttribute("data-listening"))).toBeGreaterThanOrEqual(1);
    expect(listening.textContent).toMatch(/listening/i);
    // what's been heard (ADR 0016): a feed, or a line saying nothing has been yet
    const heard = rail.querySelector("section.heard")!;
    expect(heard.querySelector("h2")?.textContent).toBe("Heard");
    expect(heard.querySelector("ol#feed")).not.toBeNull();
    const items = [...heard.querySelectorAll("#feed > li")];
    if (items.length === 0) expect(heard.querySelector("#feed-empty")?.hasAttribute("hidden")).toBe(false);
    for (const item of items) {
      expect(item.querySelector(".heard-line")?.textContent).not.toBe("");
      // a beacon says who heard it; a wreck's static (one card for all its
      // fragments) says how much of it is still up
      expect(item.querySelector(".heard-meta")?.textContent?.trim()).toMatch(
        item.classList.contains("static")
          ? /^Over (Canberra|Goldstone|Madrid) · \d+ pass(es)? · (\d+ of \d+ pieces still up|all fallen silent)$/
          : /^Over (Canberra|Goldstone|Madrid) · Heard by /,
      );
      // nobody's card says "no handle"
      expect(item.textContent).not.toMatch(/no handle/);
      expect(item.querySelector('a[href^="/object/"]')).not.toBeNull();
    }
  });

  it("opens on the whole sky, with the horizon over each station a button away", async () => {
    const { page } = await skyPage();
    const views = [...page.querySelectorAll<HTMLButtonElement>(".views button")];
    expect(views.map((b) => b.textContent)).toEqual(["Whole sky", "Canberra", "Goldstone", "Madrid"]);
    expect(views.map((b) => b.getAttribute("aria-pressed"))).toEqual(["true", "false", "false", "false"]);
  });

  it("opens over Canberra, where the launch camera ends, straight after a launch", async () => {
    const session = new Session(baseUrl);
    const launched = await session.launch({ band: "low", callsign: callsign(), beacon: "hand-off" });
    const location = launched.headers.get("location") ?? "";
    expect(location).toMatch(/\/sky\/\?launched=\d+/);
    const page = doc(await (await session.get(location)).text());
    const pressed = page.querySelector('.views button[aria-pressed="true"]');
    expect(pressed?.textContent).toBe("Canberra");
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

  it("shows how high each satellite is now, and how fast it's falling", async () => {
    const a = new Session(baseUrl);
    const name = callsign();
    await a.launch({ band: "low", callsign: name, beacon: "how high" });
    const page = doc(await (await a.get("/catalogue/")).text());
    const headers = [...page.querySelectorAll("thead th")].map((th) => th.textContent);
    expect(headers).toContain("Height");
    const row = [...page.querySelectorAll("tbody tr")].find((tr) => tr.textContent?.includes(name))!;
    const text = row.querySelector(".height")?.textContent ?? "";
    const match = text.match(/([\d,]+\.\d+) km/);
    expect(match, `no height in "${text}"`).not.toBeNull();
    const km = Number(match![1].replace(/,/g, ""));
    const { min, max } = bandReach("low");
    expect(km).toBeGreaterThanOrEqual(Math.floor(heightKm(min)) - 1);
    expect(km).toBeLessThanOrEqual(heightKm(max));
    expect(text).toMatch(/↓\s*[\d.]+ km\/h/);
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

describe("the catalogue's collisions", () => {
  it("keeps a record of collisions, each told with who it names", async () => {
    const page = doc(await (await new Session(baseUrl).get("/catalogue/")).text());
    const section = page.getElementById("collisions");
    expect(section, "no collisions section").not.toBeNull();
    expect(section!.querySelector("h2")?.textContent).toBe("Collisions");
    // each one told with what met and who launched what (ADR 0010)
    for (const li of section!.querySelectorAll("li")) {
      expect(li.querySelector(".collision-title")?.textContent).toMatch(/collided|destroyed/);
      expect(li.querySelector(".collision-blame")?.textContent).toMatch(/operator|nobody's|:/);
    }
  });
});
