import type { APIRoute } from "astro";
import { boost, deorbit, toPublic } from "../../lib/sky.ts";

// Bringing your satellite down, or boosting it up a band (ADR 0011). A plain
// form posts here from the launchpad or the sky and works without
// JavaScript: it goes back where it came from, saying what happened (the
// page thanks you for a deorbit). The pages' scripts ask for JSON instead.
const BACK = ["/", "/sky/"];

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const viewer = { person: locals.person, operator: locals.operator?.id ?? null };
  const wantsJson = request.headers.get("accept")?.includes("application/json");
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "That form couldn't be read." }, { status: 400 });
  }
  const back = BACK.includes(String(form.get("back"))) ? String(form.get("back")) : "/";
  const id = Number(form.get("id"));
  const action = form.get("action");
  if (!Number.isInteger(id) || (action !== "deorbit" && action !== "boost")) {
    if (wantsJson) return Response.json({ error: "That isn't a manoeuvre." }, { status: 400 });
    return redirect(back, 303);
  }

  const result = action === "deorbit" ? deorbit(viewer, id) : boost(viewer, id);
  if (wantsJson) {
    if (!result.ok) return Response.json({ error: result.error, why: result.why }, { status: 422 });
    return Response.json({ object: toPublic(result.object, viewer) });
  }
  const done = action === "deorbit" ? "deorbited" : "boosted";
  return redirect(result.ok ? `${back}?${done}=${id}` : `${back}?refused=${result.why}`, 303);
};
