# 0024. A line per request, and a request id on every line inside it

**Status:** accepted (2026-10-15; Advay: "Accept ADR 0024"). Supersedes, in 0023, that page views
by someone seen before aren't logged, that errors stay outside the
record, and the line's shape (`event key=value ...`), which gains a tag
in front; the rest of 0023 stands.

## Context

ADR 0023's record says who did what, one line per thing done, but not
which request each line came from, and nothing about the requests
themselves. The week 10 lecture ("reading a request log") shows the
shape it expects: a line per request with its method, path, status,
time and who, and a short request id in front of that line and of every
event written while serving it, so the events read back to the request
that made them. Its "what to log" asks for each error with "enough
context to reproduce it".

Three things the record can't say now:

- What someone who was seen before did that wasn't an action: which
  pages they read, in what order. A returning visitor's only line was
  their stream opening.
- Which lines go together. Two people acting at the same moment
  interleave, and only `who=` tells them apart; a refusal and the
  request that carried it aren't joined.
- Who and what an error happened to. `console.error`'s lines say what
  failed ("couldn't note a visitor") but not for whom or on which page.

Also, `listen-open` and `listen-close` (each event stream opening and
closing) were added after 0023 was accepted, so it doesn't list them.

## Options

For the request id:

- **None; join lines by `who=` and time.** Nothing to build, but two
  requests from one person, or lines from the server catching up, can't
  be told apart.
- **A short random id per request, carried through the request's async
  work (Node's `AsyncLocalStorage`), and put in front of each line
  written inside it.** No call site changes; every line inside a
  request is tagged, whoever wrote it.
- **Pass the id to every function that logs.** Explicit, but threads a
  parameter through the whole sky module for the sake of the log.

For the request line:

- **Every request.** Static files never reach the app's code (the Node
  adapter serves them first), and no page polls, so it's what people
  do, at the rate they do it.
- **Only requests that change something (non-GET).** Smaller, but loses
  what a returning viewer reads, which was half the point.

## Decision

A short random id per request, carried with `AsyncLocalStorage` from
the middleware, and a line per request.

### Shape

A line written while serving a request starts with its id in brackets:
`[3f9a1c] event key=value ...`. A line written outside any request (the
server's timers: a settle on wake-up, the ear) has no tag, and is
otherwise as 0023 has it. The id is six random hex digits, fresh for
each request, and is no part of anyone's cookie.

### The request line

`request`, written when the response is ready (so last, after the
events inside it): `who` (as 0023 names people: the person the request
came from, before anything it changed), `method`, `path` (the path
alone, clipped as `visit`'s is, never the query), `status` and `ms`
(how long the app took to answer).

```
[3f9a1c] visit who=anon#6d7d7f path=/
[3f9a1c] request who=anon#6d7d7f method=GET path=/ status=200 ms=14
[0b44e2] launch who=anon#6d7d7f sat=41 callsign="PIP 1" band=mid beacon="hello"
[0b44e2] request who=anon#6d7d7f method=POST path=/ status=303 ms=9
```

An event stream's request line is written as the stream opens, with
`status=200`; its `listen-open` and `listen-close` carry the same id, so
a stream's opening and closing read back to each other.

### Listening

As built after 0023 (2026-10-15): `listen-open` with `who`, `counted`
(`yes`, or `no` for a browser that has loaded nothing here; ADR 0016),
`listening` (how many people are listening after it) and `page` (the
`Referer`'s path, if it's readable); `listen-close` with `who`, `after`
(how long it was open, in seconds) and `listening`.

### Errors

An error is a line in the record, `error`, with `what` failed, then the
error itself (its stack, as `console.error` prints it) on stderr. Inside
a request it is tagged and also says `who`, `method` and `path`, so it
can be tried again; outside one, it's `what` alone. A page that throws
is an `error` line with `what=page`, its message and no stack (Astro
prints the stack after it), then its request line with `status=500`.

### Lines the server writes while serving someone

Serving a request can catch the sky up (ADR 0007, 0008): a collision or
burn-up that was due is written then, inside the request, and so carries
its tag. Its `at=` still says when it happened, and `who=` still only
ever names whoever did something (0023), so a tag on a `collision` says
which request found it due, not who caused it.

## Consequences

- Narrating from `flyctl logs`: each person's requests read in order,
  and a refusal, a launch or an error sits next to the request it came
  in on.
- Many more lines: one for every page anyone opens. Fly keeps logs for
  a while, not forever (0023), so the record reaches back less far.
- The record now says which pages each person reads, not only what they
  do. It names them by the short id only, as before, and keeps no query
  string, client address or user agent.
- The tag is carried by Node's async context, so a line written from a
  callback that loses it (an event listener the request didn't register,
  say) goes untagged; the stream's closing is bound to its request for
  that reason.
- Errors from Astro itself, before or outside the middleware (a form
  from another site, a path it can't decode), are still Astro's own
  lines, untagged.
