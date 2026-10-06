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
