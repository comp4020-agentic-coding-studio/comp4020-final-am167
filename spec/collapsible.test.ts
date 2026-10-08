import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { collapsible } from "../src/scripts/collapsible.ts";

// The sky's boxes fold away (the user's review, 2026-10-08): each keeps its
// heading and a button that hides or shows the rest, and each browser
// remembers which it folded. Without the script they stay open and the
// button stays hidden, so nothing is ever out of reach.
const box = (id: string) => `
  <section data-collapsible="${id}" aria-labelledby="${id}-title">
    <div class="head">
      <h2 id="${id}-title">${id}</h2>
      <button type="button" class="box-toggle" aria-controls="${id}-body" aria-labelledby="${id}-title" aria-expanded="true" hidden></button>
    </div>
    <div id="${id}-body">what's in it</div>
  </section>`;

function page(stored: Record<string, string> = {}) {
  const dom = new JSDOM(`<main>${box("summary")}${box("heard")}</main>`);
  const document = dom.window.document;
  const memory = new Map(Object.entries(stored));
  const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => void memory.set(key, value) };
  collapsible(document, storage);
  const parts = (id: string) => ({
    button: document.querySelector<HTMLButtonElement>(`[aria-controls="${id}-body"]`)!,
    body: document.getElementById(`${id}-body`)!,
  });
  return { parts, memory };
}

describe("a box on the sky", () => {
  it("starts open, with its button shown", () => {
    const { parts } = page();
    const { button, body } = parts("summary");
    expect(button.hidden).toBe(false);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(body.hidden).toBe(false);
  });

  it("folds away and back on its button, on its own", () => {
    const { parts } = page();
    parts("summary").button.click();
    expect(parts("summary").body.hidden).toBe(true);
    expect(parts("summary").button.getAttribute("aria-expanded")).toBe("false");
    expect(parts("heard").body.hidden).toBe(false);
    parts("summary").button.click();
    expect(parts("summary").body.hidden).toBe(false);
    expect(parts("summary").button.getAttribute("aria-expanded")).toBe("true");
  });

  it("is remembered folded in this browser", () => {
    const { parts, memory } = page();
    parts("heard").button.click();
    const again = page(Object.fromEntries(memory));
    expect(again.parts("heard").body.hidden).toBe(true);
    expect(again.parts("heard").button.getAttribute("aria-expanded")).toBe("false");
    expect(again.parts("summary").body.hidden).toBe(false);
  });

  it("still works where the browser keeps nothing", () => {
    const dom = new JSDOM(`<main>${box("summary")}</main>`);
    const refusing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    collapsible(dom.window.document, refusing);
    const button = dom.window.document.querySelector<HTMLButtonElement>(".box-toggle")!;
    button.click();
    expect(dom.window.document.getElementById("summary-body")!.hidden).toBe(true);
  });
});
