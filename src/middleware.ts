import { defineMiddleware } from "astro:middleware";

// A person is an anonymous cookie (ADR 0002): a random id, set on the first
// visit and kept for years.
const COOKIE = "kessler_person";
const TEN_YEARS = 10 * 365 * 24 * 60 * 60;

export const onRequest = defineMiddleware(async (context, next) => {
  let person = context.cookies.get(COOKIE)?.value;
  if (!person || !/^[0-9a-f-]{36}$/.test(person)) {
    person = crypto.randomUUID();
    // Fly's proxy terminates TLS, so the request the app sees is plain http
    const https =
      context.url.protocol === "https:" ||
      context.request.headers.get("x-forwarded-proto") === "https";
    context.cookies.set(COOKIE, person, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: https,
      maxAge: TEN_YEARS,
    });
  }
  context.locals.person = person;
  const response = await next();
  // pages are made for one person (their satellite, their cookie): no caches
  if (response.headers.get("content-type")?.startsWith("text/html")) {
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
});
