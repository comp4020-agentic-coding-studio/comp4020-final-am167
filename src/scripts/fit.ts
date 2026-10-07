// Keeps a page to one screen on a laptop or desktop (spec/fit.test.ts): while
// the page scrolls, it gives up what it can spare, one step at a time. Each
// step is a number added to `data-fit` on `root` ("1 2 3"), and the page's
// CSS says what each hides (`[data-fit~="2"] .band-hint`), so a step stays
// taken once later ones are. It starts again from nothing whenever the
// screen or the watched parts change size, so a line that grows (a longer
// notice, a third line of news) takes another step, and one that shrinks
// gives things back. A phone's layout scrolls by design, so it does nothing
// there.
const DESKTOP = "(min-width: 52.01rem)";

export function fitScreen(root: HTMLElement, steps: number, watch: Element[]): void {
  const desktop = matchMedia(DESKTOP);
  const page = document.documentElement;
  const fit = () => {
    const taken: number[] = [];
    // mid-launch the launchpad's scene moves off the page; leave it be
    if (document.body.classList.contains("launching")) return;
    root.dataset.fit = "";
    if (!desktop.matches) return;
    while (taken.length < steps && page.scrollHeight > innerHeight) {
      taken.push(taken.length + 1);
      root.dataset.fit = taken.join(" ");
    }
  };
  // at most once a frame, and never inside the observer's own callback,
  // whose changes would only be seen next frame
  let queued = false;
  const later = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      fit();
    });
  };
  fit();
  addEventListener("resize", later);
  desktop.addEventListener("change", later);
  // the web font is wider than the fallback it replaces
  document.fonts?.ready.then(later);
  const observer = new ResizeObserver(later);
  for (const el of watch) observer.observe(el);
}
