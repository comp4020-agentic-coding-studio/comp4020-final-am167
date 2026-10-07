import { defineMiddleware } from "astro:middleware";
import { visited } from "./lib/heard.ts";
import { operatorOf } from "./lib/operators.ts";
import { PERSON_COOKIE, newPerson } from "./lib/person.ts";

// Who is visiting: their person cookie (ADR 0002), set on the first visit,
// and the operator they're signed in as, if any (ADR 0009).
export const onRequest = defineMiddleware(async (context, next) => {
  let person = context.cookies.get(PERSON_COOKIE)?.value;
  if (!person || !/^[0-9a-f-]{36}$/.test(person)) person = newPerson(context.cookies, context.url, context.request.headers);
  context.locals.person = person;
  context.locals.operator = operatorOf(person);
  const response = await next();
  // asked for anything but the event stream: from now on, this browser's
  // stream counts as someone listening (ADR 0016)
  if (!response.headers.get("content-type")?.startsWith("text/event-stream")) {
    try {
      visited(person);
    } catch (error) {
      // a busy or full disk: not counted yet, and the page goes out anyway
      console.error("couldn't note a visitor:", error);
    }
  }
  // pages are made for one person (their satellite, their cookie): no caches
  if (response.headers.get("content-type")?.startsWith("text/html")) {
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
});
