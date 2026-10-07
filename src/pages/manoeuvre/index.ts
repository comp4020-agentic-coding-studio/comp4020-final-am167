import type { APIRoute } from "astro";
import { boost, deorbit, toPublic } from "../../lib/sky.ts";

// Bringing your satellite down, or boosting it up a band (ADR 0011). A plain
// form posts here from "Yours" in the catalogue or from the satellite's own
// page (ADR 0015) and works without JavaScript: it goes back where it came
// from, saying what happened (the page thanks you for a deorbit). The
// pages' script asks for JSON instead.
//
// Where to go back to is a fixed token, never an address, so nobody can be
// sent off the site: anything but "object" goes back to Yours.
const BACK = new Map<string, (id: number) => string>([
  ["yours", () => "/catalogue/?show=mine&"],
  ["object", (id) => `/object/${id}/?`],
]);

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const viewer = { person: locals.person, operator: locals.operator?.id ?? null };
  const wantsJson = request.headers.get("accept")?.includes("application/json");
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "That form couldn't be read." }, { status: 400 });
  }
  const id = Number(form.get("id"));
  const action = form.get("action");
  const back = BACK.get(String(form.get("back") ?? "")) ?? BACK.get("yours")!;
  if (!Number.isInteger(id) || id <= 0 || (action !== "deorbit" && action !== "boost")) {
    if (wantsJson) return Response.json({ error: "That isn't a manoeuvre." }, { status: 400 });
    return redirect("/catalogue/?show=mine", 303);
  }

  const result = action === "deorbit" ? deorbit(viewer, id) : boost(viewer, id);
  if (wantsJson) {
    if (!result.ok) return Response.json({ error: result.error, why: result.why }, { status: 422 });
    return Response.json({ object: toPublic(result.object, viewer) });
  }
  const done = action === "deorbit" ? "deorbited" : "boosted";
  return redirect(back(id) + (result.ok ? `${done}=${id}` : `refused=${result.why}`), 303);
};
