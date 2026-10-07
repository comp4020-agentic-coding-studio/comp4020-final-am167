import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";
import { Session, callsign } from "./session.ts";

// The core thing (PLAN.md, C8): a stranger launches a satellite with a
// callsign and a beacon line into a band, and it stays in the shared sky
// where everyone else can see it.
const baseUrl = inject("baseUrl");
const doc = (html: string) => new JSDOM(html).window.document;

describe("a person", () => {
  it("is an httpOnly cookie set on the first visit", async () => {
    const res = await new Session(baseUrl).get("/");
    const person = res.headers.getSetCookie().find((c) => c.startsWith("kessler_person="));
    expect(person, "no kessler_person cookie on the first visit").toBeDefined();
    expect(person).toMatch(/HttpOnly/i);
    expect(person).toMatch(/SameSite=Lax/i);
  });
});

describe("the launchpad", () => {
  it("is a form that works without JavaScript: band, callsign and beacon", async () => {
    const page = doc(await (await new Session(baseUrl).get("/")).text());
    const form = page.querySelector("form[method=post]");
    expect(form, "no POST form on /").not.toBeNull();
    const bands = [...form!.querySelectorAll<HTMLInputElement>("[name=band]")].map((el) =>
      el.tagName === "SELECT"
        ? [...(el as unknown as HTMLSelectElement).options].map((o) => o.value)
        : [el.value],
    );
    expect(bands.flat().sort()).toEqual(["high", "low", "mid"]);
    expect(form!.querySelector("[name=callsign]")).not.toBeNull();
    expect(form!.querySelector("[name=beacon]")?.getAttribute("maxlength")).toBe("60");
    // every field has a label a screen reader can announce
    for (const el of form!.querySelectorAll("input:not([type=hidden]), select, textarea")) {
      const labelled =
        (el.id && page.querySelector(`label[for="${el.id}"]`)) || el.closest("label");
      expect(labelled, `${el.getAttribute("name")} has no label`).toBeTruthy();
    }
  });

  it("says how long each band stays up before it falls back and burns up", async () => {
    const page = doc(await (await new Session(baseUrl).get("/")).text());
    const life = (band: string) =>
      page.querySelector(`input[name=band][value=${band}]`)?.closest("label")?.querySelector(".band-life")?.textContent ?? "";
    // the whole spread a launch can land in, not just the band's middle
    expect(life("low")).toMatch(/Burns up in 1 to 8 hours/);
    expect(life("mid")).toMatch(/Burns up in 9 to 27 hours/);
    expect(life("high")).toMatch(/Burns up in 31 hours to 3 days/);
  });

  it("launches into the shared sky, where another person sees it", async () => {
    const a = new Session(baseUrl);
    const name = callsign();
    const res = await a.launch({ band: "low", callsign: name, beacon: "hello from the pad" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/^\/sky\//);

    const catalogue = doc(await (await new Session(baseUrl).get("/catalogue/")).text());
    const rows = [...catalogue.querySelectorAll("tbody tr")].map((tr) => tr.textContent ?? "");
    const row = rows.find((text) => text.includes(name));
    expect(row, "the launch isn't in the catalogue").toBeDefined();
    // a beacon is only heard as its satellite passes over the station, so the
    // catalogue names satellites without giving their beacons away
    expect(row).not.toContain("hello from the pad");
  });

  it("answers the page's script with JSON instead of a redirect", async () => {
    const res = await new Session(baseUrl).launch(
      { band: "high", callsign: callsign(), beacon: "scripted" },
      { json: true },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: number; redirect: string };
    expect(body.id).toEqual(expect.any(Number));
    expect(body.redirect).toMatch(/^\/sky\//);
  });

  it("makes a person wait a short gap between launches", async () => {
    const a = new Session(baseUrl);
    const first = await a.launch({ band: "mid", callsign: callsign(), beacon: "first" });
    expect(first.status).toBe(303);
    const second = callsign();
    const res = await a.launch({ band: "mid", callsign: second, beacon: "second" });
    expect(res.status).toBe(422);
    expect(doc(await res.text()).body.textContent).toMatch(/launch again in (\d+ min )?\d+ s/i);

    const sky = await (await new Session(baseUrl).get("/sky/")).text();
    expect(sky).not.toContain(second);
  });

  it("keeps the pad open while your satellite is up", async () => {
    const a = new Session(baseUrl);
    await a.launch({ band: "low", callsign: callsign(), beacon: "still up" });
    const page = doc(await (await a.get("/")).text());
    expect(page.querySelector("form fieldset")).not.toBeNull();
    // closed only for the gap, and it says so
    expect(page.body.textContent).toMatch(/launch again in (\d+ min )?\d+ s/i);
  });

  it("keeps a refused launch's answers in the form, with the reason", async () => {
    const res = await new Session(baseUrl).launch({
      band: "low",
      callsign: "KEEPME",
      beacon: "x".repeat(61),
    });
    expect(res.status).toBe(422);
    const page = doc(await res.text());
    expect(page.querySelector<HTMLInputElement>("[name=callsign]")?.value).toBe("KEEPME");
    expect(page.body.textContent).toMatch(/60/);
  });

  it.each([
    ["a beacon over 60 characters", { beacon: "x".repeat(61) }],
    ["an empty beacon", { beacon: "   " }],
    ["a link in the beacon", { beacon: "visit https://example.com" }],
    ["a bare domain in the beacon", { beacon: "go to example.com now" }],
    ["a domain with any ending", { beacon: "visit evil.ru" }],
    ["a short link", { beacon: "t.me/someone" }],
    ["a spaced-out domain", { beacon: "see bit . ly" }],
    ["a spelled-out domain", { beacon: "example(dot)com" }],
    ["a disguised blocked word", { beacon: "sh1t happens" }],
    ["a spaced-out blocked word", { beacon: "f u c k this" }],
    ["a blocked word in the beacon", { beacon: "what the fuck" }],
    ["an empty callsign", { callsign: "" }],
    ["a callsign over 16 characters", { callsign: "A".repeat(17) }],
    ["a band that doesn't exist", { band: "geo" }],
  ])("refuses %s", async (_, override) => {
    const fields = { band: "low", callsign: callsign(), beacon: "fine", ...override };
    const res = await new Session(baseUrl).launch(fields);
    expect(res.status).toBe(422);
  });
});

describe("the launch rules", () => {
  // the blocklist matches words, not letters that happen to be in a row
  it.each([
    ["sky", { beacon: "the sky shines tonight" }],
    ["a callsign with sky in it", { callsign: "Sky Station" }],
    ["grape", { beacon: "grape jam for breakfast" }],
    ["therapist", { beacon: "my therapist says hi" }],
    ["hit the spot", { beacon: "this hit the spot" }],
    ["his pic", { beacon: "his pic is nice" }],
    ["e.g. and decimals", { beacon: "pi is 3.14, e.g. roughly" }],
  ])("allows ordinary words: %s", async (_, override) => {
    const fields = { band: "low", callsign: callsign(), beacon: "fine", ...override };
    const res = await new Session(baseUrl).launch(fields);
    expect(res.status).toBe(303);
  });

  it("refuses a form post from another site", async () => {
    const res = await new Session(baseUrl).launch(
      { band: "low", callsign: callsign(), beacon: "csrf" },
      { headers: { origin: "https://evil.example" } },
    );
    expect(res.status).toBe(403);
  });

  // Fly's proxy speaks https to the browser and http to the app
  it("accepts a launch through a TLS-terminating proxy", async () => {
    const res = await new Session(baseUrl).launch(
      { band: "low", callsign: callsign(), beacon: "through the proxy" },
      {
        headers: {
          origin: "https://kessler-spec.fly.dev",
          "x-forwarded-host": "kessler-spec.fly.dev",
          "x-forwarded-proto": "https",
        },
      },
    );
    expect(res.status).toBe(303);
  });

  it("answers a form it can't read with a 400, not a crash", async () => {
    const session = new Session(baseUrl);
    const res = await fetch(session.url("/"), {
      method: "POST",
      headers: { origin: session.url("/").origin, "content-type": "multipart/form-data; boundary=x" },
      body: "not multipart at all",
    });
    expect(res.status).toBe(400);
  });
});

describe("coming back", () => {
  it("finds your satellites still yours, listed on the pad", async () => {
    const a = new Session(baseUrl);
    const name = callsign();
    await a.launch({ band: "low", callsign: name, beacon: "still here" });

    const pad = await a.get("/");
    expect(pad.headers.getSetCookie().some((c) => c.startsWith("kessler_person="))).toBe(false);
    const page = doc(await pad.text());
    expect(page.querySelector(".console")?.textContent).toMatch(new RegExp(`Yours in orbit:\\s*${name}`));

    const catalogue = doc(await (await a.get("/catalogue/")).text());
    const row = [...catalogue.querySelectorAll("tbody tr")].find((tr) => tr.textContent?.includes(name));
    expect(row?.textContent).toMatch(/yours/);
  });

  it("never shows anyone's person id", async () => {
    const a = new Session(baseUrl);
    await a.launch({ band: "mid", callsign: callsign(), beacon: "private" });
    const id = a.cookie("kessler_person")!;
    expect(id).toBeTruthy();
    for (const path of ["/sky/", "/catalogue/?show=all"]) {
      const html = await (await new Session(baseUrl).get(path)).text();
      expect(html, path).not.toContain(id);
    }
  });

  it("carries a beacon as data, never as markup", async () => {
    const name = callsign();
    const beacon = "</script><b id=pwn>x</b>";
    await new Session(baseUrl).launch({ band: "high", callsign: name, beacon });
    const html = await (await new Session(baseUrl).get("/sky/")).text();
    expect(html).not.toContain("</script><b");
    const page = doc(html);
    expect(page.getElementById("pwn")).toBeNull();
    const data = JSON.parse(page.getElementById("sky-data")!.textContent!) as {
      sky: { callsign: string; beacon: string }[];
    };
    expect(data.sky.find((o) => o.callsign === name)?.beacon).toBe(beacon);
  });
});
