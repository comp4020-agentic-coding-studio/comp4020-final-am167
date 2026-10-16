import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";
import { pageNumbers } from "../src/lib/format.ts";
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
  // Astro drops the space where a line breaks before a tag: "beside thesky"
  // (seen behind an object's card, 2026-10-08)
  it("keeps the space before the links in its introduction", async () => {
    const intro = (await view("")).querySelector("main p")!.textContent!.replace(/\s+/g, " ");
    expect(intro).toContain("beside the sky");
  });

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

  // a thousand objects in production made a hundred-row page far too long
  // (the user's review, 2026-10-16): a short page by default, more on asking
  it("shows 25 a page unless asked for more", async () => {
    const page = await view("?show=all");
    const total = Number(page.querySelector(".range")!.textContent!.match(/of ([\d,]+)/)![1].replace(/,/g, ""));
    expect(page.querySelectorAll("tbody tr")).toHaveLength(Math.min(total, 25));
    const per = page.querySelector<HTMLSelectElement>('form.filters select[name="per"]');
    expect(per, "no rows-per-page choice").not.toBeNull();
    expect(per!.value).toBe("25");
    expect([...per!.options].map((o) => o.value)).toEqual(["25", "50", "100"]);
  });

  it("numbers its pages, and marks the one you're on", async () => {
    const { prefix } = await three();
    const first = await view(`?q=${prefix}&sort=name&dir=asc&per=1`);
    const pager = first.querySelector("nav.pages")!;
    // (read out as "Page 1")
    const number = (el: Element | null | undefined) => el?.textContent?.trim().replace(/^Page\s*/, "");
    expect(number(pager.querySelector('[aria-current="page"]'))).toBe("1");
    const third = [...pager.querySelectorAll("a")].find((a) => number(a) === "3");
    expect(third?.getAttribute("href"), "no link to page 3").toMatch(/page=3/);
    const last = await view(`?q=${prefix}&sort=name&dir=asc&per=1&page=3`);
    expect(last.querySelector('nav.pages a[rel="next"]')).toBeNull();
    expect(last.querySelector('nav.pages a[rel="prev"]')?.getAttribute("href")).toMatch(/page=2/);
  });

  // ...and folds away, so the collisions under it are a click away
  it("folds the table away, with the collisions outside it", async () => {
    const page = await view("");
    const box = [...page.querySelectorAll<HTMLElement>("section[data-collapsible]")].find((s) => s.querySelector("table"));
    expect(box, "the table isn't in a box that folds").toBeDefined();
    const toggle = box!.querySelector("button[aria-expanded]");
    expect(toggle?.textContent, "the fold button doesn't say what it does").toMatch(/table/i);
    const body = page.getElementById(toggle?.getAttribute("aria-controls") ?? "");
    expect(body?.querySelector("table")).not.toBeNull();
    expect(body?.querySelector("form.filters")).not.toBeNull();
    expect(box!.contains(page.getElementById("collisions"))).toBe(false);
    expect(box!.querySelector('a[href="#collisions"]'), "no way down to the collisions").not.toBeNull();
  });

  // Yours has no collisions under its record: nothing to fold it away for
  it("doesn't fold your record away", async () => {
    const a = new Session(baseUrl);
    await a.launch({ band: "low", callsign: callsign("FOLD"), beacon: "kept open" });
    const page = await view("?show=mine", a);
    expect(page.querySelector("table")).not.toBeNull();
    expect(page.querySelector("table")!.closest("[data-collapsible]")).toBeNull();
  });

  // the filter form keeps the rows a page, the sort and its direction
  it("keeps the rows a page and the sort through a filter change", async () => {
    const page = await view("?show=all&per=50&sort=launched&dir=asc");
    const form = page.querySelector<HTMLFormElement>("form.filters")!;
    const sent = Object.fromEntries([...form.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[name]")].map((f) => [f.name, f.value]));
    expect(sent).toMatchObject({ per: "50", sort: "launched", dir: "asc" });
    const sortLink = page.querySelector<HTMLAnchorElement>("thead th a")!.getAttribute("href")!;
    expect(sortLink).toContain("per=50");
  });

  it("shows the last page for a page past the end", async () => {
    const { prefix } = await three();
    const page = await view(`?q=${prefix}&per=2&page=99`);
    expect(page.body.textContent).toMatch(/3–3 of 3/);
    expect(page.querySelector('nav.pages [aria-current="page"]')?.textContent).toMatch(/2/);
  });

  it("says when nothing matches, and how to clear the filters", async () => {
    const page = await view(`?q=${callsign("NONE")}`);
    expect(page.querySelectorAll("tbody tr")).toHaveLength(0);
    expect(page.body.textContent).toMatch(/nothing matches/i);
    const clear = [...page.querySelectorAll("a")].find((a) => /clear/i.test(a.textContent ?? ""));
    expect(clear?.getAttribute("href"), "no link to clear the filters").toMatch(/^\/catalogue\/(\?show=live)?(#records)?$/);
  });
});

describe("the catalogue's page numbers", () => {
  it("shows the first, the last and those around this one, with gaps", () => {
    expect(pageNumbers(1, 1)).toEqual([1]);
    expect(pageNumbers(3, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageNumbers(1, 5)).toEqual([1, 2, null, 5]);
    expect(pageNumbers(6, 40)).toEqual([1, null, 5, 6, 7, null, 40]);
    expect(pageNumbers(40, 40)).toEqual([1, null, 39, 40]);
    // a gap of one page shows the page instead
    expect(pageNumbers(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});
