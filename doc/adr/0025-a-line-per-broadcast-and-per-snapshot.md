# 0025. A line per broadcast, and per snapshot a stream opens with

**Status:** accepted (2026-10-19; Advay: "the ADR is approved"). Supersedes, in 0023, that beacons
being heard aren't logged; the rest of 0023 and 0024 stand.

## Context

ADR 0023's record logs what a person does or is refused, and what the
server does on its own, but not what the server tells people. A stream's
opening is logged (`listen-open`), not the snapshot it's sent (`hello`),
and nothing says an event went out, or to how many streams. Three
broadcasts leave no trace at all: a collision coming (`conjunction`), a
beacon heard (`heard`) and the count of people listening (`audience`).
So the record can't answer "did the server tell anyone?" when a page
didn't update.

## Options

- **Leave it.** The causes are logged; a broadcast follows from each.
  But that's an assumption the log can't check, and three have no cause
  logged.
- **A line per broadcast, and per snapshot, with counts only.** One
  `broadcast` line from `publish`, the one place every event leaves
  by; one `snapshot` line after each `hello`.
- **A line per stream per event.** Shows each delivery, but a launch
  with twenty pages open is twenty lines.

## Decision

The second. `src/lib/events.ts` `publish` writes, after trying each
stream, `broadcast type=<event> ... streams=<n>`: what it's about (`sat=`
for a launch, decay or heard beacon, with `manoeuvre=` or `station=`;
`a=`/`b=` for a conjunction; `id=` for a collision; `listening=` for the
audience) and how many streams took it without breaking. `/api/events`
writes `snapshot who=... objects= conjunctions= collisions= heard=
listening=` once the `hello` is sent: counts, not contents, since the
contents are the sky. Both carry the request id where there is one
(ADR 0024): a snapshot always, a broadcast when a request caused it.

## Consequences

- Each heard beacon is now a line, which 0023 left out so as not to bury
  the rest. It's one short line per pass, not per station listener;
  `grep -v broadcast` gives the old record back.
- `streams=` counts every open stream, counted as listening or not
  (ADR 0016), so it can be more than `listening=`.
- A broadcast's line follows the line for what caused it (a `launch`, a
  `collision`) when both are written; where the cause is logged after
  publishing (a collision), the broadcast comes first.
- Tested in `spec/log.test.ts` ("listening").
