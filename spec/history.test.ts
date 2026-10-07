import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";
import { Session, callsign } from "./session.ts";

// Every object's history, over HTTP (ADR 0012): its own page, linked from
// the catalogue and the sky, and the same as a panel for the sky. A flying
// satellite's beacon is only shown over a ground station, so a stranger's view of
// its history leaves it out; its owner sees their own. (A rule of the game,
// not a secret: the sky's own data carries live beacons for the stations.) Where debris came from and what followed are checked
// against staged collisions in collision-server.test.ts.

const baseUrl = inject("baseUrl");
const doc = (html: string) => new JSDOM(html).window.document;

async function launched(s: Session, name = callsign("HIS"), beacon = `a line ${Math.random().toString(36).slice(2, 8)}`) {
  const res = await s.launch({ band: "low", callsign: name, beacon });
  expect(res.status).toBe(303);
  const id = Number(new URL(res.headers.get("location")!, baseUrl).searchParams.get("launched"));
  expect(id).toBeGreaterThan(0);
  return { id, name, beacon };
}

describe("an object's history", () => {
  it("has its own page, which tells a stranger who launched it but not its beacon", async () => {
    const { id, name, beacon } = await launched(new Session(baseUrl));
    const res = await new Session(baseUrl).get(`/object/${id}/`);
    expect(res.status).toBe(200);
    const page = doc(await res.text());
    const history = page.querySelector(".history")!;
    expect(history, "no history").not.toBeNull();
    // the catalogue, with its card open over it (ADR 0015)
    const card = page.querySelector("dialog#object-card")!;
    expect(card.hasAttribute("open")).toBe(true);
    expect(card.querySelector("h2")?.textContent).toContain(name);
    expect(page.querySelector("main table")).not.toBeNull();
    expect(history.textContent).toMatch(/launched without a handle/i);
    expect(history.textContent).toMatch(/Low/);
    expect(history.textContent).not.toContain(beacon);
    expect(history.textContent).toMatch(/heard only as it passes over a ground station/i);
  });

  it("is the same in the sky's panel, beacon withheld from a stranger and shown to its owner", async () => {
    const owner = new Session(baseUrl);
    const { id, name, beacon } = await launched(owner);
    const theirs = await new Session(baseUrl).get(`/object/${id}/panel`);
    expect(theirs.status).toBe(200);
    const html = await theirs.text();
    expect(doc(html).querySelector("h2")?.textContent).toContain(name);
    expect(html).not.toContain(beacon);
    expect(await (await owner.get(`/object/${id}/panel`)).text()).toContain(beacon);
  });

  it("shows its owner their own beacon", async () => {
    const owner = new Session(baseUrl);
    const { id, beacon } = await launched(owner);
    const page = doc(await (await owner.get(`/object/${id}/`)).text());
    expect(page.querySelector(".history")!.textContent).toContain(beacon);
  });

  it("is not found for anything never launched, or for a number written another way", async () => {
    const { id } = await launched(new Session(baseUrl));
    // one address per object: nothing that only reads as its number
    for (const path of ["/object/999999999/", "/object/abc/", "/object/0/", `/object/0${id}/`, `/object/${id}.0/`, `/object/0x${id.toString(16)}/`, `/object/${id}/panel/x`]) {
      expect((await new Session(baseUrl).get(path)).status, path).toBe(404);
    }
  });

  it("is linked from the catalogue and the sky", async () => {
    const { id, name } = await launched(new Session(baseUrl));
    const viewer = new Session(baseUrl);
    const catalogue = doc(await (await viewer.get(`/catalogue/?q=${name}`)).text());
    expect(catalogue.querySelector(`tbody a[href="/object/${id}/"]`), "no link in the catalogue").not.toBeNull();
    // other tests launch too, so ours may have dropped off the latest few
    const sky = doc(await (await viewer.get("/sky/")).text());
    const items = [...sky.querySelectorAll("#recent li")];
    expect(items.length).toBeGreaterThan(0);
    for (const li of items) expect(li.querySelector('a[href^="/object/"]'), li.textContent ?? "").not.toBeNull();
  });
});
