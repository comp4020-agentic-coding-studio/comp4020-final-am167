import { defineMiddleware } from "astro:middleware";
import { visited } from "./lib/heard.ts";
import { identify, logError, served, whoIs } from "./lib/log.ts";
import { operatorOf } from "./lib/operators.ts";
import { PERSON_COOKIE, newVisitor } from "./lib/person.ts";

// Who is visiting: their person cookie (ADR 0002), set on the first visit,
// and the operator they're signed in as, if any (ADR 0009). Each request is
// a line in the record, and its id tags every line written serving it
// (ADR 0024).
export const onRequest = defineMiddleware((context, next) =>
  served(context.request, async () => {
    const given = context.cookies.get(PERSON_COOKIE)?.value;
    const person = given && /^[0-9a-f-]{36}$/.test(given) ? given : newVisitor(context.cookies, context.url, context.request.headers);
    context.locals.person = person;
    context.locals.operator = operatorOf(person);
    identify(whoIs(person, context.locals.operator?.handle ?? null));
    return answer(person, await next());
  }),
);

function answer(person: string, response: Response): Response {
  // asked for anything but the event stream: from now on, this browser's
  // stream counts as someone listening, once it's back with its cookie
  // (ADR 0016)
  if (!response.headers.get("content-type")?.startsWith("text/event-stream")) {
    try {
      visited(person);
    } catch (error) {
      // a busy or full disk: not counted yet, and the page goes out anyway
      logError("couldn't note a visitor", error);
    }
  }
  // pages are made for one person (their satellite, their cookie): no caches
  if (response.headers.get("content-type")?.startsWith("text/html")) {
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}
