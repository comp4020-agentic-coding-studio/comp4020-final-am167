// Bringing a satellite down asks first, and thanks whoever does it (ADR
// 0011), wherever its controls are (a card, or Yours: ADR 0015): the forms
// post in the background and `inPlace` takes the satellite's new orbit, so
// the page carries on and you watch it go. Without this script the forms
// post as normal, and the page they come back to has the thank-you open.

export interface Manoeuvred {
  id: number;
  callsign: string | null;
}

interface Options<T extends Manoeuvred> {
  // applies the result: the satellite's new orbit
  inPlace: (object: T, action: "deorbit" | "boost") => void | Promise<void>;
}

export function wireManoeuvres<T extends Manoeuvred>({ inPlace }: Options<T>): void {
  const confirm = document.getElementById("deorbit-confirm") as HTMLDialogElement | null;
  const thanks = document.getElementById("thanks") as HTMLDialogElement | null;
  if (!confirm || !thanks) return;

  // what came back in the address (brought down, boosted, refused) is said
  // once: a reload doesn't say it again
  if (/[?&](deorbited|boosted|refused)=/.test(location.search)) history.replaceState(null, "", location.pathname);

  // a click on the backdrop closes either (the content fills the box)
  for (const dialog of [confirm, thanks]) {
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) dialog.close("no");
    });
  }

  // the page came back from bringing one down: the thank-you is open, made
  // modal now there's a script to hold the focus in it
  if (thanks.open) {
    thanks.close();
    thanks.showModal();
  }

  function thank(callsign: string | null) {
    thanks!.querySelector("[data-callsign]")!.textContent = callsign ?? "Your satellite";
    thanks!.showModal();
  }

  // the question, answered: true to go ahead
  function ask(callsign: string | null): Promise<boolean> {
    confirm!.querySelector("[data-callsign]")!.textContent = callsign ?? "your satellite";
    confirm!.returnValue = "";
    confirm!.showModal();
    return new Promise((resolve) => confirm!.addEventListener("close", () => resolve(confirm!.returnValue === "yes"), { once: true }));
  }

  // a refusal is said beside the buttons that asked (ManoeuvreControls)
  const say = (form: HTMLFormElement, message: string) => {
    const line = form.closest("[data-manoeuvres]")?.querySelector("[data-manoeuvre-error]");
    if (line) line.textContent = message;
  };

  // the satellite's new orbit, or nothing if it was refused
  async function post(form: HTMLFormElement, body: URLSearchParams, action: "deorbit" | "boost", callsign: string | null): Promise<T | undefined> {
    say(form, "");
    try {
      // the attribute: `form.action` is the button named "action"
      const res = await fetch(form.getAttribute("action")!, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
        body,
      });
      const reply = (await res.json()) as { object?: T; error?: string };
      if (!res.ok || !reply.object) {
        say(form, reply.error ?? "That didn't work. Try again.");
        return;
      }
      if (action === "deorbit") thank(reply.object.callsign ?? callsign);
      return reply.object;
    } catch {
      say(form, "The connection dropped. Try again.");
    }
  }

  document.addEventListener("submit", async (e) => {
    const form = e.target as HTMLFormElement;
    if (!form.matches("form[data-manoeuvre]")) return;
    const button = (e.submitter ?? form.querySelector("button[name=action]")) as HTMLButtonElement;
    const action = button.value as "deorbit" | "boost";
    const callsign = button.dataset.callsign ?? null;
    e.preventDefault();
    // which satellite, as it was when clicked, whatever the page does
    // while the question is open
    const body = new URLSearchParams([...new FormData(form)].map(([key, value]) => [key, String(value)]));
    body.set("action", action);
    if (action === "deorbit" && !(await ask(callsign))) return;
    button.disabled = true;
    const object = await post(form, body, action, callsign);
    button.disabled = false;
    if (object) await inPlace(object, action);
  });
}
