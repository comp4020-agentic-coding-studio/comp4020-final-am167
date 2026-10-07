import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";
import { Session, callsign, events, post } from "./session.ts";

// Deorbiting and boosting, over HTTP (ADR 0011, and where from: ADR 0015):
// your own satellites, from "Yours" in the catalogue and from each one's
// card (its history), by a plain form that works without JavaScript (or as
// JSON for the page's script); nobody else's; once for a boost; and
// everyone watching is told. The launchpad is for launching, and the sky's
// station panel, which talks about whichever of yours passes next, offers
// no controls.

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

const manoeuvre = (s: Session, id: number, action: "deorbit" | "boost", headers = {}, extra: Record<string, string> = {}) =>
  post(s, "/manoeuvre/", { id: String(id), action, ...extra }, headers);
const json = { accept: "application/json" };
const YOURS = "/catalogue/?show=mine";

// the manoeuvre forms shown in part of a page
function forms(within: Element | Document) {
  const shown = [...within.querySelectorAll<HTMLFormElement>('form[method="post"][action="/manoeuvre/"]')].filter(
    (form) => !form.hasAttribute("hidden"),
  );
  // the line saying why there's no boost, if it's shown
  const spent = within.querySelector("[data-spent]:not([hidden])")?.textContent ?? "";
  return {
    spent,
    actions: shown.map((form) => form.querySelector<HTMLButtonElement>('button[name="action"]')!.value),
    ids: shown.map((form) => form.querySelector<HTMLInputElement>('input[name="id"]')!.value),
    backs: shown.map((form) => form.querySelector<HTMLInputElement>('input[name="back"]')?.value ?? ""),
  };
}

// what "Yours" in the catalogue offers for one of your satellites: its card
async function offered(s: Session, id: number) {
  const yours = await page(s, YOURS);
  const card = yours.querySelector(`[data-yours="${id}"]`);
  return { yours, card, ...(card ? forms(card) : { spent: "", actions: [] as string[], ids: [] as string[], backs: [] as string[] }) };
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
  it("offers no manoeuvres, only a way to yours in the catalogue", async () => {
    const a = new Session(baseUrl);
    await launched(a);
    const sky = await page(a, "/sky/");
    expect(sky.querySelector('form[action="/manoeuvre/"]')).toBeNull();
    expect(sky.querySelector(`.station a[href="${YOURS}"]`), "no way to manage yours").not.toBeNull();
  });
});

describe("yours, in the catalogue", () => {
  it("is a view of its own, linked from the catalogue's others", async () => {
    const catalogue = await page(new Session(baseUrl), "/catalogue/");
    const link = [...catalogue.querySelectorAll<HTMLAnchorElement>("nav.views a")].find((a) => /yours/i.test(a.textContent ?? ""));
    expect(link?.getAttribute("href")).toBe(YOURS);
  });

  it("offers to boost or bring down each of your satellites, as plain forms that come back here", async () => {
    const a = new Session(baseUrl);
    const { id, name } = await launched(a);
    const { card, actions, ids, backs, spent } = await offered(a, id);
    expect(card, "no card for your satellite").not.toBeNull();
    expect(card!.textContent).toContain(name);
    // yours, so its beacon is shown in full
    expect(card!.textContent).toContain("up for a while");
    expect(actions).toEqual(["boost", "deorbit"]);
    expect(ids).toEqual([String(id), String(id)]);
    expect(backs).toEqual(["yours", "yours"]);
    expect(card!.textContent).toMatch(/boost to mid/i);
    expect(spent).toBe("");
  });

  it("lists only yours", async () => {
    const a = new Session(baseUrl);
    const theirs = await launched(new Session(baseUrl));
    await a.get("/");
    const yours = await page(a, YOURS);
    expect(yours.querySelector(`[data-yours="${theirs.id}"]`)).toBeNull();
    expect(yours.querySelector("main")!.textContent).not.toContain(theirs.name);
  });

  it("remembers when you last looked, so what happens after is news", async () => {
    const res = await new Session(baseUrl).get(YOURS);
    const seen = res.headers.getSetCookie().find((c) => c.startsWith("kessler_seen="));
    expect(seen, "no last-looked cookie").toBeDefined();
    expect(Number(seen!.split(";")[0].split("=")[1])).toBeGreaterThan(Date.now() - 60_000);
    expect(seen).toMatch(/HttpOnly/i);
  });

  it("says when nothing of yours is up, and offers no manoeuvres", async () => {
    const yours = await page(new Session(baseUrl), YOURS);
    expect(yours.querySelector('main form[action="/manoeuvre/"]')).toBeNull();
    expect(yours.querySelector("main")!.textContent).toMatch(/nothing of yours in orbit/i);
    expect(yours.querySelector('main a[href="/"]'), "no way to launch").not.toBeNull();
  });

  it("offers no boost from the high band, and says why", async () => {
    const a = new Session(baseUrl);
    const { id } = await launched(a, "high");
    const { actions, spent } = await offered(a, id);
    expect(actions).toEqual(["deorbit"]);
    expect(spent).toMatch(/highest band/i);
  });
});

describe("an object's card", () => {
  it("offers its owner the manoeuvres, in the pop-up and on its own page", async () => {
    const a = new Session(baseUrl);
    const { id } = await launched(a);
    const panel = forms(doc(await (await a.get(`/object/${id}/panel`)).text()));
    expect(panel.actions).toEqual(["boost", "deorbit"]);
    expect(panel.ids).toEqual([String(id), String(id)]);
    const own = forms(await page(a, `/object/${id}/`));
    expect(own.actions).toEqual(["boost", "deorbit"]);
    // without JavaScript, its own page comes back to itself
    expect(own.backs).toEqual(["object", "object"]);
  });

  it("offers a stranger none", async () => {
    const { id } = await launched(new Session(baseUrl));
    const stranger = new Session(baseUrl);
    expect(forms(doc(await (await stranger.get(`/object/${id}/panel`)).text())).actions).toEqual([]);
    expect(forms(await page(stranger, `/object/${id}/`)).actions).toEqual([]);
  });
});

describe("bringing your satellite down", () => {
  it("starts it down and thanks you, without JavaScript", async () => {
    const a = new Session(baseUrl);
    const { id, name } = await launched(a);
    const res = await manoeuvre(a, id, "deorbit", {}, { back: "yours" });
    expect(res.status).toBe(303);
    const location = res.headers.get("location")!;
    expect(location).toBe(`${YOURS}&deorbited=${id}`);
    const yours = await page(a, location);
    const thanks = yours.querySelector("dialog#thanks");
    expect(thanks, "no thank-you").not.toBeNull();
    expect(thanks!.hasAttribute("open")).toBe(true);
    expect(thanks!.textContent).toContain(name);
    expect(thanks!.textContent).toMatch(/thank/i);
    // it's coming down, with nothing more to do to it
    expect((await row(a, name))?.textContent).toMatch(/in orbit, coming down/i);
    const card = await offered(a, id);
    expect(card.actions).toEqual([]);
    expect(card.card?.textContent).toMatch(/coming down/i);
  });

  it("comes back to its own page when asked from there, thanking you", async () => {
    const a = new Session(baseUrl);
    const { id, name } = await launched(a);
    const res = await manoeuvre(a, id, "deorbit", {}, { back: "object" });
    expect(res.status).toBe(303);
    const location = res.headers.get("location")!;
    expect(location).toBe(`/object/${id}/?deorbited=${id}`);
    const thanks = (await page(a, location)).querySelector("dialog#thanks");
    expect(thanks?.hasAttribute("open")).toBe(true);
    expect(thanks!.textContent).toContain(name);
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
    const res = await manoeuvre(a, id, "boost", {}, { back: "yours" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${YOURS}&boosted=${id}`);
    expect((await row(a, name))?.textContent).toMatch(/in orbit, climbing/i);
  });

  it("works once: a second is refused, and yours says the boost is used", async () => {
    const a = new Session(baseUrl);
    const { id } = await launched(a);
    expect((await manoeuvre(a, id, "boost", json)).status).toBe(200);
    const again = await manoeuvre(a, id, "boost", json);
    expect(again.status).toBe(422);
    expect(((await again.json()) as { error: string }).error).toMatch(/fuel/i);
    const { actions, spent } = await offered(a, id);
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

  it("only ever goes back to yours or the object's own page", async () => {
    const a = new Session(baseUrl);
    const { id } = await launched(a);
    for (const back of ["//evil.example/", "https://evil.example/", "/sky/", "__proto__", "constructor", ""]) {
      const res = await post(a, "/manoeuvre/", { id: String(id), action: "deorbit", back });
      expect(res.status, back).toBe(303);
      expect(res.headers.get("location"), back).toMatch(/^\/catalogue\/\?show=mine&/);
    }
  });

  it("goes back to yours, saying why, when it's refused", async () => {
    const a = new Session(baseUrl);
    const { id } = await launched(a, "high");
    const res = await manoeuvre(a, id, "boost", {}, { back: "yours" });
    expect(res.headers.get("location")).toBe(`${YOURS}&refused=top-band`);
    const yours = await page(a, res.headers.get("location")!);
    expect(yours.querySelector('[role="alert"]')?.textContent).toMatch(/high band already/i);
  });
});
