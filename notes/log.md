# Process log


## 2026-10-03 — Choosing the project: Kessler

Read the final project brief and the week 8 slides, then worked through ideas
with the agent before settling. Rejected along the way: Desire Lines (shallow),
The Commons (liked the regrowth, disliked proposing and voting on rules), Rot
and an A2-linked city displacement game ("Uplift"), then a run of astronomy
ideas building on A1's space theme (Great Silence, Interferometer, Occultation).
Partway through, read the 16 classmates' public final READMEs: mostly utilities and
games, plus co-presence art (Constellation, The Garden, Calligraphy Relay,
Public Canvas), so "people as stars" and "grows while people are together" were
already taken.

Chose **Kessler**: a shared orbit where people launch satellites to be seen,
and collisions cascade into debris. Decisions: beacon incentive (a short line
shown when your satellite passes overhead) with a little coloured light trail;
no reset, the sky slowly heals through orbital decay; 2D chart; owners can
deorbit their own satellite. Written up in `PLAN.md` for detail later.

## 2026-10-03 — Person, persistence, real-time, and the stack ADR

Followed the week 8 lecture's approach: the agent laid out three options for
each question with pros and cons, without recommending, and I picked.

- **Person:** anonymous cookie plus a callsign per launch, one active satellite
  per cookie. Rejected a recovery code and real accounts (friction for a
  stranger's first try). The extra-browsers loophole is accepted for now and
  left for the C10 logs to judge. Not fully decided: ADR 0002 stays
  *proposed* and may change later.
- **Persists:** the sky decays but the catalogue keeps every object's record
  forever, including which collision made each fragment. Rejected deleting
  decayed objects and keeping only counts, since both lose "who caused this".
- **Real-time:** SSE with the server clock as the only clock; clients draw
  positions from stored orbits, so only events cross the network. Rejected
  WebSockets (traffic is one-way) and polling.
- **Stack:** Astro on Node, SQLite via Drizzle on `/data`, SSE, the same as
  crit 7. Rejected SvelteKit and Phoenix LiveView (new to me, three days to C8).

Wrote one decision record each, in `doc/adr/` with an index: 0001 stack,
0002 person, 0003 persistence, 0004 real-time. Writing the consequences
surfaced one hard requirement: Fly stops idle machines, so the server must
replay missed time on boot or collisions silently stop happening while nobody
watches. Added a "Foundations" section to `PLAN.md` and the ADR rule to
CLAUDE.md/AGENTS.md.

## 2026-10-04 — Resolving the open questions for C8

Read the C8 brief first: it only asks for proof of life ("the feature list,
the real-time layer and the polish can all wait"), plus a first README at
`/readme/`. Worked through `PLAN.md`'s open questions one at a time; the agent
gave options with trade-offs and I picked.

- **C8 scope:** proof of life plus SSE (launch, persist, orbits drawn,
  launches live in other sessions). Collisions, debris, decay and deorbit
  move to C9. Kept SSE to get the event plumbing in early, even though the
  brief says it can wait.
- **Overhead:** one shared ground station, so everyone reads the same beacon
  at once. My addition: the landing page is a launchpad; launching shows the
  rocket rising and the camera pans up into the orbit view where the
  satellite appears. A simple pan for C8, the cinematic version in week 12.
- **Beacon:** 60 chars, plain text, no URLs, small blocklist; shown while
  live, kept in the catalogue.
- **Launch limits:** one live satellite each, plus a cooldown (10 min to
  start) after it dies, against relaunch spam.
- **Bands:** low/mid/high with server-side jitter in radius and phase.
- **Deferred:** decay rates, collision radius, fuel and cooldown length to C9
  (tune with the sim running); the name before the final README.

`PLAN.md` now has a "Now and later" section splitting the C8 build from what
comes after.

## 2026-10-04 — Stack restored

`/comp4020:stack` still only targets GitHub Pages and stops on a Fly repo, so
restored the hand-wired stack from `f3e6c27` (reverting its revert `d86a89e`,
which had only been reverted because the stack wasn't decided yet; ADR 0001
now decides it). One change against the ADR: the old setup created a
placeholder `notes` table with raw SQL; replaced that with Drizzle's migrator
running at boot (`drizzle/`, copied into the image) and an empty schema, so
the first migration will be the real satellites table. `pnpm build` and
`pnpm check` green against the local build; Docker build not re-run (daemon
off).

## 2026-10-04 — C8 slice: launch, the sky, live updates

Built test-first. Wrote `spec/launch.test.ts` and `spec/live.test.ts` against
the running app (plus a `spec/session.ts` helper where each Session is one
cookie, i.e. one person), watched all 16 fail, then built:

- **Person:** middleware sets the `kessler_person` cookie (httpOnly, Lax,
  Secure behind Fly's https proxy).
- **Data:** one `objects` table (first migration, `drizzle/0000_objects.sql`)
  carrying ADR 0003's fields minus debris lineage, which comes with
  collisions in C9. Each orbit stores its own period, so retuning the bands
  later doesn't move existing satellites.
- **Orbits:** `src/lib/orbit.ts`, shared by server and browser: three bands
  with jitter, period growing with radius^1.5 within a band, the station at
  the top with a ±12° overhead window.
- **Launch rules:** `src/lib/launch.ts` (callsign ≤16, beacon ≤60, no links,
  small blocklist that also catches "sh1t"-style swaps); one live satellite
  per person and the 10-minute cooldown, checked and inserted in one
  transaction.
- **Launchpad (`/`):** the form posts to itself and works without JS (303
  to the sky, or 422 with reasons and the answers kept). With JS it asks for
  JSON, plays the rocket lifting and the ground falling away, then goes to
  the sky. Reduced motion skips the animation.
- **Sky (`/sky/`):** a polar chart on canvas, drawn from the orbits and the
  server clock; an "Over the station" panel showing beacons as satellites
  pass (and who's next); a server-rendered "In orbit" table so the page
  works without JS. SSE `hello` (server time + snapshot, `mine` flagged per
  viewer, owner ids never sent) then `launch` events.

Visual check at 1920×1080 and iPhone 14 caught two bugs: rows the script
rebuilt lost Astro's scoped styles (no colour swatches, misaligned), fixed by
making the sky page's styles global under `.sky-page`; and on mobile the
rocket overlapped the intro text, fixed with a gutter.

Advay asked to record **Three.js** for the striking visuals: noted in
`PLAN.md` as a later decision (week 12 or sooner), needing its own ADR since
it pulls against the reasons for choosing 2D.

## 2026-10-04 — Adversarial review of the C8 slice, and fixes

A fresh Sonnet reviewer attacked the uncommitted slice against the C8 spec
and the ADRs, using curl against the running build. What it found and what
changed:

- **Every launch would 403 on Fly** (the worst one). Fly terminates TLS, so
  Astro saw `http://` while the browser's Origin said `https://`, and Astro's
  same-origin check refused the form. Local tests couldn't catch it. Fixed
  with `security.allowedDomains` (`*.fly.dev`, localhost) so the forwarded
  protocol is trusted. New tests: a launch through a simulated TLS proxy
  succeeds, and a cross-site post still gets a 403.
- **The blocklist refused "the sky shines tonight"** (and "Sky Station",
  "grape", "therapist"), because it squashed out spaces and matched
  substrings, and "kys" sits inside "sky". Now it matches per word, with
  common endings, plus a few slurs matched anywhere, plus runs of spaced
  letters. The error now says a word was the problem. New tests check that
  ordinary words pass.
- **The link rule was a TLD allowlist** ("evil.ru" got through). Now any
  name.tld, scheme, "www." or "(dot)"/"bit . ly" dodge is refused.
- **Migrations ran on the first request, not at boot** (the db module
  loads lazily). Moved them to `scripts/migrate.mjs`, run before the server
  in `pnpm start`, `pnpm dev` and the Dockerfile `CMD`. Also added a partial
  unique index so the database itself holds the one-live-satellite rule.
- **Error paths:** one broken stream could fail a launch that had already
  saved (each listener is now isolated); an EventSource closed by a 502
  never retried (now reconnects); an unreadable form body caused a 500 (now
  400); a non-JSON refusal showed "couldn't reach the launchpad".
- **UX:** your own satellite's next pass over the station is now shown
  ("next over the station in 2 min 10 s"); the "in orbit" notice sits above
  the chart on mobile; JS-path field errors are tied to their fields for
  screen readers; the form goes inert during the animation; the pulse
  respects reduced motion; personalised pages get `Cache-Control: private,
  no-store`; the chart labels only your own satellite (overhead labels
  collided in a crowded sky; the station panel names them).
- **Tests:** added a returning visitor (still yours, pad closed, no new
  cookie), person ids never in the HTML, beacon markup escaped. Streams now
  close in `finally`. 37 tests, all green.

Left for Advay to decide: whether the catalogue should show every beacon
all the time (the reviewer argued it undercuts "be seen when overhead"), and
whether to add a global cap or rate limit on launches (nothing dies in C8, so
the sky only grows). Deferred: RTT-corrected clock offset, orbit unit tests,
a README layout for `/readme/`.

Decided both open review points:
- **Catalogue shows callsigns only**; beacons are heard only at the station,
  keeping the low-orbit trade-off meaningful. Test changed first (the row must
  name the satellite without its beacon), watched it fail, then dropped the
  column. Without JS you see who's up but hear no beacons, which is accepted.
- **Sky cap of 200 live satellites** (`SKY_CAP`, overridable by env). The
  launchpad says when the sky is full and disables the form. No spec test,
  because filling the shared sky would break the parallel spec files running
  against the same app. Verified by hand instead: with `SKY_CAP=3` on a
  scratch DB, launches 1–3 gave 303, the 4th gave 422 "The sky is full", and
  the pad showed the notice.

## 2026-10-04 — C8 slice committed; README first draft

Committed the slice as `4be85b1`. Then, at my request, the agent drafted the
first `README.md` (about 590 words), even though the brief says to write it
myself, so it's a starting point to rewrite. It argues "good" from the
commons (Kessler and Cour-Palais 1978, Hardin 1968, Ostrom 1990) as four
points, lists which claims `spec/` enforces and which are judged (and how),
and what I chose not to build. `/readme/` now uses the site layout. Still to
do: rewrite it in my own voice, check the sources against what I've actually
read, and add the small-web reading the brief asks for.

## 2026-10-04 — Small-scale reading for the README

The README draft only cited subject sources (Kessler, Hardin, Ostrom); the
brief also wants reading on what good means at small scale. Had the agent
fetch four candidates and summarise them in `notes/reading.md`: Shirky's
"Situated Software" (the best fit: visibility doing the work enforcement
would, like Kessler's lineage), Kazemi's *Run Your Own Social* (limits make
small spaces work), Sloan's home-cooked app and Appleton's barefoot
developers (more for `PROCESS.md`). I'll read them before citing any.

## 2026-10-05 — C9: the sky redrawn as a horizon view (Three.js)

Started branch `C9`. I sketched a new sky view: the planet's limb along the
bottom, a realistic star background, the bands (high, medium, low) stacked over
the horizon, a satellite crossing with a trail and its name, and the "Over the
station" panel floating top-left. The agent asked four questions first. I
chose the horizon window (only the arc around the station is in view), a
stylised night Earth over a textured one, labels on every satellite but hidden
when they crowd, and the catalogue below the scene.

What was built (`src/scripts/scene.ts`, ADR 0005, proposed):

- Three.js with an **orthographic camera**, so the sim stays the flat 2D chart
  of `orbit.ts`; only the drawing changed. The planet is drawn six chart units
  across while orbits keep their heights, so the bands sit close over a gently
  curved horizon. The view is mirrored so satellites cross left to right.
- A dark sphere with a rim glow, the green **airglow** line seen in photos
  from orbit, and coastlines baked from Natural Earth around the station,
  which now sits on Canberra (`scripts/coastline.mjs`, about 48 kB gzipped).
- About 34,000 seeded stars with spectral colours and a steep brightness
  falloff, plus a faint Milky Way band, thinned on zoomed-out phone views.
- Satellites as glow points with tapering trails, amber while over the
  station; the station's window is an amber wedge. Labels are HTML, placed
  greedily (yours first, then those overhead) so they never overlap.
- Your satellite, when it's out of view, gets a "‹ CALLSIGN rises in 41 s"
  pointer at the left edge.
- Three.js loads as its own chunk after the page works (about 185 kB gzipped).
  Without WebGL, or if the chunk fails to load, the page says so; the panel and
  the catalogue never depend on it.

![The sky as a horizon view: the limb and airglow, the three bands, satellites crossing with trails, the station's wedge and the panel over the scene](screenshots/2026-10-05-sky-horizon-view.png)

Bugs found while checking it in Chrome: the trails didn't draw (Three.js
culled the dynamic geometry by stale bounds, then back-face culled the
ribbon), the glow sprites had square edges, and on a phone the Earth filled
60% of the scene with stars five times denser than on desktop.

**Adversarial review** (fresh Sonnet agent). Real bugs it found, all fixed:

- an **empty sky threw on every frame** and left the canvas blank (the
  buffers were only made once there was a satellite). Checked on a fresh
  database: now draws.
- your satellite could **vanish with no pointer** while it was behind the
  planet, since the "in view" test checked only x;
- **no fallback if the scene chunk failed to load** (an unhandled rejection
  and a blank canvas);
- the **floating panel hid labels and the pointer** where satellites rise.
  Labels and the pointer now keep clear of it.

Also took its performance points: the loop pauses when the scene is scrolled
away, there are no per-frame allocations in the hot loops, DOM writes happen
only on change, old GPU buffers are freed, the pixel ratio is re-read on
resize, and labels flip left at the right-hand edge and re-measure after the
webfont loads.

Left as judgement calls for me: a **sparse sky can look empty** (only about
7–15% of each orbit is in view, so with a few satellites the scene is often
bare); and the pointer's "rises in" counts to the view's edge while the panel
counts to the station's window, so they differ by a few seconds. Checks green
(typecheck, 37 specs). Uncommitted.
