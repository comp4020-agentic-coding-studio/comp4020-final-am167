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
