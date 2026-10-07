import { keepCounting } from "./history.ts";

// The card an object's history pops up in (ADR 0012, 0015), shared by every
// page that has one (src/components/ObjectCard.astro). Any link to an
// object's own address opens it here instead, and so can the page itself
// (an object clicked in the sky). The server tells the history; the card
// works nothing out itself. While it's open, the page can ask for it again
// when something could have changed it (a collision, a burn-up, a
// manoeuvre).
//
// On the sky it isn't modal: the sky and the stations stay usable beside
// it, and clicking another object opens that one. Elsewhere it is.

export interface ObjectCard {
  open(id: number): void;
  // ask for it again: the open one, or only if it's this one; `focus` puts
  // focus back in it (after a manoeuvre from its own buttons)
  refresh(id?: number, focus?: boolean): void;
  // the object it's showing, if it's open
  showing(): number | null;
}

export function objectCard(now: () => number, onChange: (id: number | null) => void = () => {}): ObjectCard | null {
  const dialog = document.getElementById("object-card") as HTMLDialogElement | null;
  if (!dialog) return null;
  const card = dialog;
  const body = card.querySelector<HTMLElement>(".object-card-body")!;
  const status = document.getElementById("object-card-status");
  const modal = !card.classList.contains("side");

  // the object it's for: set on the click, so an answer for an earlier one,
  // or an event arriving while it loads, can't put the wrong one in it
  let showing: number | null = null;
  let stopCounting = () => {};
  // where focus was when it opened, to go back to on close
  let opener: HTMLElement | null = null;
  let openerHref: string | null = null;
  // the latest ask: a slow answer to an earlier one is dropped
  let asked = 0;

  const show = () => {
    if (card.open) return;
    if (modal) card.showModal();
    else card.show();
  };

  // opened by the server (an object's own address): made modal now there's
  // a script to hold focus in it; removing the attribute raises no close
  if (card.open) {
    const article = body.querySelector<HTMLElement>(".history");
    showing = article ? Number(article.dataset.id) : null;
    stopCounting = article ? keepCounting(article, now) : () => {};
    card.removeAttribute("open");
    show();
    body.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  }

  async function load(id: number, refresh: boolean, focus = false) {
    const ask = ++asked;
    if (!refresh) {
      if (showing !== id) onChange(id);
      showing = id;
      if (!card.open) {
        opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
        openerHref = opener?.getAttribute("href") ?? null;
      }
    }
    let html: string | null = null;
    try {
      const res = await fetch(`/object/${id}/panel`);
      if (res.ok) html = await res.text();
    } catch {
      // offline: said below, unless it was only a refresh
    }
    if (ask !== asked || showing !== id) return;
    if (html === null && refresh) return;
    // a refresh mustn't throw focus out of the card
    const hadFocus = card.contains(document.activeElement);
    stopCounting();
    if (html === null) {
      body.innerHTML = '<h2 id="object-card-title" tabindex="-1">Not loaded</h2><p class="history-error">Its history couldn\'t be loaded. Try again in a moment.</p>';
      stopCounting = () => {};
    } else {
      body.innerHTML = html;
      const article = body.querySelector<HTMLElement>(".history");
      stopCounting = article ? keepCounting(article, now) : () => {};
    }
    const heading = body.querySelector<HTMLElement>("h2");
    // a refresh that answers before the first ask does is the opening
    const opening = !card.open;
    show();
    if (refresh && !opening) {
      if ((hadFocus || focus) && !card.contains(document.activeElement)) heading?.focus({ preventScroll: true });
      return;
    }
    if (status) status.textContent = `${heading?.textContent ?? "Its history"} opened.`;
    heading?.focus({ preventScroll: true });
    body.scrollTop = 0;
  }

  card.addEventListener("close", () => {
    asked++;
    stopCounting();
    stopCounting = () => {};
    showing = null;
    onChange(null);
    if (status) status.textContent = "";
    // an object's own address shows the catalogue under its card: closing
    // the card leaves the catalogue, at its own address
    if (/^\/object\/\d+\/$/.test(location.pathname)) history.replaceState(null, "", "/catalogue/");
    // a list the page rebuilds (the sky's latest launches) may have
    // replaced the link that opened it: the same link, then
    const back = opener?.isConnected
      ? opener
      : openerHref
        ? document.querySelector<HTMLElement>(`main a[href="${CSS.escape(openerHref)}"]`)
        : null;
    back?.focus({ preventScroll: true });
    opener = null;
    openerHref = null;
  });
  if (modal) {
    // a click on the backdrop closes it (the frame fills the box), but not
    // a text selection that ends there
    let downOnBackdrop = false;
    card.addEventListener("pointerdown", (e) => (downOnBackdrop = e.target === card));
    card.addEventListener("click", (e) => {
      if (e.target === card && downOnBackdrop) card.close();
    });
  } else {
    // not modal, so Escape is ours to handle (a question asked over it
    // closes first)
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && card.open && !document.querySelector("dialog:modal")) card.close();
    });
  }

  // any link to an object's address opens it here; "A link to it" (marked
  // data-page) and modified clicks go to the address
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>("a[href]");
    if (!link || link.hasAttribute("data-page")) return;
    const id = link.getAttribute("href")?.match(/^\/object\/(\d+)\/$/)?.[1];
    if (!id) return;
    event.preventDefault();
    load(Number(id), false);
  });

  return {
    open: (id) => void load(id, false),
    refresh: (id, focus = false) => {
      if (showing !== null && (id === undefined || id === showing)) void load(showing, true, focus);
    },
    showing: () => showing,
  };
}
