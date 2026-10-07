import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";
import { dayOf, questionOn } from "../src/lib/questions.ts";
import { Session, callsign } from "./session.ts";

// The stations' question over HTTP (ADR 0018): the launchpad shows today's
// and a launch can answer it; the satellite keeps what it answered; the sky
// shows it; and the app says what it's for.

const baseUrl = inject("baseUrl");
const doc = (html: string) => new JSDOM(html).window.document;
const page = async (s: Session, path: string) => doc(await (await s.get(path)).text());
// today's, on the server's clock and this one's (the same machine), with a
// day either side in case the test runs across midnight UTC
const near = () => [-1, 0, 1].map((d) => questionOn(dayOf(Date.now()) + d));

async function launched(s: Session, fields: Record<string, string>) {
  const res = await s.launch({ band: "low", callsign: callsign("Q"), beacon: "an answer of sorts", ...fields });
  expect(res.status).toBe(303);
  return Number(new URL(res.headers.get("location")!, baseUrl).searchParams.get("launched"));
}

describe("the launchpad", () => {
  it("shows today's question, and lets you say your beacon answers it", async () => {
    const pad = await page(new Session(baseUrl), "/");
    const form = pad.querySelector("form[data-launch]")!;
    expect(near()).toContain(form.querySelector("#question")?.textContent?.trim());
    const answering = form.querySelector<HTMLInputElement>("input[name=answering]")!;
    expect(answering.type).toBe("checkbox");
    // a choice, not the default
    expect(answering.hasAttribute("checked")).toBe(false);
    // which day's question this form showed
    expect(Number(form.querySelector<HTMLInputElement>("input[name=asked]")?.value)).toBeGreaterThan(dayOf(Date.now()) - 2);
  });

  it("says what Kessler is for, and links to the long version", async () => {
    const pad = await page(new Session(baseUrl), "/");
    expect(pad.querySelector('.intro a[href="/why/"]')).not.toBeNull();
    const why = await new Session(baseUrl).get("/why/");
    expect(why.status).toBe(200);
    const text = doc(await why.text()).querySelector("main")!.textContent!;
    for (const point of [/heard/i, /listen/i, /question/i, /collide/i, /static/i, /commons/i, /worth saying/i]) {
      expect(text, String(point)).toMatch(point);
    }
  });
});

describe("a launch answering the question", () => {
  it("keeps the question, and its history says so", async () => {
    const a = new Session(baseUrl);
    const asked = String(dayOf(Date.now()));
    const id = await launched(a, { answering: "1", asked });
    const history = (await page(a, `/object/${id}/`)).querySelector(".history")!;
    expect(history.textContent).toMatch(/answering/i);
    expect(history.textContent).toContain(questionOn(Number(asked)));
  });

  it("answers nothing with the box unticked", async () => {
    const a = new Session(baseUrl);
    const id = await launched(a, { asked: String(dayOf(Date.now())) });
    expect((await page(a, `/object/${id}/`)).querySelector(".history")!.textContent).not.toMatch(/answering/i);
  });

  it("answers nothing from a form a week old", async () => {
    const a = new Session(baseUrl);
    const id = await launched(a, { answering: "1", asked: String(dayOf(Date.now()) - 7) });
    expect((await page(a, `/object/${id}/`)).querySelector(".history")!.textContent).not.toMatch(/answering/i);
  });
});

describe("the sky", () => {
  it("shows today's question beside the beacons, with a way to answer it", async () => {
    const sky = await page(new Session(baseUrl), "/sky/");
    const asked = sky.querySelector(".rail .today")!;
    expect(asked, "no question on the sky").not.toBeNull();
    expect(near().some((q) => asked.textContent!.includes(q))).toBe(true);
    expect(asked.querySelector('a[href="/"]')).not.toBeNull();
  });
});
