import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";
import { Session, callsign, events, post } from "./session.ts";

// Deorbiting and boosting, over HTTP (ADR 0011): your own satellites, from
// the launchpad and the sky, by a plain form that works without JavaScript
// (or as JSON for the page's script); nobody else's; and everyone watching
// is told.

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

const manoeuvre = (s: Session, id: number, action: "deorbit" | "boost", back = "/", headers = {}) =>
  post(s, "/manoeuvre/", { id: String(id), action, back }, headers);

// a satellite's controls on the launchpad, found by its callsign
async function controls(s: Session, name: string) {
  const pad = await page(s, "/");
  const item = [...pad.querySelectorAll("[data-yours] li")].find((li) => li.textContent?.includes(name));
  return { pad, item };
}

describe("your satellites on the launchpad", () => {
  it("each have a way to boost it and to bring it down, as plain forms", async () => {
    const a = new Session(baseUrl);
    const { name } = await launched(a);
    const { item } = await controls(a, name);
    expect(item, "your satellite isn't listed").toBeDefined();
    const forms = [...item!.querySelectorAll('form[method="post"][action="/manoeuvre/"]')];
    const actions = forms.map((f) => f.querySelector<HTMLButtonElement>('button[name="action"]')?.value);
    expect(actions).toEqual(expect.arrayContaining(["boost", "deorbit"]));
    expect(item!.textContent).toMatch(/to mid/i);
  });
});

describe("bringing your satellite down", () => {
  it("starts it down and thanks you, without JavaScript", async () => {
    const a = new Session(baseUrl);
    const { id, name } = await launched(a);
    const res = await manoeuvre(a, id, "deorbit");
    expect(res.status).toBe(303);
    const location = res.headers.get("location")!;
    expect(location).toMatch(new RegExp(`deorbited=${id}`));
    const pad = await page(a, location);
    const thanks = pad.querySelector("dialog#thanks");
    expect(thanks, "no thank-you").not.toBeNull();
    expect(thanks!.hasAttribute("open")).toBe(true);
    expect(thanks!.textContent).toContain(name);
    expect(thanks!.textContent).toMatch(/thank/i);
    // and it says it's coming down, with nothing more to do to it
    const { item } = await controls(a, name);
    expect(item!.textContent).toMatch(/coming down/i);
    expect(item!.querySelector('button[name="action"]')).toBeNull();
  });

  it("answers the page's script with JSON", async () => {
    const a = new Session(baseUrl);
    const { id } = await launched(a);
    const res = await manoeuvre(a, id, "deorbit", "/", { accept: "application/json" });
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
    const res = await manoeuvre(b, id, "deorbit", "/", { accept: "application/json" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const { item } = await controls(a, name);
    expect(item!.textContent).not.toMatch(/coming down/i);
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
  it("sends it climbing to the next band, once", async () => {
    const a = new Session(baseUrl);
    const { id, name } = await launched(a);
    const res = await manoeuvre(a, id, "boost");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(new RegExp(`boosted=${id}`));
    const { item } = await controls(a, name);
    expect(item!.textContent).toMatch(/climbing to the mid band/i);
    expect([...item!.querySelectorAll<HTMLButtonElement>('button[name="action"]')].map((b) => b.value)).not.toContain("boost");
    // its one tank of fuel is spent
    const again = await manoeuvre(a, id, "boost", "/", { accept: "application/json" });
    expect(again.status).toBe(422);
    expect(((await again.json()) as { error: string }).error).toMatch(/fuel/i);
  });

  it("isn't offered from the high band, the top of the sky", async () => {
    const a = new Session(baseUrl);
    const { name } = await launched(a, "high");
    const { item } = await controls(a, name);
    expect([...item!.querySelectorAll<HTMLButtonElement>('button[name="action"]')].map((b) => b.value)).toEqual(["deorbit"]);
  });
});

describe("the sky's station panel", () => {
  it("offers to boost or bring down the satellite it tells you about", async () => {
    const a = new Session(baseUrl);
    await launched(a);
    const sky = await page(a, "/sky/");
    const panel = sky.querySelector(".station");
    const actions = [...panel!.querySelectorAll<HTMLButtonElement>('form[action="/manoeuvre/"] button[name="action"]')].map(
      (b) => b.value,
    );
    expect(actions).toEqual(expect.arrayContaining(["boost", "deorbit"]));
    const back = panel!.querySelector<HTMLInputElement>('form[action="/manoeuvre/"] input[name="back"]');
    expect(back?.value).toBe("/sky/");
  });

  it("offers nothing to someone with no satellite up", async () => {
    const sky = await page(new Session(baseUrl), "/sky/");
    expect(sky.querySelector('.station form[action="/manoeuvre/"]')).toBeNull();
  });
});
