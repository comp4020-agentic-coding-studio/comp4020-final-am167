import { describe, expect, inject, it } from "vitest";
import { Session, callsign, post } from "./session.ts";

// Who may change what, over HTTP (ADR 0022): a satellite is changed only by
// its owner, the operator once it has one and otherwise the cookie that
// launched it; anyone else is refused, told why, and the satellite stays as
// it was. The crit's case: two people side by side, one signed in and one
// not, each trying the other's.

const baseUrl = inject("baseUrl");
const handle = () => `ac_${Math.random().toString(36).slice(2, 10)}`;
const PASS = "correct horse battery";
const json = { accept: "application/json" };

async function launched(s: Session, band = "low") {
  const res = await s.launch({ band, callsign: callsign(), beacon: "mine, not yours" });
  expect(res.status).toBe(303);
  return Number(new URL(res.headers.get("location")!, baseUrl).searchParams.get("launched"));
}
const manoeuvre = (s: Session, id: number, action: "deorbit" | "boost") => post(s, "/manoeuvre/", { id: String(id), action }, json);

describe("someone else's satellite", () => {
  it("can't be brought down or boosted by a stranger, who is told it isn't theirs", async () => {
    const owner = new Session(baseUrl);
    const stranger = new Session(baseUrl);
    await stranger.get("/");
    const id = await launched(owner);
    for (const action of ["deorbit", "boost"] as const) {
      const res = await manoeuvre(stranger, id, action);
      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({ why: "not-yours" });
    }
    // still the owner's to do with as they like: nothing was used up
    expect((await manoeuvre(owner, id, "boost")).status).toBe(200);
  });

  it("can't be changed by a signed-in operator who doesn't own it, nor the other way round", async () => {
    const operator = new Session(baseUrl);
    await operator.get("/");
    expect((await post(operator, "/operator/", { action: "claim", handle: handle(), passphrase: PASS })).status).toBe(303);
    const anon = new Session(baseUrl);
    const theirs = await launched(operator);
    const its = await launched(anon);
    expect(await (await manoeuvre(anon, theirs, "deorbit")).json()).toMatchObject({ why: "not-yours" });
    expect(await (await manoeuvre(operator, its, "deorbit")).json()).toMatchObject({ why: "not-yours" });
  });
});

describe("an operator's satellite", () => {
  it("is theirs on any device they sign in on, and not the device's once it signs out", async () => {
    const laptop = new Session(baseUrl);
    await laptop.get("/");
    const h = handle();
    await post(laptop, "/operator/", { action: "claim", handle: h, passphrase: PASS });
    const id = await launched(laptop);
    // signed out, the laptop is a new anonymous person: not the operator
    expect((await post(laptop, "/operator/", { action: "sign-out" })).status).toBe(303);
    expect(await (await manoeuvre(laptop, id, "boost")).json()).toMatchObject({ why: "not-yours" });
    // signed in on a phone, it's the operator's again
    const phone = new Session(baseUrl);
    await phone.get("/");
    expect((await post(phone, "/operator/", { action: "sign-in", handle: h, passphrase: PASS })).status).toBe(303);
    expect((await manoeuvre(phone, id, "boost")).status).toBe(200);
  });
});
