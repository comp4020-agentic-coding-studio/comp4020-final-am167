// Bringing a satellite down asks first, and thanks whoever does it (ADR
// 0011). Without this script the forms post straight away and the page they
// come back to has the thank-you open. On the sky page, `inPlace` takes the
// satellite's new orbit, so the page carries on and you watch it go.

export interface Manoeuvred {
  id: number;
  callsign: string | null;
}

interface Options<T extends Manoeuvred> {
  // given, the forms post in the background and this applies the result;
  // not given, they post as normal once confirmed
  inPlace?: (object: T, action: "deorbit" | "boost") => void;
  // where to say a refusal, for a background post
  refused?: (message: string) => void;
}

export function wireManoeuvres<T extends Manoeuvred>({ inPlace, refused }: Options<T> = {}): void {
  const confirm = document.getElementById("deorbit-confirm") as HTMLDialogElement | null;
  const thanks = document.getElementById("thanks") as HTMLDialogElement | null;
  if (!confirm || !thanks) return;

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

  async function post(form: HTMLFormElement, action: "deorbit" | "boost", callsign: string | null) {
    const body = new URLSearchParams([...new FormData(form)].map(([key, value]) => [key, String(value)]));
    body.set("action", action);
    try {
      // the attribute: `form.action` is the button named "action"
      const res = await fetch(form.getAttribute("action")!, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
        body,
      });
      const reply = (await res.json()) as { object?: T; error?: string };
      if (!res.ok || !reply.object) {
        refused?.(reply.error ?? "That didn't work. Try again.");
        return;
      }
      inPlace!(reply.object, action);
      if (action === "deorbit") thank(reply.object.callsign ?? callsign);
    } catch {
      refused?.("The connection dropped. Try again.");
    }
  }

  document.addEventListener("submit", async (e) => {
    const form = e.target as HTMLFormElement;
    if (!form.matches("form[data-manoeuvre]")) return;
    const button = (e.submitter ?? form.querySelector("button[name=action]")) as HTMLButtonElement;
    const action = button.value as "deorbit" | "boost";
    const callsign = button.dataset.callsign ?? null;
    if (action === "boost" && !inPlace) return;
    e.preventDefault();
    if (action === "deorbit" && !(await ask(callsign))) return;
    if (inPlace) {
      button.disabled = true;
      await post(form, action, callsign);
      button.disabled = false;
      return;
    }
    // the button's own name and value only go with a real click, so say it
    const field = document.createElement("input");
    field.type = "hidden";
    field.name = "action";
    field.value = action;
    form.append(field);
    form.submit();
  });
}
