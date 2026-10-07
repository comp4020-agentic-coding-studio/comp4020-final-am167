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
station" panel floating top-left.

![My sketch for the C9 sky: the limb at the bottom, "realistic star background", high/medium/low bands on the right, one example satellite with a trail, and the "Over the Station" panel top-left](screenshots/2026-10-05-sky-horizon-sketch.png)

The agent asked four questions first. I
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
(typecheck, 37 specs). Committed as `f8f7003` on branch `C9`.

## 2026-10-05 — C9: zooming out to the whole planet

Asked what in the horizon view needed my review, the agent raised that most
collisions in C9 would happen out of view, and that the "Some Light" trails
are mostly off screen too. I chose a zoomed-out view to answer both.

A "See the whole sky" button zooms out; "Back to the station" zooms in. The
planet shrinks from six chart units to the chart's own size while every orbit
keeps its height above the surface, so it's one continuous move rather than a
cut, and the camera's size is scaled geometrically so the zoom feels steady.
The stars moved to their own camera, which at first stayed still while the
planet zoomed; I didn't like the static background during the transition, so
the stars now follow the zoom half as far as the planet does (parallax), like
a far-off sky. Bands, the airglow and the station's
wedge became shaders drawn by height above the planet, so they follow it as it
shrinks. The coastline bake now covers the whole near hemisphere (coarser
outside the station's region; 68 kB gzipped). Reduced motion jumps straight to
the other view.

![Zoomed out: the whole planet, every orbit and trail in view, the station's wedge at the top](screenshots/2026-10-05-sky-whole-planet.png)

Fixed after checking it in Chrome: zoomed out, the airglow became a thick
halo around the small planet (it now thins with the planet's size), the band
names piled up on top of each other on a phone (they fade out as you zoom
out), and the zoom button hid a label on mobile (labels now keep clear of it).
ADR 0005 (still proposed) now records the zoom.

The zoom-out above was committed as `9cc3927`.

## 2026-10-05 — Soft band edges

Before starting collisions, I asked for randomness in the low/mid/high
boundaries: zoomed out, the satellites sat in three neat rings with clean
gaps. Now a launch's radius comes from a bell curve around the band's middle
(Box–Muller, cut off and redrawn outside the band's reach), so most land
mid-band and about one in eight strays past the band's edges. The reach stops
short of the neighbouring bands, so a launch never lands in the band next door.
That matters for collisions next: in a flat sky of circular orbits, two
objects can only meet if their radii nearly match.

Test first (`spec/orbit.test.ts`, the first pure unit test): with a seeded
random source, 70–97% of launches land inside the band, some on each side of
it, none outside the reach, the bands' reaches don't overlap, and a higher
orbit still has a longer period. It failed (100% inside, no `bandReach`),
then passed. The drawn bands went from a faint fill with hairline edges to a
soft glow following the same curve; my first glow was too faint to see in
Chrome, so it was brightened. Checks green (45 tests).

Soft band edges committed as `baf5342`.

## 2026-10-05 — The table leaves the sky page

I didn't like the big table under the sky: too much scrolling, and debris in
C9 would make it far longer. The agent offered three layouts (a summary on
the sky page with the full catalogue on its own page, a drawer over the
scene, or tabs in the station panel); I chose the first.

- **`/sky/`** now ends with a "Sky now" card under "Over the station":
  the total, counts per band, the six latest launches (newest first, kept live
  over the stream) and links to the catalogue and the launchpad. On desktop
  the page is exactly one screen; a crowded pass scrolls inside the station
  panel instead of pushing the card down.
- **`/catalogue/`** is the full record: callsign, band, launched and status,
  in orbit or everything ever launched, picked by a plain link so it works
  without JavaScript. It's in the site nav, and ready for debris rows.

Tests first: new `spec/sky.test.ts` (counts per band match the page's own
sky data, the latest launches are newest first and carry no beacons, the
sky page has no table and links to the catalogue; the catalogue lists and
marks yours, and has the "everything" view). The C8 specs that read the
sky page's table rows now read the catalogue's; the person-id check covers
both pages. Seven failed for the expected reasons, then all 50 passed. Fixed
after checking in Chrome: the counts line ran together ("orbit:Low 51 ·Mid"),
now three small tiles, and the desktop page scrolled 4px past the screen.

## 2026-10-05 — A station panel that holds still

Reviewing that in the browser, I found two things jarring: "Over the station"
grew and shrank every time a satellite rose or set (it scrolled inside up to
16rem, and the card below jumped with it), and after a launch the "in orbit"
notice pushed the Sky now card off the bottom of the screen.

- The station panel is now a **fixed height**: three beacon slots (callsign
  plus at most two lines of beacon), a small "N overhead" line, and a
  reserved line for yours. With more than three overhead it **pages** through
  them every 4s ("4–6 of 9 overhead"), sorted by id so pages don't reshuffle,
  and each new page fades in. Measured in Chrome over twelve seconds of
  paging: the panel stayed at exactly 304px (366px with yours).
- The launched notice is a **toast** over the top of the scene, so it never
  moves the panels; it fades after 6s. On a phone it stays in the page flow.
- On shorter desktop screens the Sky now card gives things up rather than
  overflow: latest launches cut to three below 56rem tall, gone below 46rem,
  band tiles gone below 40rem. No page scroll at 1920×1080, 1440×800 (with
  the toast) or 1280×680; on an iPhone 14 the panels stack under the scene as
  before.

No new spec: this is layout, which the HTTP suite can't see. Checks green
(50 tests).

Catalogue page, Sky now card and the steady station panel committed as
`455789e`.

## 2026-10-05 — The launchpad fits a laptop screen

On my laptop the launchpad scrolled: the Launch button sat below the fold.
Measured in Chrome, the page was 919px tall at every laptop size, because the
form ran 727px plus a 5rem bottom margin.

- Each altitude is now two lines: the name with how often it passes ("over
  the station every 3 minutes") on the right, then its note. This was 292px of
  bands, now 235px.
- Tighter spacing in the form, a 1.5rem bottom margin, and top padding that
  scales with the screen's height, not its width.
- Below 46rem tall, each band drops its note and keeps the pass time, so it
  still fits at 1280×680.
- The rocket is capped to the room between the intro and the ground. Once the
  page was exactly one screen, it ran into the "Nobody owns the sky" line.

No scroll at 1920×1080, 1512×860, 1536×770, 1440×800, 1280×720 or 1280×680,
and the rocket's top stays below the text at each. The phone layout is
unchanged and scrolls as before. Layout only, so no new spec; checks green
(50 tests).

## 2026-10-06 — Future work: collisions between messages

Advay wants colliding messages to mean something: right now two beacons
collide by orbit alone and share nothing. Added "Collisions that mean
something" to `PLAN.md` as open future work, with four directions (the wreck
keeps words from both beacons, the collision shown as a couplet, seeing your
band's beacons before you write, and aiming a "reply" launch, probably
rejected as it makes debris intentional), plus the questions to settle first.
It touches the debris data model, so it's flagged to decide before C9's debris
table.

## 2026-10-06 — Future work: a purpose

The app had an incentive (be seen) but no goal and nothing shared to lose.
Brainstormed four ideas with Advay; three went into `PLAN.md` under "A
purpose" as future work he wants to think over: a "heard by" count as each
satellite's score, debris taking the station's airtime as static, and a
question from the station that beacons answer (which also gives colliding
messages a connection). The fourth, a shared sky-health number on every
screen, was left out for now.

## 2026-10-06 — Future work: explain Kessler syndrome

Advay found that people don't know what Kessler syndrome means, so the name
and the argument don't land. Added a plain-language explainer page (e.g.
`/kessler/`) to "Later" in `PLAN.md`: what it is, the real cases, the
commons angle and how the app's mechanics map onto it, linked from the
launchpad and the sky. Not scheduled yet.

## 2026-10-06 — The launchpad in Three.js, and a launch that becomes the sky

I liked the launchpad's layout but wanted it more striking, and the launch
more realistic. The SVG rocket is now a Three.js scene behind the unchanged
form (ADR 0006, proposed).

![The launchpad before: an SVG rocket and a flat dusk gradient](screenshots/2026-10-06-launchpad-before.png)

![After: a lit rocket by its tower under two searchlights, hills against the afterglow](screenshots/2026-10-06-launchpad-three.png)

- **The scene** (`src/scripts/launchpad.ts`): dusk at the pad, with a lit
  rocket, a lattice tower with umbilical arms and red warning lights, two
  searchlights, ridges of hills fading into the haze, thin cloud and the same
  stars as the sky page (now shared through `src/scripts/starfield.ts`). It's
  framed from the page's own layout: between the intro and the form on a
  desktop, in the gutter beside the intro on a phone, standing on a horizon
  just above the form.
- **The launch**, about seven seconds: ignition and a ground cloud thrown out
  sideways by the flame trench, the arms swinging back, liftoff with camera
  shake, a gravity turn eastward (left to right, the way satellites cross the
  sky page), and a plume that lights up blue-white once it climbs into
  sunlight the ground can't see. The pad sits on top of a planet, so the
  camera pulls back until the ground is the planet's limb, like the sky
  page's view, then fades to the sky page's dark, and the sky page's canvas
  fades in from it. A readout shows the callsign, the band, T+, altitude and
  speed. Skip button and Escape.
- No JavaScript: the form posts as before. No WebGL, or the scene stops: the
  SVG rocket and its CSS launch come back. Reduced motion: a still scene, and
  a launch goes straight to the sky.
- Three.js is its own chunk, shared with the sky page, so it's cached by the
  time the launch arrives there.

![The launch from ignition to the view of the limb](screenshots/2026-10-06-launch-sequence.png)

Fixed while checking it in Chrome: the rocket drew at its minimum size (I
measured the intro's grid cell, which stretches to the form's height, not its
text); puffs of smoke thrown at the camera filled the screen as overexposed
squares (now thrown sideways, faded near the camera, and round to the
sprite's edge); a teal flood across the sky as the camera rose through the
atmosphere's shell (the limb glow now only counts lines of sight that dip
below the horizontal); and on a phone the rocket left the frame during the
pull-back (the camera follows it longer, and the end shot turns towards its
arc). The dev server also served a stale page script until the file was
touched.

**Adversarial review** (a fresh Sonnet agent, on the diff). Acted on:
- A shader failure or a lost WebGL context mid-launch could leave a blank,
  inert page. The scene now stops, hands back to the SVG rocket, and the
  launch still ends; the page goes to the sky after ten seconds whatever
  happens.
- The launch clock ran on wall time, so a background tab skipped to the end;
  it now advances with the frames drawn.
- Escape and Skip could navigate twice; focus is moved to Skip when the
  launch starts; the screen-reader status is set after the form goes inert.
- Phone cost: the two spheres drop from 384×192 to 192×96 segments, the
  ground's noise is skipped once the camera is in orbit, the idle scene
  draws at 30 fps, the layout is measured on scroll and resize instead of
  every frame, and point sizes respect the GPU's limit.
- The SVG rocket now fades out as the canvas fades in, not before.
- Contrast: the intro text sits over the bright afterglow on a phone, so it
  has a soft dark haze behind it as well as a text shadow; the dim paragraph
  measures about 5:1 against what's behind it.

Visuals only, so no new spec. Checks green against a fresh production build
(50 tests), checked at 1920×1080, 1440×800, 1536×770, 1280×680 and iPhone 14.

## 2026-10-06 — Assignment 1's performance harness, carried over

Commit `d06ee96`.

Worried that two Three.js scenes (the launchpad and the sky) would perform
badly, especially on a phone, I asked for assignment 1's performance harness
to be carried over and made to work here, without running the full suite
yet. The harness was the part of assignment 1 that taught me to distrust a
smooth frame rate: a vsync-clamped 60 or 120 fps hides whether a frame used
a tenth of the GPU or all of it, and assignment 1's PR #20 drew a false
conclusion from exactly that.

What carried over unchanged: the report maths (`scripts/performance/report.ts`,
with its tests), Chrome driven through `playwright-core`, the three named
profiles (marking desktop, a throttled phone, a throttled laptop), the
long-task, layout-shift and frame-miss sampling, the blank-page refresh
calibration, and the GPU saturation probe that raises the drawing buffer until
frames miss vsync and fits cost from those points only.

What had to change, because this is a different kind of app:
- **A server, not a folder.** Assignment 1 served `dist/` statically. Kessler
  is server-rendered with a database, so the runner starts the built server
  itself on a free port and a throwaway SQLite file, as the Dockerfile runs it
  (production bundles, not the dev server). It never touches `data/app.db` or
  the running app. Pointed at a deployed sky (`PERF_URL`), it launches nothing.
- **A crowded sky.** The sky's per-frame cost (points, trails, label
  placement) grows with what's in orbit, so the runner seeds 150 satellites,
  one cookieless visitor each, since the server allows one live satellite per
  person.
- **Two scenes, and a real launch.** The in-page probe now names which scene
  it is attached to, and hooks into both `launchpad.ts` and `scene.ts`. The
  phases are the app's own: the launchpad idling behind the form, the launch
  sampled frame by frame from ignition until the page fades to the sky, then
  the sky's station view, zoom out, whole sky, and scrolled away.
- **No fixed pixel cap.** Assignment 1 capped its globe at 1.25 Mpx and
  predicted GPU cost there; neither scene here caps beyond a device pixel ratio
  of 2, so cost is predicted at the buffer each profile actually allocated.
- **The launchpad's 30 fps idle throttle** would read as a saturated GPU
  (a steady 33 ms frame), so the GPU probe lifts it while measuring.
- **Budgets for a lazy scene.** The fast layer now checks `dist/client` byte
  budgets per chunk, and that three.js is never in a page script's static
  import graph: both pages are meant to work before the scene arrives.

First smoke run (desktop profile only, headless, M4): no frame misses or long
tasks in any phase with 150 satellites; the launchpad idles at 30 renders/s
as designed. The first GPU ladder (to 20 Mpx, assignment 1's) never saturated
either scene, so there was no slope at all: these scenes are much cheaper than
assignment 1's procedural planet. Extending it to 36 Mpx gave the sky a fit
(0.85 ms/Mpx) but only from two points, which always shows R² 1.000, so the
suite now flags a fit that thin rather than letting it look authoritative. The
launchpad still didn't saturate twice. One run also flagged 432 ms of blocking
time loading the sky on desktop, which didn't recur on the second run; a
lead for when the full suite is run, not a conclusion. Chrome 154 headless
also calibrated at 60 Hz where assignment 1's runs saw 120 Hz, which matters
when comparing reports across the two projects.

## 2026-10-06 — A page explaining Kessler syndrome

Built the explainer from `PLAN.md` at `/kessler/` (`src/pages/kessler/`),
server-rendered so it reads the same without JavaScript:

- **What it is** in plain words, with a three-step diagram (two satellites on
  crossing orbits around a small Earth, the burst where they meet, then the
  fragments on orbits of their own hitting a third). The diagram is SVG worked
  out at build time, so the collisions sit exactly where the orbits cross.
- **Why it doesn't clear:** drag times by altitude (NASA's debris FAQ), and
  Kessler and Cour-Palais (1978).
- **The real cases:** Fengyun-1C (2007) and Iridium 33 / Kosmos-2251 (2009),
  from NASA's *Orbital Debris Quarterly News* for each, plus ESA's 2025
  figures (about 40,000 tracked, more than 1.2 million over a centimetre, and
  debris growing even with no more launches).
- **The commons:** Hardin, the FCC's 2022 five-year rule and how little of
  the sky it reaches, and Ostrom.
- **How this sky plays it:** a table mapping real orbit onto the app, with
  collisions, decay, deorbiting and debris lineage tagged "not built yet",
  since none of them exist yet. The band times come from `BANDS`, so they
  can't drift from the launchpad's.
- **Linked** from a new "Kessler syndrome" nav item (the nav now wraps on a
  phone), the launchpad's intro and the sky's "Sky now" card.

Every figure was checked against its source before it went on the page.
Test first: `spec/kessler.test.ts` (the page answers, names the two cases and
the 1978 paper, links back to the sky and the launchpad, and both of those
link to it in their content). All five failed (a 404 and no links), then
passed.

**Adversarial review** (a fresh Sonnet agent, against the plan, the sources
and the running build). Acted on:
- **The diagram's "crossing" orbits only touched.** The first draft had two
  arcs meeting tangentially, with no planet and no direction of travel. Redrawn as
  tilted ellipses around an Earth, with trails on the satellites.
- **Overclaims.** "It has already started" (neither case set off a runaway)
  became "The debris is already up there", with a line saying so. "Run on the
  same logic" became an honest account: the app has the incentive half of the
  dilemma (crowding low gets you heard) and none of the cost yet.
- **Sources stretched.** Kessler 1978 said a belt "could begin to form within
  this century" and that launch limits could delay it, not "within decades".
  The FCC rule covers only satellites launched after 29 September 2024, and
  25 years was a guideline, not an FCC rule. "Switched off since 1995" and
  "nobody aimed either" weren't in the cited source, so they're gone. The
  drag times were unsourced (now NASA's FAQ). Ostrom was reduced to
  monitoring (now also own limits and answering to each other).
- **Plain language and accessibility:** the page now says why the app is
  called Kessler; "In Kessler" became "In this sky", so it can't be read as
  the syndrome; the diagrams are hidden from screen readers (their numbered
  captions carry the meaning); the phone table labels both halves of each
  pair; the catalogue row was split so built and unbuilt aren't in one cell.
- **The launchpad link explained nothing**, so its line now says what the
  term means: "in a crowded orbit one collision can set off the next: Kessler
  syndrome". That was an open question in the plan; it's there for me to
  keep or cut.

Left: the nav label stays "Kessler syndrome" (the reviewer suggested "What is
Kessler?"), and the mobile table loses table semantics in Safari once it's
display:block, accepted for now.

Checked in Chrome at 1920×1080 and iPhone 14. The launchpad still doesn't
scroll at 1920×1080, 1536×770, 1440×800, 1280×720 or 1280×680 with its
longer line, and the sky page is still one screen at 1920×1080. Checks green
(55 tests).

Then I found the launchpad's in-sentence link too easy to miss, twice over. It
is now a card of its own under the intro: "New here?" above a large amber
"What is Kessler syndrome? →", with a dark backing and a soft glow so it
reads over the afterglow on a phone. The intro's line keeps the one-line
explanation ("in a crowded orbit one collision can set off the next"). Still
no scroll at any of the laptop sizes above.

## 2026-10-06 — Orbital decay, and burning up on re-entry

Committed as `fb51cae` (everything below, including the review's fixes, the
catalogue heights and the shorter decay), pushed to `C9`.

Worked on branch `C9` (fast-forwarded to `main` first). Advay asked for
orbital decay: everything slowly loses height and burns up, with bands as
ranges rather than fixed shelves, and a re-entry that looks real.

**The model (ADR 0007, proposed).** Positions had to stay a pure function of
the stored orbit and the server's clock (ADR 0004), so decay is a law with a
closed-form answer rather than stepped drag or periodic re-saves:
- One period for every height (`periodAt`), fitted so the low band's middle
  still comes round once a minute and the high's every eight. Before, each
  band had its own law, so a high satellite that fell into the low band
  would have crawled past the low ones. Mid moves from 3 to 2.7 minutes.
- radius^6 falls at one steady rate, so orbits fall slowly, then faster.
  From the low band's middle an orbit lasts a day, the mid's about 8 days,
  the high's about two months. The angle integrates in closed form.
- At 1.06 planet radii a scripted 30-second plunge: it dives, slows hard
  (angular speed ∝ (1 − 0.85s)³) and has burned away at 1.005.
- Bands are ranges meeting at 1.5 and 2.05 (`bandAt`); the sky page counts
  objects by where they are now.

Test first: `spec/decay.test.ts` (13 tests: continuity at the epoch and into
the plunge, monotone fall, lifetimes per band, speeding up as it falls, the
plunge's length, contiguous band ranges, a high orbit drifting through mid
and low). All failed on missing functions, then passed. HTTP tests added:
the launchpad shows each band's lifetime, the sky's band counts follow
current height, `/kessler/` no longer marks decay "not built yet".

**Server.** `settleDecay()` in `src/lib/sky.ts` runs before every read of the
sky and on a timer set for the next burn-up: live rows past their burn-up
become `decayed`, dated to the burn-up itself, and a `decay` event goes out.
A stopped server catches up on its first request. Checked by hand: demo
satellites inserted to burn within seconds were marked with the right
`fate_at`, and the `decay` event arrived on `/api/events`.

**Client.** Every page works out burn-ups itself, so all screens see the same
moment; the event only confirms. A burned object stays 8 s while its wake
fades. "Sky now" says what's burning or burned up last (most happen out of
the station's view); your own satellite's line says when it burns up. The
launchpad's band choices say how long each lasts. Catalogue fate reads
"Burned up".

**The re-entry** (`src/scripts/reentry.ts`), modelled on photos of real
re-entries (ATV-1, Starlink and rocket stages over the Americas, Soyuz from
the ISS): a hot head with a bow-shock glow and a white point, a wake cooling
white → orange → red that billows as it ages, a faint green train, a breakup
into a string of fragments that fall behind (seeded by the object's id, so
every screen sees the same one), sparks shed behind, and flares as pieces
burn out. A satellite glows red in the last few minutes before its plunge.
The bands were redrawn as contiguous washes with soft lines where they meet.

How it got there, checked with frozen-clock screenshots (overriding the
page's clock to exact moments of the plunge) and recordings:
- First pass blew out to a white blob with a lavender halo. Two causes: the
  colours were sRGB-ish values going through three.js's linear→sRGB
  conversion, and pure additive blending over the bright blue haze. Fixed
  with a linear-light blackbody ramp and premultiplied blending, so the fire
  partly hides the haze behind it and stays orange.
- The burn sat inside the bright green airglow line and got lost; the plunge
  was lowered (1.06 → 1.005) to burn in the haze just above the limb.
- At first the plunge swept 120° in 30 s, crossing the view in a few
  seconds; the angular speed now falls as a cube, so it streaks in fast and
  lingers while brightest.
- Fragments bunched at the head; their lag was raised so they string out
  behind. Late in the plunge their ribbons drew vertical smears (their
  heading came from their own slow sinking); headings now follow the orbit.

![A satellite burning up over the station: the fireball and its cooling wake (top), then breaking up as it slows (bottom)](screenshots/2026-10-06-reentry.png)

Checked at 1920×1080 (horizon and whole-sky views) and iPhone 14; the
launchpad still doesn't scroll at 1920×1080, 1280×720 or 1440×800. Checks
green against a fresh production build (70 tests).

**Adversarial review** (a fresh Sonnet agent, code read and numeric checks
of the maths). No bug in the core maths: radius and angle are continuous
through the burn. Acted on:
- **The lifetimes were only true at a band's middle.** A launch lands
  anywhere in its band's reach, so a low launch can burn up in 5 hours under
  a page that said "about a day". The launchpad now shows each band's spread
  (`lifetimeRange`: 5 hours to 2 days, 3 to 18 days, 3 weeks to 4 months),
  as do `/kessler/`, the ADR and the plan. Test first: the launchpad test
  asked for the spreads and failed on "about a day".
- **Pass countdowns ignored the burn-up.** "Next over the station in 3 min.
  It burns up in 1 min" for a satellite that never gets there. Countdowns
  now return nothing when the burn-up comes first, and say so ("burns up
  before it next reaches the station", "burns up before it rises").
- **One remembered burn-up.** Two burn-ups close together could leave your
  satellite's line stale. Burn-ups are now kept by id; the latest and your
  own are looked up from them.
- **The server's marking was untested.** `spec/decay-server.test.ts` drives
  `settleDecay` against a throwaway database with the clock passed in:
  marked `decayed` at the burn-up's time with a `decay` event, once only,
  caught up on the next read after a quiet spell, and the cooldown counted
  from the burn-up (passed first time: regression cover).
- **Reconnecting cut a burn-up short**: the snapshot replaced the whole sky.
  It now keeps what's burned up but still fading.
- **"Sky now" was usually empty** between burn-ups; it now says what burns
  up next ("Next to burn up: X, in 5 h"). Your satellite's line links back to
  the pad once it's gone; the catalogue says what "Burned up" means.
- `periodNow` grew for an orbit starting below the burn radius (unreachable
  by launch, fixed anyway, with a test); each settle reads the sky once, not
  twice.

Left, and written into ADR 0007: nobody can see a burn-up on demand (the
shortest lifetime is hours, one satellite each), so "something happens
within ten minutes" falls to collisions; catch-up runs on the first request
after a restart rather than at boot; and the dive's radial speed jumps at the
plunge's start (position is continuous; no kink was visible in recordings).

**Heights in the catalogue** (Advay's ask: "so we can see them slowly go
down"). A Height column with each live object's height in km and how fast
it's falling ("590.22 km ↓ 13 km/h"), ticking once a second from the orbit
and the server's clock; "—" once burned up. The km scale (2,000 km per
planet radius, ADR 0007) puts the burn-up at 120 km, where real re-entries
begin, and the low band at 400–800 km. Test first: the catalogue test asked
for the column and a height inside the low band's reach, and `heightKm` /
`fallRate` got unit tests; all failed, then passed. Two decimals so a low
orbit visibly drops every few seconds. On a phone the table overflowed:
the Band column now drops (the height says where it is), the rate sits
under the height, and the status time is hidden. That last rule never
worked (`td time:not(:first-child)` matched nothing in the Status cell) and
only showed once something had burned up; it's a class now. Checked at
1920×1080 and iPhone 14 (no horizontal scroll).

Advay asked to note "seeing a burn-up on demand" for later: in `PLAN.md`.

**Decay shortened** (Advay: "high should get only a few days max"). The first
rates (radius^6, a day from the low band's middle) let a high launch last up
to four months. Now radius³ falls at a steady rate and the low band's middle
lasts 4 hours: low 1 to 8 hours, mid 9 to 27 hours, high 31 hours to 3 days.
radius³ was picked over radius² because it keeps three distinct tiers and
still speeds up as it falls (about 1.5× faster near the air than at the low
band). Tests first: the lifetime test now asks for hours / about a day / a
few days at most, and that no launch lasts past 3.5 days; it failed, then
passed. The fall-rate test's "10× faster low than high" pinned the old law;
the contract is only "faster the lower it is". The launchpad and
`/kessler/` read the spreads from the code, so only their tests changed.
A side effect: a low satellite now drops about 100 km an hour, so the
catalogue's heights visibly fall within seconds.

Advay also asked to shelve **boosting a satellite** (raising your own orbit
to stay up longer) for later: in `PLAN.md`.

## 2026-10-06 — C9: planning collisions and login

Advay wanted to start collisions for C9 and add a login, to track who
launched what and who to blame, but wasn't sure how collisions could work.
The agent read the orbit maths and found the snag: the chart's orbits are
flat circles whose period depends only on height, so two objects going the
same way at the same height never close in, and decay (radius³ falling at
one rate for all) keeps the gap between any two objects fixed. As built,
almost nothing would ever collide. Options it gave: a bigger hit distance on
the current model (rare, slow overtakes), mixed directions (head-on crossings
twice a lap), or hidden 3D inclinations (rendering rewrite).

Decided with Advay (now in `PLAN.md`): **mixed directions plus a little
same-direction near-miss**; the server predicts hits ahead and broadcasts the
impact time so every screen draws it at once; restart catch-up runs the hit
queue forward; **seed derelicts** so a quiet sky still collides; **optional
login** (claim a unique operator handle with a passphrase on top of the
anonymous cookie, superseding ADR 0002); blame worked out from lineage;
**C9 scope is collisions + login**, with dodging moved to C10. Details still
open are listed under "Open questions"; decision records come once they're
settled. Checked the C9 spec first: it asks for one written decision about
several people acting at once, which still has to be picked now that dodging
(the obvious candidate) moved out.

Second round, same day: the C9 written decision is **who sees the blame**
(dodging, the first candidate, moved to C10); the server picks each orbit's
direction at random (retrograde gives no airtime, so a free choice would be
a trap); signing in on a device with its own live satellite merges it into
the operator's record; a collision shows both beacons as a couplet, with
fragments carrying words left for later (a nullable column, so deferring is
cheap). Derelict count, fragments per hit, the live cap and debris decay are
to be tuned with the sim running.

## 2026-10-06 — C9: collisions on the server (branch `C9`)

Advay asked to keep the C9 work on the `C9` branch, so it moved into the
existing `.claude/worktrees/C9` worktree (CLAUDE.md says `main`; his
instruction wins). Wrote ADRs 0008 (collisions predicted in closed form),
0009 (an operator you can claim; supersedes 0002) and 0010 (every screen
names who caused a collision: the C9 "several people at once" decision), all
proposed.

Built test-first: `spec/collision.test.ts` (the maths: direction, when two
orbits meet, fragments from a seed) and `spec/collision-server.test.ts`
(announced ahead, applied at its time, fragments tracing back, and a
stopped server ending with the same sky as one that ran through a cascade).
Orbits gained a direction (`turnedAt`, the unwrapped angle); the server
predicts each pair's meeting once, keeps a schedule, announces
`conjunction` events and applies `collision` events. Migration
`0001_collisions` adds the `collisions` table, `direction` and
`source_collision`.

The interesting part was tuning, with a throwaway harness simulating a day:

- First version: any two objects inside the hit distance were certain to
  meet within half a lap. One collision's six fragments in a thin shell set
  off the next, and a 40-object test shell ran away to the 600-object cap
  within a minute, with thousands of collisions an hour that never stopped.
  The catch-up loop also re-sorted every pair per collision, so the test hung.
- Fixes, each found by the harness: debris is small (a fifth of a
  satellite's hit distance); each meeting is a chance (5% head-on), drawn
  once per pair so replays agree; fragments scatter widely in height; a
  fragment that hits something is pulverised (debris can't multiply on its
  own, so a cascade feeds on satellites and dies out when launches stop);
  the derelict baseline counts satellites and derelicts only and adds at
  most one every 10 minutes (the first version kept refilling derelicts into
  its own debris field and fed a permanent cascade).
- Result: a quiet sky holds a steady 5 to 15 collisions an hour with about
  a hundred objects up, no runaway, settling in milliseconds. Open trade-off
  for Advay: at that rate most satellites end in a collision within an hour
  or two rather than burning up.

`decay-server.test.ts` now turns derelicts off and seeds its launches, since
random satellites can now collide. The sky page's "latest launches" lists
people's satellites only. `pnpm check` green (101 tests). Committed as `41f32ef` on branch `C9`.

Advay chose **gentler** over deadly (asked with the simulated numbers): head-on
hit distance 0.012, 2% a meeting, lapping 0.015. A quiet sky now has 1 to 5
collisions an hour, satellites typically last 2 to 4 hours before a hit, and
about half burn up first; a visitor may wait 15 to 30 minutes for a
collision, which the conjunction warnings will have to carry.

## 2026-10-06 — C9: launch as often as once a minute; collisions scale with satellites

Two notes from Advay while the collision slice was going in: collisions
should scale up with the number of satellites, and the wait to launch
should be much shorter, because "the whole point is someone can send more
satellites to send more messages but increase the risk of ruining it for
all".

Scaling, measured with a harness holding K people's satellites up (each
relaunching as soon as allowed, under the old one-each rule): 0 or 5 people
give 1 to 4 collisions an hour, 20 give about 20, 50 about 130. So it scales
more than linearly, but only once people outnumber the derelict floor of 20,
which keeps a quiet sky's rate flat. The agent offered to lower the floor to
about 8; Advay kept 20.

The launch rule: the agent read "send more satellites" as several up at
once, which reverses "one live satellite each" (ADR 0002, 0009), and asked.
Advay chose **any number up, a minute apart** (over a per-person cap, or one
each with a shorter wait). Tests first: `spec/launch.test.ts` (a second
launch inside the gap is refused with "You can launch again in N s"; the pad
stays open, listing yours) and `spec/decay-server.test.ts` (two up at once
a gap apart; someone else isn't held up). Migration `0002_launch_gap` drops
the one-live unique index. The launchpad lists your satellites and counts
the gap down; the sky page's line follows whichever of yours reaches the
station next. ADR 0009 (still proposed) and the plan updated; the
`/kessler/` page's "one satellite each" line changed.

Measured with the new rule, people launching every two minutes: one person
alone takes the sky from about 2 collisions an hour to about 60, and three
take it to 160 with the sky at its 600-object cap. That's the argument made
literal, and also what three people can do to everyone else's evening (and
to a phone drawing 600 objects). Flagged for Advay: the gap may want to be
longer than a minute.

`README.md` still says "one live satellite each" in two places; left for
Advay, who is rewriting it in his own words. `pnpm check` green (102 tests).

Advay set the gap to **five minutes** after seeing those numbers. The wait
now reads "You can launch again in 4 min 05 s." Committed as `5cf1247`.

## 2026-10-06 — C9: collisions on the sky page and in the catalogue

The sky page now shows collisions as they happen, on every screen at the
same moment, since each one is predicted (ADR 0008): a pulsing amber ring
where two objects will meet over the last 30 seconds, then a flash and a
ring spreading out at the moment of impact. Both objects leave the scene at
once (the flash covers it); the server's `collision` event brings the
fragments. Debris draws as small grey points with faint trails, derelicts
dim, and only people's satellites are named. A card over the scene (under
it on a phone) tells the collision: what met, the two beacons side by side,
and who launched what (ADR 0010). "Sky now" counts satellites, derelicts
and fragments apart, and says what's coming ("Collision coming: SAT-12 and
debris, in 0:40") or what just happened.

![The whole sky zoomed out, mid-collision: the flash and its ring at the bottom of the low band, the news line and the card telling a debris-on-debris collision with every operator it traces back to](screenshots/2026-10-06-collision-flash-and-card.png)

The wording is its own module (`src/lib/story.ts`), tested in
`spec/story.test.ts`: "A and B collided" (never "A hit B"), "Debris from A
and B's collision destroyed C", and the blame line naming every operator at
the root ("unclaimed operator" until login exists). The server's collision
event now carries these parties, with debris traced back to its roots
(`spec/collision-server.test.ts`). The catalogue shows each fragment's
lineage and what each destroyed object met, and a new Collisions section
keeps the latest 50, told the same way.

Fixed on the way: several places assumed every orbit runs anticlockwise
(trails, the "rises in" pointer, the next-overhead countdown, the re-entry
breakup); a retrograde satellite now trails behind itself, rises on the
right, and its pointer sits at the right edge.

Checked in Chrome against a seeded sky (40 satellites crowded into one
shell, so collisions came every minute or two) at 1920x1080 and iPhone 14.
On the phone the card first covered half the scene, station included, so
it moved under the scene there; the catalogue's lineage broke callsigns at
their hyphens in the narrow column, so those hyphens are now non-breaking.
`pnpm check` green (110 tests).

## 2026-10-06 — C9: operators you can claim (login)

Built ADR 0009 test-first (`spec/operator.test.ts`, 11 tests over HTTP): no
sign-up to launch; claiming a handle keeps what you launched before; a
handle is taken whatever its case; bad handles and short passphrases are
refused with reasons; signing in on another device makes your satellites
yours there; a wrong passphrase and an unknown handle get the same answer;
the five-minute gap is per operator, not per device; signing out gives the
device a fresh anonymous cookie; no page shows a passphrase or a person id.

`src/lib/operators.ts` keeps operators (handle, scrypt hash and salt) and
which cookie is signed in as which operator; claiming or signing in moves
that cookie's anonymous satellites to the operator. Failed sign-ins are
slowed per handle in memory. The middleware puts the operator in
`locals`; ownership ("yours"), the launch gap and the launchpad's list of
yours all go by operator when signed in. The nav's last link is "Sign in",
or your handle. Migration `0003_operators`.

Collisions now name operators' handles (ADR 0010). Writing that test found
a real bug: the server caches each predicted hit with the objects as they
were when predicted, so a satellite whose owner claimed a handle after the
prediction was still named "unclaimed operator". It now re-reads both
objects at impact; the test predicts first, then claims, and fails without
the fix.

Checked in Chrome at 1920x1080 and iPhone 14: the operator page (a failed
sign-in shows its reason on its own form; after claiming, the nav shows the
handle) and the launchpad (your satellites listed, the gap counting down).
`pnpm check` green (121 tests).

## 2026-10-06 — C9: adversarial review (not yet acted on)

A fresh Sonnet reviewer, with no shared context, attacked the C9 work (collisions, the
sky page and catalogue, operators) against the C9 spec and the ten-minute
marker visit. Advay was low on usage, so its findings are recorded here to
act on next session; nothing below is fixed yet.

Must fix:
1. **A marker will likely see no collision in ten minutes.** The gentler
   tuning gives 1 to 5 an hour in a quiet sky, and "Next collision: ... in
   2 h" makes the feature look dead. Suggested: a launch gets a head-on
   partner (a derelict) whose fatal meeting falls 2 to 4 minutes out, or
   raise the quiet-sky rate.
2. **Blame can be dodged by callsign.** `blame()` in `src/lib/story.ts`
   matches lines by the text "The derelict", and callsigns may contain
   spaces, so a satellite called "The derelict x" gets sorted with the
   derelicts and cut. Use the object's kind, never the text.
3. **Sign-in throttling can lock anyone out for good, and can stall the
   server.** It's keyed by the (public) handle; the count never resets, so
   one bad try every 30 s keeps a victim locked out. `scryptSync` blocks
   the event loop for each unauthenticated claim or sign-in with no
   global limit, and failures for unknown handles grow memory without
   bound. Suggested: async scrypt, a global/per-IP cap, locks that decay,
   and expiring entries.
4. **The settle timer has no try/catch** (`src/lib/sky.ts`): one thrown
   error (a busy or full disk inside `collide`) kills the process, and the
   failed hit stays first in the schedule.

Should fix:
5. Sessions: no cookie rotation on sign-in or claim; ten-year cookies with
   no server-side expiry; no "sign out everywhere"; `claim` while signed in
   silently re-links. CSRF is covered by Astro's `checkOrigin`.
6. Signing out (or clearing cookies) skips the five-minute gap: launch
   anonymously, then sign back in and it merges.
7. The `collision` event's `objects` are still the prediction-time copies,
   so `mine` can be wrong for an owner who claimed a handle since (the
   parties were fixed; the objects weren't).
8. Scaling: the catalogue's "all" view has no limit and does several
   queries per destroyed row; every read runs `settle()`, several table
   scans each, three times on `/sky/`.
9. `earliest()` in `collide.ts` bisects to 1e-4 ms on epoch-sized numbers,
   below a double's resolution there, so it always runs all 100 steps;
   bisect on the offset from `start` instead.
10. SSE: events from the snapshot's own settle arrive before `hello`;
   collision stories aren't de-duplicated; a reconnect doesn't bring the
   collisions missed while away.
11. Replay near the live cap isn't strictly deterministic (the cap counts
   objects launched after the hit).
12. Wording: "unclaimed operator" is jargon ("launched without a handle"?);
   the client calls any unknown object "debris"; ADRs 0008 to 0010 are
   still "proposed".

Test gaps: no tests of the lockout, claiming while signed in, a hostile
callsign in the blame line, or owner/operator leaks in the SSE payloads.
Nitpicks: `meetingsOf` keeps duplicate keys; the middleware queries the
operator (and mints a cookie) on every request, assets included.

Also in this commit: the `/kessler/` page no longer calls collisions and
lineage "not built yet", and says the collision physics is a toy (ADR
0008), with tests. `pnpm check` green (124 tests).

## 2026-10-06 — C9: acting on the adversarial review

Fixed (tests first where there was a contract; `pnpm check` green, 133):
1. **A collision to watch**: when someone has the sky open and nothing is
   coming within 4 minutes (none staged in the last 5), the server sends
   two derelicts at each other, a dead-centre pass (always hits, ADR 0008)
   meeting over the station 25 s later. Checked in Chrome on an empty sky:
   "Collision coming ... in 22 s", then the flash over the station. A
   viewer arriving ends the settle quiet, so it's staged at once.
2. **Blame** is built from each object's kind, never its text; a callsign
   "The derelict x" is named with its operator (test). "unclaimed
   operator" became "launched without a handle".
3. **Sign-in**: scrypt is async and capped at 4 at a time; wrong tries are
   counted per place (address and handle), lock for 30 s after 5 and then
   start again; claims limited per address; maps swept.
4. **The settle timer** can't kill the process; a collision that can't be
   written is logged and dropped.
Also: cookie rotated on claim and sign-in; claim refused while signed in;
the collision event's objects re-read at impact; replay's cap counts only
objects already up; `earliest()` bisects offsets; `meetingsOf` is a set;
settle returns at once between events; the catalogue shows the newest 500;
stories de-duplicated and a reconnect brings missed collisions; unknown
objects are "something", not "debris"; a test that the stream never sends
owners or person ids. Recorded, not fixed: signing out skips the launch
gap (ADR 0009, same loophole as clearing cookies); no server-side cookie
expiry or "sign out everywhere". Committed as `2dc518c`.

2026-10-07: Advay accepted ADRs 0005 (the sky in Three.js), 0006 (the
launchpad in Three.js) and 0008 (collisions in closed form). 0009 and 0010
stay proposed.

## 2026-10-07 — C9: the catalogue as a table

Advay wanted the catalogue to work like a table: filterable and sortable.
Built test-first (`spec/catalogue.test.ts`, 9 tests over HTTP). A plain GET
form filters by search (callsign or operator handle), kind, band, status
(in the "Everything" view) and "only yours"; every column header is a link
that sorts by it or turns the sort round (`aria-sort` on the active one);
results page 100 at a time with "1–100 of 1,874". It all works without
JavaScript and every view has its own address; with JavaScript the selects
apply as they change. New Kind and Operator columns (a handle, or "no
handle"), since the blame (ADR 0010) should be readable there too.

The query (`browse` in `src/lib/sky.ts`) filters in SQL, sorts in memory
(a height is worked out from the orbit), and works out lineage only for
the rows on the page. A cascade's lineage now names three and "and N
others'", where it used to list a dozen callsigns.

Found on the way: the claim limit from the review fix (10 an hour per
address) was already failing the tests, and would have stopped a class
behind one campus address; it's now 60 an hour, and connections from the
machine itself aren't counted. Checked in Chrome at 1920x1080 and iPhone
14: the page widened to 64rem for seven columns, and on the phone the
table keeps Object, Height and Status (the operator moves under the name),
since the narrow name column was breaking "Fragment" mid-word.
`pnpm check` green (143 tests) Committed as `37f104c`.

## 2026-10-07 — C9: a crash you can't miss, and a view that follows it

Advay wanted a collision bright enough to see clearly, and asked about
panning the camera to it (or only when it's yours). Built both:

- **The crash**: a white-hot core that lights up the sky around it for
  under a second (a radial veil over the whole view), cooling to an
  orange glow; a fast shock ring and a slower one; and 40 sparks thrown
  mostly along the two orbits, slowing and cooling white to red. The spray
  is seeded by the collision, so every screen sees the same one.
- **Following it**: five seconds before a collision out of view, the
  planet turns (the ground layers rotate, the orbits are placed turned)
  to bring it over the middle of the screen, holds five seconds after,
  then turns back to the station. Yours always; anyone else's at most once
  every 30 seconds, so a busy sky doesn't keep swinging. Not when zoomed
  out to the whole sky, and not for reduced motion, where an arrow at the
  edge says "Collision out of view" instead.

![Followed and bright: the view turned 57° from the station, mid-flash, the high band lit up around two derelicts' collision](screenshots/2026-10-07-collision-followed-and-bright.png)

Checked in Chrome against a seeded sky (two derelicts sent to meet in the
high band, 57° from the station): at 1920x1080, before, mid-turn, the flash,
the sparks and the return to the station; and on an iPhone 14. Found on the
way: the collision layer never got the device pixel ratio, so on a retina
screen its rings were drawn at half size. `pnpm check` green. Committed as
`90dfab9`.

## 2026-10-07 — C9: the "in orbit" notice, and nudging towards a handle

The sky's "*callsign* is in orbit" notice outlived its satellite (on a
phone it stays in the page); it now goes as soon as the satellite is hit or
burns up. Checked by launching in a seeded sky and sending a derelict at it:
the notice showed until the hit, then went. Committed as `811236f`, then
`C9` was fast-forwarded into `main` and pushed (Advay's say-so), which
deploys.

Advay wanted to nudge people to sign up when they launch. Kept to a nudge,
never a gate (ADR 0009: anyone can launch), and not a pop-up on the Launch
button, which would cut into the launch animation: a line under the button
("Launching without a handle. Claim one to keep your satellites on any
device, and your name on what they do", or "Launching as *handle*"), and
the same offer on the notice straight after launching, which then stays up
twice as long on desktop. Tests in `spec/operator.test.ts`. Committed as
`487f0a4`.

## 2026-10-07 — C9: the handle nudge becomes a pop-up on the launchpad

Advay didn't think the line under the Launch button was enough, and wanted a
pop-up on the launchpad. It opens on arrival (a modal `<dialog>`), before
anything is launched, so it doesn't cut into the launch animation, the
reason a pop-up was turned down last time. It says what's lost without a
handle (your satellites are tied to this browser) and what one gives (they
follow you, and collisions name you), with "Claim a handle", "I have one:
sign in" and "Launch without a handle", which just closes it: still a nudge,
never a gate (ADR 0009). Escape or a click on the backdrop closes it too.

Once a visit (sessionStorage, marked when shown, so following a link to the
operator page and coming back doesn't bring it up again), never for someone
with a handle, and not when the form comes back with errors. Without
JavaScript it stays closed and the line under the button still makes the
offer. Test in `spec/operator.test.ts`, failing first against the old page.
Checked in Chrome at 1920x1080 and iPhone 14: it opens, focus lands on
"Claim a handle", closing works and a reload doesn't reopen it.

![The launchpad on arrival without a handle: the pop-up over the pad, the old line still under the Launch button](screenshots/2026-10-07-launchpad-handle-popup.png)

## 2026-10-07 — C9: what's outstanding, and the last two decisions accepted

Asked what was outstanding for C9, the agent went through `PLAN.md`, the
log and the repo (the course site was blocked from its sandbox, so not
against the spec itself): no `reflections/crit-9.md`, `PROCESS.md` stopping
at C8, a README still describing C8 ("one live satellite each"), ADRs 0009
and 0010 still proposed, a stale status section in the plan, the last log
entry missing its hash, and deorbiting not built. The plan's status and
the hash were fixed first (`408d5f7`, pushed to `main` on my say-so).

After the agent read me both records, I accepted ADR 0009 (an operator you
can claim) and ADR 0010 (every screen names who caused a collision, the C9
decision about several people at once). The README rewrite is low priority:
I'll write it near the end of the project. Next for C9: the C9 part of
`PROCESS.md`, `reflections/crit-9.md`, and whether to build deorbiting.

## 2026-10-07 — C9: bringing a satellite down, and boosting it up a band

Asked for both (branch `claude/c9-outstanding-work-17iuus`, on top of the
handle pop-up from PR #2, which GitHub wouldn't let my own account approve,
so it's merged into the branch rather than into `main`). **Deorbiting**: a
gradual descent, and a dialog thanking whoever does it for being
responsible. **Boosting**: keep a satellite up longer by climbing a band
(low to mid, mid to high), gradually. Buttons on your satellites on the
launchpad and in the sky's station panel. I also want to be able to click a
satellite or fragment to see its history, for C9 but not yet: noted in
`PLAN.md`.

The agent's design, in ADR 0011 (proposed, for me to accept): a manoeuvre
is a new epoch for the orbit with its own rate of fall, so positions stay
closed form (ADR 0007) and every screen draws the same descent. Brought
down: from any height it reaches the top of the atmosphere in two minutes,
then burns up as anything does, and ends `deorbited`. Boosted: it climbs to
a random height in the next band in 90 seconds, then falls by drag alone;
each satellite has fuel for one boost, so it buys a band, not immortality.
Every manoeuvre is kept in a new `manoeuvres` table, for the history view.

The snag was collisions: the server predicts meetings on the rule that two
orbits falling at one rate never get closer in height. A manoeuvring orbit
moves through other heights, so `nextMeeting` now works in pieces: where
two objects fall at different rates their heights cross once, and the
stretch either side where they're within the hit distance is found by
bisection. Plain pairs go through exactly the same steps as before, so old
skies replay the same. A manoeuvre throws away the object's predicted
meetings and works them out again; everyone gets a `manoeuvre` event, so
screens drop the collisions called off. A boost can take you out of a
collision coming, which is a taste of C10's dodging.

Tests first (`spec/manoeuvre.test.ts` for the maths,
`spec/manoeuvre-server.test.ts` for the server, `spec/manoeuvre-http.test.ts`
over HTTP), each failing for the right reason before the code. Found on the
way:
- **`pnpm check` was flaky before this work**: the first stream on a fresh
  server could get a staged collision's `launch` events before `hello`
  (the adversarial review's item 10). The stream now holds what the
  snapshot sets off until after `hello`.
- My own test had the wrong crossing time (the lower orbit decays too).
- On the sky page the background post went nowhere: the buttons are named
  `action`, so `form.action` was the button, not the URL.
- Capturing the clock before `nextLaunchAt` (which reads it again) gave a
  brand-new visitor "You can launch again in 1 s" and a disabled form
  whenever the millisecond ticked over in between. Caught by an existing
  test failing one run in three.
- The launchpad's "Yours in orbit" line became a list (one row each:
  callsign, where it stands, its buttons); the old launch test's exact
  wording was updated to the list.

Checked in Chrome at 1920x1080 and iPhone 14: boosting HERON from the pad
("Climbing to the high band"), bringing QUIET-SKY down (asked first, then
thanked), watching both on the sky (HERON's trail curving outward,
QUIET-SKY spiralling in and burning up at the limb, ended `deorbited`
150 s after the order), and bringing HERON down from the station panel
without leaving the sky. On the phone, the list no longer scrolls inside
itself. `pnpm check` green three runs in a row (185 tests).

![The thank-you after bringing QUIET-SKY down from the launchpad: asked first, thanked after, and the list says it's coming down](screenshots/2026-10-07-deorbit-thank-you.png)

![The whole sky a minute later: QUIET-SKY burning up at the limb (bottom right) and HERON, brought down from the station panel, on its way](screenshots/2026-10-07-deorbit-descent-and-burn-up.png)

Committed as `948998e`. Then a fresh Sonnet reviewer, with no shared
context, attacked it against the ask and the ADR. It checked the maths
itself: 12,000 random plain pairs met exactly as before the change, and
about 1,700 meetings checked against a brute-force scan of descents and
climbs found no mismatch. It also confirmed cross-site posts are refused,
`back` can't redirect off the site, and the stream leaks no owner.
Fixed from its findings:
1. **The sky panel could bring down a different satellite from the one
   you confirmed**: the panel moves on to whichever of yours is next
   overhead, and the form was read after the question. It's read at the
   click now.
2. **The catalogue's live height went wrong after a second** for anything
   manoeuvring (its script rebuilt the orbit without the rate); it now
   carries the rate and the climb's end, and a live row says "coming down"
   or "climbing".
3. The dialogs overpromised ("won't be up there for anyone to collide
   with"): a satellite coming down can still be hit for two minutes, and
   now they say so.
4. A satellite that can't boost says why ("Boost used", "Highest band").
5. The launchpad list keeps up (climbing, coming down, burning up, gone)
   and the address loses `?deorbited=` once it's been said, so a reload
   doesn't thank you twice.
6. A boost gets a news line on the sky too, and a boost from the top of a
   band can't land just over the edge of the next.
Tests added: the catalogue's wording, the missing boost's reason,
cross-site posts, `back`, and an operator manoeuvring from a second device.
Not fixed: "next over the station" estimates from the period now, so it's
rough mid-manoeuvre; with several satellites the sky's panel offers its
controls for the one it's talking about, not a choice (the launchpad has
them all). `pnpm check` green (190 tests).

## 2026-10-07 — C9: manoeuvres off the launchpad; one boost, for sure

After seeing the screenshots, I didn't want satellites managed on the
launchpad: it was getting cluttered. It's back to the one line naming yours
in orbit, and boosting and bringing down live in the sky's station panel
only (which now says "Boost used" or "Highest band" when there's no boost).
The manoeuvre form always goes back to the sky. ADR 0011 (still proposed,
so editable) says so.

I also wanted to be sure a satellite can only be boosted once. It already
was (one tank of fuel per satellite, checked before the boost), and now the
database write checks it too, so two requests at the same moment, or from
two devices signed in as the same operator, still boost once. New HTTP
tests for both, and for the launchpad offering no manoeuvres; the rest of
the HTTP tests moved from the launchpad to the sky panel and the
catalogue. `pnpm check` green (190 tests).

I accepted ADR 0011 (bringing your satellite down, or boosting it up a
band) as it stands after the launchpad change. The manoeuvre commits so
far: `948998e`, `e010756`, `f35f752`.
