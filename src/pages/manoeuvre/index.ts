import type { APIRoute } from "astro";
import { boost, deorbit, toPublic } from "../../lib/sky.ts";

// Bringing your satellite down, or boosting it up a band (ADR 0011). A plain
// form posts here from the sky's station panel and works without
// JavaScript: it goes back to the sky, saying what happened (the page
// thanks you for a deorbit). The page's script asks for JSON instead.
const BACK = "/sky/";

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
  if (!Number.isInteger(id) || (action !== "deorbit" && action !== "boost")) {
    if (wantsJson) return Response.json({ error: "That isn't a manoeuvre." }, { status: 400 });
    return redirect(BACK, 303);
  }

  const result = action === "deorbit" ? deorbit(viewer, id) : boost(viewer, id);
  if (wantsJson) {
    if (!result.ok) return Response.json({ error: result.error, why: result.why }, { status: 422 });
    return Response.json({ object: toPublic(result.object, viewer) });
  }
  const done = action === "deorbit" ? "deorbited" : "boosted";
  return redirect(result.ok ? `${BACK}?${done}=${id}` : `${BACK}?refused=${result.why}`, 303);
};
