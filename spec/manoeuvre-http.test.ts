import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";
import { Session, callsign, events, post } from "./session.ts";

// Deorbiting and boosting, over HTTP (ADR 0011): your own satellites, from
// the sky's station panel, by a plain form that works without JavaScript
// (or as JSON for the page's script); nobody else's; once for a boost; and
// everyone watching is told. The launchpad stays for launching.

const baseUrl = inject("baseUrl");
const doc = (html: string) => new JSDOM(html).window.document;
const page = async (s: Session, path: string) => doc(await (await s.get(path)).text());

// a launch, and the new satellite's id
async function launched(s: Session, band = "low", name = callsign()) {
  const res = await s.launch({ band, callsign: name, beacon: "up for a while" });
  expect(res.status).toBe(303);
  const id = Number(new URL(res.headers.get("location")!, baseUrl).searchParams.get("launched"));
  expect(id).toBeGreaterThan(0);
  return { id, name };
}

const manoeuvre = (s: Session, id: number, action: "deorbit" | "boost", headers = {}) =>
  post(s, "/manoeuvre/", { id: String(id), action }, headers);
const json = { accept: "application/json" };

// what the sky's station panel offers for your satellite: the forms shown
async function offered(s: Session) {
  const sky = await page(s, "/sky/");
  const panel = sky.querySelector(".station")!;
  const shown = [...panel.querySelectorAll<HTMLFormElement>('form[method="post"][action="/manoeuvre/"]')].filter(
    (form) => !form.hasAttribute("hidden"),
  );
  // the line saying why there's no boost, if it's shown
  const spent = panel.querySelector("[data-spent]:not([hidden])")?.textContent ?? "";
  return {
    panel,
    spent,
    actions: shown.map((form) => form.querySelector<HTMLButtonElement>('button[name="action"]')!.value),
    ids: shown.map((form) => form.querySelector<HTMLInputElement>('input[name="id"]')!.value),
  };
}

// a satellite's row in the catalogue, found by its callsign
async function row(s: Session, name: string) {
  const catalogue = await page(s, "/catalogue/");
  return [...catalogue.querySelectorAll("tbody tr")].find((tr) => tr.textContent?.includes(name));
}

describe("the launchpad", () => {
  it("lists your satellites but offers no manoeuvres: it's for launching", async () => {
    const a = new Session(baseUrl);
    const { name } = await launched(a);
    const pad = await page(a, "/");
    expect(pad.querySelector(".console")?.textContent).toContain(name);
    expect(pad.querySelector('form[action="/manoeuvre/"]')).toBeNull();
  });
});

describe("the sky's station panel", () => {
  it("offers to boost or bring down your satellite, as plain forms", async () => {
    const a = new Session(baseUrl);
    const { id } = await launched(a);
    const { actions, ids, panel, spent } = await offered(a);
    expect(actions).toEqual(["boost", "deorbit"]);
    expect(ids).toEqual([String(id), String(id)]);
    expect(panel.textContent).toMatch(/boost to mid/i);
    expect(spent).toBe("");
  });

  it("offers nothing to someone with no satellite up", async () => {
    const sky = await page(new Session(baseUrl), "/sky/");
    expect(sky.querySelector('.station form[action="/manoeuvre/"]')).toBeNull();
  });

  it("offers no boost from the high band, and says why", async () => {
    const a = new Session(baseUrl);
    await launched(a, "high");
    const { actions, spent } = await offered(a);
    expect(actions).toEqual(["deorbit"]);
    expect(spent).toMatch(/highest band/i);
  });
});

describe("bringing your satellite down", () => {
  it("starts it down and thanks you, without JavaScript", async () => {
    const a = new Session(baseUrl);
    const { id, name } = await launched(a);
    const res = await manoeuvre(a, id, "deorbit");
    expect(res.status).toBe(303);
    const location = res.headers.get("location")!;
    expect(location).toBe(`/sky/?deorbited=${id}`);
    const sky = await page(a, location);
    const thanks = sky.querySelector("dialog#thanks");
    expect(thanks, "no thank-you").not.toBeNull();
    expect(thanks!.hasAttribute("open")).toBe(true);
    expect(thanks!.textContent).toContain(name);
    expect(thanks!.textContent).toMatch(/thank/i);
    // it's coming down, with nothing more to do to it
    expect((await row(a, name))?.textContent).toMatch(/in orbit, coming down/i);
    expect((await offered(a)).actions).toEqual([]);
  });

  it("answers the page's script with JSON", async () => {
    const a = new Session(baseUrl);
    const { id } = await launched(a);
    const res = await manoeuvre(a, id, "deorbit", json);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { object: { id: number; deorbitedAt: number; mine: boolean; owner?: string } };
    expect(body.object).toMatchObject({ id, mine: true });
    expect(body.object.deorbitedAt).toBeGreaterThan(0);
    expect(body.object).not.toHaveProperty("owner");
  });

  it("is refused for someone else's satellite, which stays as it was", async () => {
    const a = new Session(baseUrl);
    const b = new Session(baseUrl);
    await b.get("/");
    const { id, name } = await launched(a);
    const res = await manoeuvre(b, id, "deorbit", json);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await row(a, name))?.textContent).not.toMatch(/coming down/i);
  });

  it("tells everyone watching, without saying whose it is", async () => {
    const a = new Session(baseUrl);
    const watcher = new Session(baseUrl);
    const { id } = await launched(a);
    const controller = new AbortController();
    const stream = events(await fetch(watcher.url("/api/events"), { headers: watcher.headers(), signal: controller.signal }));
    try {
      for (;;) if ((await stream.next()).event === "hello") break;
      await manoeuvre(a, id, "deorbit");
      for (;;) {
        const { event, data } = await stream.next();
        if (event !== "manoeuvre") continue;
        const told = data as { manoeuvre: string; object: { id: number; mine: boolean; owner?: string } };
        if (told.object.id !== id) continue;
        expect(told.manoeuvre).toBe("deorbit");
        expect(told.object.mine).toBe(false);
        expect(JSON.stringify(told)).not.toContain(a.cookie("kessler_person")!);
        break;
      }
    } finally {
      controller.abort();
    }
  });
});

describe("boosting your satellite", () => {
  it("sends it climbing to the next band", async () => {
    const a = new Session(baseUrl);
    const { id, name } = await launched(a);
    const res = await manoeuvre(a, id, "boost");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`/sky/?boosted=${id}`);
    expect((await row(a, name))?.textContent).toMatch(/in orbit, climbing/i);
  });

  it("works once: a second is refused, and the panel says the boost is used", async () => {
    const a = new Session(baseUrl);
    const { id } = await launched(a);
    expect((await manoeuvre(a, id, "boost", json)).status).toBe(200);
    const again = await manoeuvre(a, id, "boost", json);
    expect(again.status).toBe(422);
    expect(((await again.json()) as { error: string }).error).toMatch(/fuel/i);
    const { actions, spent } = await offered(a);
    expect(actions).toEqual(["deorbit"]);
    expect(spent).toMatch(/boost used/i);
  });

  it("works once even when asked twice at the same moment", async () => {
    const a = new Session(baseUrl);
    const { id } = await launched(a);
    const answers = await Promise.all([manoeuvre(a, id, "boost", json), manoeuvre(a, id, "boost", json)]);
    expect(answers.map((res) => res.status).sort()).toEqual([200, 422]);
  });

  it("works once across devices signed in as the same operator", async () => {
    const handle = `bo_${Math.random().toString(36).slice(2, 10)}`;
    const phone = new Session(baseUrl);
    expect((await post(phone, "/operator/", { action: "claim", handle, passphrase: "correct horse battery" })).status).toBe(303);
    const { id } = await launched(phone);
    const laptop = new Session(baseUrl);
    await laptop.get("/");
    expect((await post(laptop, "/operator/", { action: "sign-in", handle, passphrase: "correct horse battery" })).status).toBe(303);
    expect((await manoeuvre(phone, id, "boost", json)).status).toBe(200);
    expect((await manoeuvre(laptop, id, "boost", json)).status).toBe(422);
    // and the laptop can still bring it down: it's theirs there too
    expect((await manoeuvre(laptop, id, "deorbit", json)).status).toBe(200);
  });
});

describe("where a manoeuvre comes from", () => {
  it("refuses a post from another site, and leaves the satellite as it was", async () => {
    const a = new Session(baseUrl);
    const { id, name } = await launched(a);
    const res = await post(a, "/manoeuvre/", { id: String(id), action: "deorbit" }, { origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect((await row(a, name))?.textContent).not.toMatch(/coming down/i);
  });

  it("only ever goes back to the sky", async () => {
    const a = new Session(baseUrl);
    const { id } = await launched(a);
    const res = await post(a, "/manoeuvre/", { id: String(id), action: "boost", back: "//evil.example/" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`/sky/?boosted=${id}`);
  });
});
