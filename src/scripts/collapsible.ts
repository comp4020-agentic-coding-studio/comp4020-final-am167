// Boxes that fold away (the user's review, 2026-10-08): each
// `[data-collapsible]` keeps its heading and a `.box-toggle` button that
// hides or shows what it names in `aria-controls`. The page serves them
// open with the button hidden, so without this script nothing is out of
// reach. Which are folded is remembered in this browser, if it keeps
// anything (a convenience: losing it only opens them again).

type Memory = Pick<Storage, "getItem" | "setItem">;

function browserMemory(): Memory | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function collapsible(root: Document = document, memory: Memory | null = browserMemory()): void {
  for (const box of root.querySelectorAll<HTMLElement>("[data-collapsible]")) {
    const button = box.querySelector<HTMLButtonElement>(".box-toggle");
    const body = button && root.getElementById(button.getAttribute("aria-controls") ?? "");
    if (!button || !body) continue;
    const key = `kessler:folded:${box.dataset.collapsible}`;
    const fold = (folded: boolean) => {
      body.hidden = folded;
      button.setAttribute("aria-expanded", String(!folded));
      box.classList.toggle("folded", folded);
    };
    let remembered: string | null = null;
    try {
      remembered = memory?.getItem(key) ?? null;
    } catch {
      // nothing kept here: it starts open
    }
    fold(remembered === "1");
    button.hidden = false;
    button.addEventListener("click", () => {
      const folded = !body.hidden;
      fold(folded);
      try {
        memory?.setItem(key, folded ? "1" : "0");
      } catch {
        // folded for now, open again next time
      }
    });
  }
}
