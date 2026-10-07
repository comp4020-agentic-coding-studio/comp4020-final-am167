import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";
import { Session, callsign, post } from "./session.ts";

// The catalogue as a table you can work with: filtered, searched, sorted and
// paged by a plain GET form and links, so it works without JavaScript and
// every view has its own address.

const baseUrl = inject("baseUrl");
const doc = (html: string) => new JSDOM(html).window.document;
const view = async (query: string, session = new Session(baseUrl)) =>
  doc(await (await session.get(`/catalogue/${query}`)).text());
// a column's text in each body row, by its header's name
function column(page: Document, name: string): string[] {
  const headers = [...page.querySelectorAll("thead th")].map((th) => th.textContent?.trim() ?? "");
  const at = headers.findIndex((h) => h.startsWith(name));
  expect(at, `no ${name} column in ${headers.join(", ")}`).toBeGreaterThanOrEqual(0);
  return [...page.querySelectorAll("tbody tr")].map((tr) => tr.children[at]?.textContent?.trim() ?? "");
}
const kilometres = (text: string) => Number(text.match(/([\d,]+\.\d+) km/)![1].replace(/,/g, ""));

// three satellites of our own, from three people (launches are five
// minutes apart per person), findable by a shared prefix
async function three() {
  const prefix = callsign("CAT");
  const names = ["B", "A", "C"].map((x) => `${prefix}${x}`);
  for (const name of names) {
    expect((await new Session(baseUrl).launch({ band: "low", callsign: name, beacon: "for the table" })).status).toBe(303);
  }
  return { prefix, names };
}

describe("the catalogue as a table", () => {
  it("filters and sorts with a plain form and links", async () => {
    // everything ever launched, where the status filter means something
    const page = await view("?show=all");
    const form = page.querySelector<HTMLFormElement>("form.filters");
    expect(form, "no filter form").not.toBeNull();
    expect(form!.method.toLowerCase()).toBe("get");
    for (const name of ["q", "kind", "band", "fate"]) {
      expect(form!.querySelector(`[name="${name}"]`), `no ${name} field`).not.toBeNull();
    }
    const sortable = [...page.querySelectorAll("thead th a")].map((a) => a.getAttribute("href") ?? "");
    expect(sortable.some((href) => href.includes("sort=height"))).toBe(true);
  });

  it("finds objects by callsign", async () => {
    const { prefix, names } = await three();
    const page = await view(`?q=${prefix}`);
    expect(column(page, "Object").map((t) => t.slice(0, names[0].length)).sort()).toEqual([...names].sort());
  });

  it("sorts by name either way, and marks the column", async () => {
    const { prefix, names } = await three();
    const up = await view(`?q=${prefix}&sort=name&dir=asc`);
    expect(column(up, "Object").map((t) => t.slice(0, names[0].length))).toEqual([...names].sort());
    expect(up.querySelector('thead th[aria-sort="ascending"]')?.textContent).toMatch(/Object/);
    const down = await view(`?q=${prefix}&sort=name&dir=desc`);
    expect(column(down, "Object").map((t) => t.slice(0, names[0].length))).toEqual([...names].sort().reverse());
  });

  it("sorts by height now", async () => {
    const { prefix } = await three();
    const heights = column(await view(`?q=${prefix}&sort=height&dir=asc`), "Height").map(kilometres);
    expect(heights).toHaveLength(3);
    expect(heights).toEqual([...heights].sort((a, b) => a - b));
  });

  it("filters by kind", async () => {
    for (const [kind, label] of [
      ["satellite", "Satellite"],
      ["derelict", "Derelict"],
    ] as const) {
      const kinds = column(await view(`?show=all&kind=${kind}`), "Kind");
      expect(kinds.length, `no ${kind} rows`).toBeGreaterThan(0);
      expect(new Set(kinds)).toEqual(new Set([label]));
    }
  });

  // Yours is its own view (ADR 0015), so there's no "Only yours" box as
  // well; an old link to it opens Yours (the user's review, 2026-10-08)
  it("shows only yours in Yours, and an old 'only yours' link goes there", async () => {
    const a = new Session(baseUrl);
    const name = callsign("MINE");
    await a.launch({ band: "mid", callsign: name, beacon: "only mine" });
    for (const search of ["?show=mine", "?mine=1"]) {
      const page = await view(search, a);
      expect(page.querySelector("h1")?.textContent, search).toBe("Yours");
      const rows = [...page.querySelectorAll("tbody tr")];
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(row.textContent).toMatch(/yours/);
      expect(rows.some((row) => row.textContent?.includes(name))).toBe(true);
    }
    for (const search of ["", "?show=all", "?show=mine"]) {
      expect((await view(search, a)).querySelector("input[name=mine]"), search).toBeNull();
    }
  });

  it("names each satellite's operator, and finds by handle", async () => {
    const a = new Session(baseUrl);
    const handle = `cat_${Math.random().toString(36).slice(2, 9)}`;
    await post(a, "/operator/", { action: "claim", handle, passphrase: "a long passphrase" });
    const name = callsign("OPS");
    await a.launch({ band: "high", callsign: name, beacon: "with a handle" });
    const page = await view(`?q=${handle}`);
    const operators = column(page, "Operator");
    expect(operators).toEqual([handle]);
    expect(column(page, "Object")[0]).toContain(name);
  });

  it("pages through long results", async () => {
    const { prefix, names } = await three();
    const first = await view(`?q=${prefix}&sort=name&dir=asc&per=2`);
    expect(column(first, "Object")).toHaveLength(2);
    const next = first.querySelector<HTMLAnchorElement>('a[rel="next"]');
    expect(next, "no next page link").not.toBeNull();
    const second = doc(await (await new Session(baseUrl).get(next!.getAttribute("href")!)).text());
    expect(column(second, "Object").map((t) => t.slice(0, names[0].length))).toEqual([[...names].sort()[2]]);
    expect(first.body.textContent).toMatch(/1–2 of 3/);
  });

  it("says when nothing matches, and how to clear the filters", async () => {
    const page = await view(`?q=${callsign("NONE")}`);
    expect(page.querySelectorAll("tbody tr")).toHaveLength(0);
    expect(page.body.textContent).toMatch(/nothing matches/i);
    const clear = [...page.querySelectorAll("a")].find((a) => /clear/i.test(a.textContent ?? ""));
    expect(clear?.getAttribute("href"), "no link to clear the filters").toMatch(/^\/catalogue\/(\?show=live)?$/);
  });
});
