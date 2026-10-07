import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";
import { Session, callsign, post } from "./session.ts";

// Operators (ADR 0009): a person is still an anonymous cookie, and can
// launch at once; they can claim a handle with a passphrase, which keeps
// their satellites (and the blame for them, ADR 0010) across devices.

const baseUrl = inject("baseUrl");
const doc = (html: string) => new JSDOM(html).window.document;
const handle = () => `op_${Math.random().toString(36).slice(2, 10)}`;
const PASS = "correct horse battery";

const claim = (s: Session, h: string, passphrase = PASS) => post(s, "/operator/", { action: "claim", handle: h, passphrase });
const signIn = (s: Session, h: string, passphrase = PASS) => post(s, "/operator/", { action: "sign-in", handle: h, passphrase });
const page = async (s: Session, path: string) => doc(await (await s.get(path)).text());
const yours = async (s: Session, name: string) => {
  const catalogue = await page(s, "/catalogue/");
  const row = [...catalogue.querySelectorAll("tbody tr")].find((tr) => tr.textContent?.includes(name));
  return row?.textContent?.includes("yours") ?? false;
};

describe("operators", () => {
  it("needs no sign-up to launch", async () => {
    const res = await new Session(baseUrl).launch({ band: "low", callsign: callsign(), beacon: "no account" });
    expect(res.status).toBe(303);
  });

  it("lets you claim a handle, and keeps what you launched before as yours", async () => {
    const a = new Session(baseUrl);
    const name = callsign();
    await a.launch({ band: "low", callsign: name, beacon: "before claiming" });
    const h = handle();
    const res = await claim(a, h);
    expect(res.status).toBe(303);
    const operator = await page(a, "/operator/");
    expect(operator.body.textContent).toContain(h);
    expect(await yours(a, name)).toBe(true);
  });

  it("refuses a handle that's taken, whatever its case", async () => {
    const h = handle();
    expect((await claim(new Session(baseUrl), h)).status).toBe(303);
    const res = await claim(new Session(baseUrl), h.toUpperCase());
    expect(res.status).toBe(422);
    expect(doc(await res.text()).body.textContent).toMatch(/taken/i);
  });

  it.each([
    ["a short handle", { handle: "ab" }, /3 to 20/],
    ["a handle with spaces", { handle: "two words" }, /letters, numbers/i],
    ["a short passphrase", { passphrase: "short" }, /8 characters/],
  ])("refuses %s", async (_, change, reason) => {
    const res = await post(new Session(baseUrl), "/operator/", {
      action: "claim",
      handle: handle(),
      passphrase: PASS,
      ...change,
    });
    expect(res.status).toBe(422);
    expect(doc(await res.text()).body.textContent).toMatch(reason);
  });

  it("lets you sign in on another device, where your satellites are yours too", async () => {
    const a = new Session(baseUrl);
    const name = callsign();
    await a.launch({ band: "mid", callsign: name, beacon: "from the laptop" });
    const h = handle();
    await claim(a, h);

    const b = new Session(baseUrl);
    expect(await yours(b, name)).toBe(false);
    expect((await signIn(b, h)).status).toBe(303);
    expect(await yours(b, name)).toBe(true);
  });

  it("refuses a wrong passphrase, and says no more than that", async () => {
    const a = new Session(baseUrl);
    const h = handle();
    await claim(a, h);
    const b = new Session(baseUrl);
    const res = await signIn(b, h, "not the passphrase");
    expect(res.status).toBe(422);
    const text = doc(await res.text()).body.textContent ?? "";
    expect(text).toMatch(/handle or passphrase/i);
    expect((await page(b, "/operator/")).body.textContent).not.toContain(`Signed in as ${h}`);
    // an unknown handle reads the same
    const unknown = await signIn(new Session(baseUrl), handle());
    expect(doc(await unknown.text()).body.textContent).toMatch(/handle or passphrase/i);
  });

  it("holds the gap between launches per operator, not per device", async () => {
    const a = new Session(baseUrl);
    const h = handle();
    await claim(a, h);
    expect((await a.launch({ band: "low", callsign: callsign(), beacon: "first" })).status).toBe(303);
    const b = new Session(baseUrl);
    await signIn(b, h);
    const res = await b.launch({ band: "low", callsign: callsign(), beacon: "second device" });
    expect(res.status).toBe(422);
    expect(doc(await res.text()).body.textContent).toMatch(/launch again in/i);
  });

  it("signs you out as a new anonymous person, and what you launched stays the operator's", async () => {
    const a = new Session(baseUrl);
    const name = callsign();
    await a.launch({ band: "low", callsign: name, beacon: "stays with the operator" });
    const h = handle();
    await claim(a, h);
    const before = a.cookie("kessler_person");
    expect((await post(a, "/operator/", { action: "sign-out" })).status).toBe(303);
    expect(a.cookie("kessler_person")).not.toBe(before);
    expect(await yours(a, name)).toBe(false);
    await signIn(a, h);
    expect(await yours(a, name)).toBe(true);
  });

  it("slows wrong passphrases from one place without locking the owner out from another", async () => {
    const h = handle();
    await claim(new Session(baseUrl), h);
    // Fly puts the visitor's address in this header
    const from = (ip: string) => ({ "fly-client-ip": ip });
    const attacker = new Session(baseUrl);
    for (let i = 0; i < 5; i++) await post(attacker, "/operator/", { action: "sign-in", handle: h, passphrase: "guess " + i }, from("10.9.9.9"));
    const locked = await post(attacker, "/operator/", { action: "sign-in", handle: h, passphrase: PASS }, from("10.9.9.9"));
    expect(doc(await locked.text()).body.textContent).toMatch(/too many tries/i);
    const owner = new Session(baseUrl);
    const res = await post(owner, "/operator/", { action: "sign-in", handle: h, passphrase: PASS }, from("10.1.1.1"));
    expect(res.status).toBe(303);
  });

  it("won't claim a second handle while you're signed in to one", async () => {
    const a = new Session(baseUrl);
    const h = handle();
    await claim(a, h);
    const res = await claim(a, handle());
    expect(res.status).toBe(422);
    expect(doc(await res.text()).querySelector('[role="alert"]')?.textContent).toMatch(/sign out first/i);
    expect((await page(a, "/operator/")).body.textContent).toContain(`Signed in as ${h}`);
  });

  it("gives the device a new cookie when it claims or signs in", async () => {
    const a = new Session(baseUrl);
    await a.get("/");
    const anonymous = a.cookie("kessler_person");
    const h = handle();
    await claim(a, h);
    const claimed = a.cookie("kessler_person");
    expect(claimed).not.toBe(anonymous);
    const b = new Session(baseUrl);
    await b.get("/");
    const before = b.cookie("kessler_person");
    await signIn(b, h);
    expect(b.cookie("kessler_person")).not.toBe(before);
    expect((await page(b, "/operator/")).body.textContent).toContain(`Signed in as ${h}`);
  });

  it("never sends owners, operator ids or person ids down the stream", async () => {
    const a = new Session(baseUrl);
    await claim(a, handle());
    await a.launch({ band: "low", callsign: callsign(), beacon: "on the stream" });
    const id = a.cookie("kessler_person")!;
    const controller = new AbortController();
    const res = await fetch(a.url("/api/events"), { headers: a.headers(), signal: controller.signal });
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    let text = "";
    while (!text.includes("\n\n")) text += (await reader.read()).value ?? "";
    controller.abort();
    expect(text).toMatch(/^event: hello/);
    expect(text).not.toContain(id);
    expect(text).not.toMatch(/"owner"|"operator":\s*\d/);
  });

  it("never shows a passphrase or anyone's person id", async () => {
    const a = new Session(baseUrl);
    const h = handle();
    await claim(a, h);
    const id = a.cookie("kessler_person")!;
    for (const path of ["/", "/sky/", "/catalogue/?show=all", "/operator/"]) {
      const html = await (await a.get(path)).text();
      expect(html, path).not.toContain(PASS);
      expect(html, path).not.toContain(id);
    }
  });
});

describe("nudging an anonymous launcher towards a handle", () => {
  const nudge = (page: Document) =>
    [...page.querySelectorAll('a[href^="/operator/"]')].filter((a) => !a.closest("nav"));

  it("on the launchpad, without getting in the way of launching", async () => {
    const page = doc(await (await new Session(baseUrl).get("/")).text());
    expect(page.querySelector(".console")?.textContent).toMatch(/without a handle/i);
    expect(nudge(page).length).toBeGreaterThan(0);
    // and back to the launchpad afterwards, like the pop-up's
    for (const a of nudge(page)) expect(a.getAttribute("href")).toMatch(/back=launchpad/);
    expect(page.querySelector("form[data-launch] fieldset")?.hasAttribute("disabled")).toBe(false);
  });

  it("as a pop-up on the launchpad, that can be closed to launch without one", async () => {
    const page = doc(await (await new Session(baseUrl).get("/")).text());
    const popup = page.querySelector("dialog#handle-prompt");
    expect(popup, "no pop-up on the launchpad").not.toBeNull();
    expect(popup!.querySelector('a[href^="/operator/"]'), "the pop-up offers no handle").not.toBeNull();
    // closing it is always on offer, and needs no JavaScript beyond the dialog's own
    expect(popup!.querySelector('form[method="dialog"] button')?.textContent).toMatch(/without/i);
  });

  it("brings you back to the launchpad once you've claimed or signed in from it", async () => {
    const pad = doc(await (await new Session(baseUrl).get("/")).text());
    const links = [...pad.querySelectorAll<HTMLAnchorElement>('dialog#handle-prompt a[href^="/operator/"]')];
    expect(links.length).toBeGreaterThan(0);
    for (const a of links) expect(a.getAttribute("href"), "a pop-up link that won't come back").toMatch(/back=launchpad/);

    // the operator page carries it through both its forms
    const operator = await page(new Session(baseUrl), "/operator/?back=launchpad");
    const kept = operator.querySelectorAll('form input[type="hidden"][name="back"][value="launchpad"]');
    expect(kept).toHaveLength(2);

    const h = handle();
    const claimed = await post(new Session(baseUrl), "/operator/", { action: "claim", handle: h, passphrase: PASS, back: "launchpad" });
    expect(claimed.status).toBe(303);
    expect(claimed.headers.get("location")).toBe("/");
    const signed = await post(new Session(baseUrl), "/operator/", { action: "sign-in", handle: h, passphrase: PASS, back: "launchpad" });
    expect(signed.headers.get("location")).toBe("/");
  });

  it("brings you back to the sky once you've claimed from its launch notice or explainer", async () => {
    const a = new Session(baseUrl);
    const res = await a.launch({ band: "low", callsign: callsign(), beacon: "back to the sky" });
    const sky = doc(await (await a.get(res.headers.get("location")!)).text());
    const links = [
      ...sky.querySelectorAll<HTMLAnchorElement>('#launched-notice a[href^="/operator/"], dialog#first-launch a[href^="/operator/"]'),
    ];
    expect(links.length).toBe(2);
    for (const link of links) expect(link.getAttribute("href")).toMatch(/back=sky/);
    const claimed = await post(a, "/operator/", { action: "claim", handle: handle(), passphrase: PASS, back: "sky" });
    // the sky, not the launch again: that's been said
    expect(claimed.headers.get("location")).toBe("/sky/");
  });

  it("goes nowhere else it's asked to after signing in", async () => {
    // not a URL, and not something every object has, like __proto__
    for (const back of ["https://example.com/", "//example.com/", "/sky/", "__proto__", "constructor", "toString"]) {
      const res = await post(new Session(baseUrl), "/operator/", { action: "claim", handle: handle(), passphrase: PASS, back });
      expect(res.headers.get("location")).toBe("/operator/");
    }
    const operator = await page(new Session(baseUrl), "/operator/?back=https://example.com/");
    expect(operator.querySelector('input[name="back"]')).toBeNull();
  });

  it("right after launching, on the sky's notice", async () => {
    const a = new Session(baseUrl);
    const res = await a.launch({ band: "low", callsign: callsign(), beacon: "nudge me" });
    const sky = doc(await (await a.get(res.headers.get("location")!)).text());
    const notice = sky.getElementById("launched-notice")!;
    expect(notice.querySelector('a[href^="/operator/"]'), "no nudge on the notice").not.toBeNull();
  });

  it("not once you have a handle: it says who you're launching as", async () => {
    const a = new Session(baseUrl);
    const h = handle();
    await claim(a, h);
    const pad = doc(await (await a.get("/")).text());
    expect(pad.querySelector(".console")?.textContent).toContain(`Launching as ${h}`);
    expect(nudge(pad)).toHaveLength(0);
    expect(pad.querySelector("dialog#handle-prompt"), "a pop-up for someone with a handle").toBeNull();
    const res = await a.launch({ band: "low", callsign: callsign(), beacon: "no nudge" });
    const sky = doc(await (await a.get(res.headers.get("location")!)).text());
    expect(sky.getElementById("launched-notice")!.querySelector('a[href^="/operator/"]')).toBeNull();
  });
});
