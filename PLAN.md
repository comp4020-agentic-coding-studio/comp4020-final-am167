# Plan: Kessler (working title)

A planning snapshot, not the README. Details get fleshed out later; decisions
that are expensive to reverse go into `doc/adr/` once made. Any agent picking
this up: read this file, then `notes/log.md`, before planning or building.

## Status and next steps

_Last updated 2026-10-07, overnight (Advay's feedback round on branch `claude/nifty-thompson-s7cine`, in a PR for review; ADRs 0015–0018 proposed)._

- **C8, done:** idea chosen; the decisions below agreed with Advay; person,
  persistence and real-time settled ("Foundations"), each with a decision
  record in `doc/adr/` (0001–0004; 0002, the person, superseded by 0009).
  2026-10-04: the C8 open questions resolved (scope, overhead, launch flow,
  beacon rules, launch limits, bands); the rest deferred to C9 or later, see
  "Now and later". Stack restored (`618d80a`). C8 slice built (`4be85b1`):
  launchpad, launch rules, the sky chart and catalogue, SSE. First README
  (`7c49d7a`), `PROCESS.md` (`f6bbe13`) and `reflections/crit-8.md`
  (`5ad94df`).
- **C8 cutoff:** Tue 6 Oct 2026, 12:00 (moved from Monday for Labour Day).
- **C9, built (on `main`, merged from branch `C9`):**
  - The sky as a Three.js horizon view over the station (ADR 0005,
    accepted; `f8f7003`), zooming out to the whole planet (`9cc3927`); the
    catalogue on its own page (`455789e`); soft band edges (`baf5342`).
  - The launchpad in Three.js, with a launch that hands off to the sky
    (ADR 0006, accepted; `5c41ccd`).
  - A page explaining Kessler syndrome at `/kessler/` (`356e469`).
  - Orbital decay ending in a burn-up (ADR 0007, accepted; `fb51cae`).
  - Collisions predicted, announced and replayed by the server (ADR 0008,
    accepted; `41f32ef`); launches any number up, five minutes apart
    (`5cf1247`).
  - Collisions drawn on every screen, blame traced through lineage, and
    claimable operators (ADRs 0009 and 0010, accepted 2026-10-07;
    `44487ac`).
  - The adversarial review's must-fixes and most should-fixes acted on
    (`2dc518c`); recorded, not fixed: signing out skips the launch gap, and
    no server-side cookie expiry or "sign out everywhere".
  - The catalogue as a filterable, sortable, paged table (`37f104c`); a
    bright collision the view turns to follow (`90dfab9`); the "in orbit"
    notice dropped once that satellite is gone (`811236f`); a nudge towards
    claiming a handle at launch (`487f0a4`), then as a pop-up on arriving
    at the launchpad (once a visit, closable, never a gate; PR #2), since
    moved to open on the first Launch of a visit instead of on arrival.
  - **Deorbiting and boosting** (Advay, 2026-10-07; ADR 0011, accepted;
    `948998e`, review acted on in `e010756` and `f35f752`; PR #3): bring
    your own satellite down in a two-minute descent, with a dialog thanking
    you for keeping the sky clear; or boost it up a band (low to mid, mid
    to high, once) in a 90-second climb. Buttons in the sky's station panel
    only (not the launchpad: too cluttered). No fuel.
  - **Click a satellite or fragment to see its history** (Advay,
    2026-10-07; ADR 0012, accepted; `93f8735`): in the sky, clicking an
    object opens its record, also at `/object/<id>/` and linked from the
    catalogue. Framed as "the sky remembers" (Ostrom: seeing what each
    takes): who launched it, when, any manoeuvre, for debris the collision
    it came from and its roots, how it ended, and **what followed** (its
    fragments, how many are still up, what they destroyed). A live
    satellite's beacon stays hidden (heard only overhead, with a countdown
    to the next pass); once it's gone the beacon is shown as its epitaph;
    its owner always sees their own.
  - **Slower orbits and three ground stations** (Advay, 2026-10-07; ADRs
    0013 and 0014, accepted; `85c97ff`, `67b29a9`; PR #4). Every period
    three times longer, so a beacon is up long enough to read; three
    stations at the Deep Space Network's sites (Canberra, Goldstone,
    Madrid), all heard by everyone, to give the passes back; the sky opens
    on the whole planet with a beacon panel per station, and the horizon
    over any station one click away.
  - Not built, though once listed for C9: conjunction alerts and dodging
    (moved to C10).
- **Overnight round, 2026-10-07 (branch `claude/nifty-thompson-s7cine`, a
  PR for Advay; not on `main`):** Advay's list after playing with the app,
  each built, tested and logged in `notes/log.md`, the four design changes
  as ADRs **proposed** for him to accept or change:
  - The handle pop-up no longer opens for a launch that would be refused
    (an empty form) (`3b41406`).
  - **Yours** in the catalogue, with each satellite's boost and bring-down;
    every object's history as a **pop-up card** (with its controls if it's
    yours); no controls in the sky's station panel (ADR 0015; `51e1fc0`).
  - **Beacons heard by people** (ADR 0016; `e0db217`): 140 characters, not
    60; who's listening; each pass heard while someone's listening logged,
    with "heard by" counting people; a **Heard** feed beside the sky.
  - **The wreck keeps the words** (ADR 0017; `fd0a0df`): fragments carry
    pieces of both colliding beacons, heard as static; "the wreck says";
    encounters in Yours.
  - **The purpose** (ADR 0018): a question from the stations each day, the
    launchpad's intro rewritten around the why, a Why page (`/why/`), the
    first-launch explainer brought up to date. "A purpose" and "Collisions
    that mean something" below are rewritten as decided.
  - For Advay: accept (or change) ADRs 0015–0018; edit the question list
    (`src/lib/questions.ts`) and the Why page's wording into his own; the
    README is now further out of date (it says 60 characters and "one live
    satellite each", and nothing of being heard, static or the question).
- **C9 cutoff:** Mon 12 Oct 2026, 12:00.
- **Next, for C9 (write-ups only; nothing left to build):**
  1. `PROCESS.md`: the C9 part (it stops at the C8 slice), from
     `notes/log.md`.
  2. `reflections/crit-9.md` (Advay's).
  3. Before the cutoff: `pnpm check` against a fresh build, then preflight.
- **Later (low priority, near the end of the project):** `README.md`,
  in Advay's words. It still says "one live satellite each" and "a second
  launch is refused", says nothing of collisions, debris, blame or
  operators, and its tested list predates them. ADR 0010 is judged by what
  the README says good means, so the rewrite should say it. Advay also
  confirms which sources he has read.
- **Never deploy, flip public or commit without Advay's say-so** (CLAUDE.md).

## The idea

One shared low orbit that everyone uses and nobody owns. Visitors launch
satellites into it, and every choice that makes sense on its own pushes the sky
towards a Kessler cascade: a collision makes debris, debris causes more
collisions, and eventually orbit is unusable for everyone.

The argument: space is the newest commons (Hardin 1968, Ostrom 1990), and the
attention economy is an old one. People launch to be seen, crowd the orbits
where they're seen most, and the debris is a cost nobody pays for directly.

Since 2026-10-07 (ADRs 0016–0018) the words carry the argument as much as
the orbits: a beacon is heard by the people present, a collision breaks
two people's words into static everyone hears around, and the question the
app leaves each visitor with is **what's worth saying, if saying it costs
everyone a little?** See "What Kessler is for" below.

## Core loop

1. **Launch.** As many satellites as you like, five minutes apart. Pick an altitude band and a
   callsign, and write a beacon of up to 140 characters, answering the
   stations' question of the day or not (ADR 0016, 0018).
2. **Be heard.** Every time your satellite passes over one of the three
   ground stations, its beacon is heard by everyone listening (with the sky
   open) at that moment; the stations log it, and it counts who heard it.
3. **Listen.** Your being here is everyone else's audience. The sky page is
   the sky and, beside it, what the stations hear and have heard.
4. **Share the sky.** Satellites and debris follow deterministic orbits.
5. **Collide.** Two objects that meet become a cloud of fragments carrying
   pieces of both beacons, heard as static, and those fragments can hit
   other objects (ADR 0017). Both owners find the encounter in Yours.
6. **Deorbit or boost (optional).** An owner can bring their own satellite
   down on purpose, giving up their beacon to leave the sky cleaner, or
   boost it up a band once.

## Decisions so far

| Question | Decision |
|---|---|
| Incentive (why launch?) | **Beacon** first: your satellite carries one short line, shown to everyone when it passes overhead. **Some Light** too: each satellite leaves a faint coloured trail, so the sky is also a shared light picture that debris scratches grey. |
| Ending | **No reset; the sky decays.** Orbital decay slowly pulls everything down, satellites and debris alike. Low orbits decay fast, high orbits slowly, so the sky heals over time but a bad cascade takes a long while to clear. |
| Dimension | **2D** orbital chart: clearer, lighter on mobile, easier to make accessible than 3D. |
| Deorbiting | **Allowed** for your own satellite. Debris can't be cleaned up by anyone. |
| C8 scope (2026-10-04) | **Proof of life + SSE:** launch, persist, orbits drawn, launches appear live in other sessions. Collisions, debris, decay and deorbiting move to C9. The C8 brief only asks for proof of life ("the real-time layer and the polish can all wait"); SSE is kept to build the event plumbing early. |
| Overhead (2026-10-07, ADR 0014, accepted) | **Three ground stations** at the Deep Space Network's sites (Canberra, Goldstone, Madrid), all heard by everyone, so everyone still reads the same line at the same moment. The sky opens on the whole planet; the horizon over any station is a click away. Replaces the row below. |
| ~~Overhead (2026-10-04)~~ | ~~**One shared ground station**~~, a fixed point on the planet. A beacon shows to everyone when its satellite crosses that arc, so everyone reads the same line at the same moment. The station is the launchpad. |
| Launch flow (2026-10-04) | The landing page is the **launchpad** with the launch form. Launching plays a rocket rising, then the camera **pans up** into the orbit view and the new satellite appears. C8 gets a simple version of the pan; the cinematic version is week 12 polish. Without JS the form still posts and redirects to the orbit view. |
| ~~Beacon rules (2026-10-04)~~ | ~~**At most 60 characters**~~, plain text, no URLs, a small word blocklist. Shown in the sky while the satellite is live; the catalogue keeps it after. Length replaced by the row below. |
| Beacon length (2026-10-07, ADR 0016, proposed) | **140 characters**: a thought, not a slogan, readable in the dozen seconds a low satellite is over a station. Several overhead take turns sized to the line (4 to 10 s). |
| Heard by people (2026-10-07, ADR 0016, proposed) | **A pass over a station while people have the sky open is heard**: logged, and each listener who isn't the owner counted once ("heard by", people not tabs; cookies hashed). A **Heard** feed beside the sky; who's listening now. A beacon is public in the feed once heard (ADR 0012's withholding until it's gone is relaxed). |
| The wreck keeps the words (2026-10-07, ADR 0017, proposed) | **Each fragment carries a run of words from each colliding line**, heard over the stations as static; "the wreck says" fades as fragments burn up; each owner gets the encounter in Yours. Replaces "fragments carrying words can come later". |
| Question of the day (2026-10-07, ADR 0018, proposed) | **The stations ask one question a day** (fixed list, `src/lib/questions.ts`, turning at midnight UTC); a beacon can answer it (ticked by default). Two answers that collide say so. |
| Managing yours (2026-10-07, ADR 0015, proposed) | **Boost and bring down from Yours (`/catalogue/?show=mine`) and from each satellite's pop-up card**, never the station panel. Every object's history pops up as a card. |
| Launch limits (2026-10-04) | ~~One live satellite per person, plus a cooldown~~ (starting at 10 minutes) after your satellite dies or is deorbited, so relaunching costs something. Replaced 2026-10-06, below. |
| Launch limits (2026-10-06) | **Any number up, five minutes apart** (first a minute; Advay set five the same day, after one person launching nonstop took the sky from 2 collisions an hour to 60, and three filled it to its cap). Advay: "someone can send more satellites to send more messages but increase the risk of ruining it for all". Each launch is another beacon heard and another object everyone shares the sky with; the gap is between your launches, not after one dies. The sky cap (200 satellites) stays as the machine's backstop. Replaces "one each keeps it fair" (ADR 0002, superseded): the commons is now tested by how much each person takes, not rationed. |
| Collisions scale with satellites (2026-10-06) | **A requirement from Advay:** the more satellites up, the more collisions. The model does this (more than linearly, the shape of a real cascade): measured with people's satellites held steady, 0 or 5 people up give 1 to 4 collisions an hour (the derelict floor of 20 dominates), 20 give about 20, 50 give about 130. Advay kept the floor at 20 (asked 2026-10-06), so the rise only shows once people outnumber it. Re-check whenever the tuning changes. |
| Sky cap (2026-10-04) | **At most 200 satellites in orbit at once**; launches are refused while it's full. Added after review: nothing leaves the sky in C8 and a cookieless client can launch without limit, so this protects the 256 MB machine. Revisit with decay in C9. |
| Catalogue (2026-10-04) | **The "In orbit" table shows callsigns, not beacons.** A beacon is only heard as its satellite passes over the station, so flying low (heard more often) stays worth it. The reviewer pointed out that a permanent list of beacons made "be seen" pointless. |
| Catalogue page (2026-10-05) | **The sky page keeps a short "Sky now" card; the full table moves to `/catalogue/`.** The card has counts per band and the latest launches, live; the catalogue lists what's in orbit or everything ever launched (a plain link), and is where debris and its lineage go. The table under the sky made the page scroll too far, and debris would make it far longer. The card is also where collisions out of view will be announced. |
| Bands (2026-10-04) | **Three bands (low, mid, high) with jitter:** you pick a band, the server picks a random radius and phase inside it, so orbits aren't identical. |
| Decay (2026-10-06, ADR 0007) | **Closed form, then a burn-up.** radius³ falls at one steady rate, so an orbit falls slowly, then faster; from the low band's middle it lasts 4 hours, the mid's about 17 hours, the high's about 2 days (across each band's reach: 1–8 h, 9–27 h, 31 h–3 days). Shortened from a day / a week / two months on 2026-10-06: the high band has to clear within a few days. At 1.06 planet radii it plunges for 30 seconds and burns up, drawn as a real re-entry. Positions stay a pure function of orbit and clock, so nothing new is stored or sent. |
| Slower orbits (2026-10-07, ADR 0013, accepted) | **Every period three times longer**: low middle every 3 minutes, mid about 8, high 24, so a low beacon is up about 12 seconds, not 4. Head-on collision chance tripled to keep collisions per hour; decay unchanged; orbits already up retimed once, in place. |
| Bands as ranges (2026-10-06, ADR 0007) | **One period for each height** (low middle once a minute, high middle every eight; mid now 2.7 min; all three times longer since ADR 0013), and the bands meet at 1.5 and 2.05, so every height is in one band. Counts on the sky page are by where objects are now. |
| Collision geometry (2026-10-06) | **Mixed directions, plus near misses.** Orbits are flat and the period depends only on height, so two objects going the same way at the same height never close in, and decay keeps the gap in radius³ fixed. So each object gets a direction (prograde or retrograde): opposite-direction objects at similar heights cross head-on twice a lap. Same-direction objects can still collide when one creeps up on another within a (larger) hit distance. Rejected: hidden 3D inclinations (rewrites the rendering). Needs a decision record. |
| Collision mechanics (2026-10-06, draft) | **Predicted by the server, broadcast ahead.** Positions are closed-form, so the server solves each pair's next crossing, keeps a queue of upcoming hits and sets a timer for the next (as decay does for burn-ups). A `conjunction` event gives every screen the impact time in advance, so all screens draw it at the same moment. At impact both objects are `destroyed` and seeded fragments spawn near the point, mostly keeping their parent's direction, so a head-on hit leaves debris going both ways. Catch-up after a restart runs the queue forward in time order (decays and collisions, new debris colliding inside the gap). New `collisions` table; `objects` gains direction and source collision (the lineage of ADR 0003). |
| Seeding (2026-10-06) | **The server keeps a baseline of derelicts**: dead, ownerless satellites and old debris, as real orbit has, so collisions can happen when only the marker's two sessions are open. |
| Identity (2026-10-06) | **Optional claim on top of the cookie.** You still launch anonymously within seconds (ADR 0002's reason holds); you can claim a unique operator handle with a passphrase, which keeps your record and blame across devices. No email, no personal data; passphrases hashed with Node's `scrypt`. Supersedes ADR 0002, so needs a new record. Rejected: required sign-up (marker friction), GitHub OAuth (secrets, personal data, marker needs an account), handle without a password (no cross-device). |
| Blame (2026-10-06) | **Worked out from lineage, not stored.** Every fragment traces through its collision to the satellites at the root; their operators are who to blame. |
| C9 scope (2026-10-06) | **Collisions + login.** Collisions, debris, lineage and blame by operator, and the optional claim. Conjunction alerts and dodging wait for C10. The C9 written decision is who sees the blame (ADR 0010). |
| Band edges (2026-10-05) | **Soft edges:** the radius is drawn from a bell curve around the band's middle, so about one launch in eight lands past the band's edges, but never far enough to reach a neighbouring band. The bands are drawn as soft glows to match. |

## The altitude trade-off

| Band | Benefit | Cost |
|---|---|---|
| Low | Passes overhead often, so the beacon is read more | Drag brings it down fast; crowded |
| High | Lasts much longer | Rarely overhead; its debris lingers far longer |

Bands are chosen (three, with jitter; see the table above). Starting values,
in units of the planet's radius, to tune once the sim runs: low r 1.2–1.4,
period about 1 minute; mid r 1.6–1.9, about 3 minutes; high r 2.2–2.6, about 8
minutes (mid is now 2.7 minutes: one period law for every height, ADR 0007).
Decay: about 4 hours from the low band's middle, 17 hours from the mid's,
2 days from the high's; 1 to 8 hours, 9 to 27 hours and 31 hours to 3 days
across each band.

## Co-presence

- Launches, collisions and fragment clouds appear on every open screen at once.
- **Who caused it** (the C9 decision, ADR 0010): every screen names the
  operators behind a collision, traced through lineage.
- **Being heard needs others here** (ADR 0016): a beacon is heard only by
  the people who have the sky open as it passes over a station, and each
  is counted; the sky page says how many are listening now. Your presence
  is someone else's audience.
- **Conjunction alerts** (C10; once the likely C9 decision, replaced by ADR
  0010 when dodging moved out): when two satellites are on a
  collision course, both owners are warned and either can spend limited fuel to
  dodge. If both are online, who moves? If an owner is offline, they can't
  dodge, so being absent makes you vulnerable. (Precedent: ESA moving Aeolus
  for a Starlink satellite in 2019.)

## Foundations: person, persistence, real-time

Agreed 2026-10-03, answering the week 8 lecture's three questions. Each is a
decision record in `doc/adr/` (index: `doc/adr/README.md`); this section is the
summary, the records are the source of truth.

| Question | Decision | Record |
|---|---|---|
| Stack | Astro on Node, SQLite via Drizzle on `/data` | `0001-astro-and-sqlite-stack.md` |
| What counts as a person | An anonymous cookie, plus an operator handle you can claim with a passphrase | `0009-an-operator-you-can-claim.md` (supersedes `0002-a-person-is-an-anonymous-cookie.md`) |
| What persists | The sky decays, every object's record stays forever | `0003-the-sky-decays-the-record-stays.md` |
| How a change reaches everyone | SSE events; the server's clock is the only clock | `0004-server-sent-events-and-one-clock.md` |

### What counts as a person

_The C8 decision, kept as history: superseded by ADR 0009 (accepted
2026-10-07), which keeps the cookie and adds an operator you can claim, and
by the launch limits of 2026-10-06 (any number up, five minutes apart)._

**An anonymous browser cookie, plus the callsign you pick at launch.**

- A random id in a long-lived, `httpOnly` cookie, set on first visit. No
  sign-up, so a stranger can launch within seconds.
- One active satellite per cookie. The callsign is chosen per launch.
- Accepted cost: a new browser or cleared cookies makes a new person, so one
  human can hold several satellites and loses control of the old one. This
  loophole is deliberate for now; the logs (C10) will show whether it's abused.
  Rejected: a recovery code (extra step, still doesn't stop extra browsers) and
  real accounts (friction kills a stranger's first try; holds personal data).

### What persists

**The sky decays, the record stays.**

- Live objects (satellites and debris) leave the sky through orbital decay,
  deorbiting or collisions.
- Every object's row is kept forever as the catalogue: launch time, owner
  cookie, callsign, beacon, band, fate (`live`, `decayed`, `deorbited`,
  `destroyed`) and, for debris, the collision it came from. The sky heals; the
  history (and the blame) doesn't.
- The server stores the last time it simulated up to, so it can replay the gap
  after the machine has been stopped.
- Rejected: deleting decayed objects (no lineage, nothing for C10) and keeping
  only counts (loses "who caused this", which is the argument).
- Beacon text is kept forever, so it has a rule: 60 characters, plain text,
  no URLs, a blocklist (2026-10-04); once a satellite is gone its beacon is
  shown as its epitaph (ADR 0012).

### How a change reaches everyone

**Server-sent events, with the server's clock as the only clock.**

- Actions go up as ordinary `POST`s (forms that work without JavaScript).
- Events come down one SSE stream: launch, deorbit, collision, decay, and
  later conjunction alerts. Positions are never sent: each client draws them
  from the stored orbits and the server time, after measuring its clock offset
  when the stream connects.
- On reconnect, the client catches up from a snapshot of the live sky.
- Rejected: WebSockets (two-way isn't needed; traffic is almost all
  server-to-client) and polling (wasteful, and on the edge of "about a
  second").

### Expiry, history and visibility

- **What expires:** everything in the sky, through orbital decay at rates set
  by altitude.
- **History:** the public catalogue above. Each fragment traces back to the
  collision that made it and who launched what was involved.
- **Visibility:** open. Every screen, the catalogue and each object's record
  name the operators whose satellites a collision traces back to (ADR 0010).
- **What we chose not to build:** debris cleanup, a reset, accounts, and any
  channel to talk to other operators beyond beacons and alerts.

## Technical shape

- Stack (ADR 0001): server-rendered Astro on Node, SQLite on `/data` via
  Drizzle with migrations run at boot. SSE for every change (ADR 0004).
- Orbits are stored as elements plus a start time, so any object's position at
  any moment is a pure function of time.
- Collision checks run on the server. Fly stops an idle machine, so on boot
  the server replays the time it missed in fixed steps and applies any
  collisions that fell in the gap. A restart and an uninterrupted run produce
  the same sky.
- The event fan-out is in memory in the one Node process (fine on one machine).
- The server keeps live objects in memory for collision checks, so 256 MB caps
  the sky's size.
- The canvas is the spectacle. Every action (launch, dodge, deorbit) is also a
  normal form control, and the catalogue is a real table.

## Testable claims (draft)

- A launch in one session appears in another within about a second.
- The same object at the same moment is in the same position in every session
  and after a restart.
- A collision produces debris, and every fragment has a catalogue entry
  tracing it to its source.
- Decay follows the documented rates; debris that hasn't decayed yet survives
  a restart.
- Stopping the server and restarting applies the collisions that fell in the
  gap.
- Launches five minutes apart per person; dodging uses fuel; only the owner can
  deorbit.

## Now and later

### C8 (week 9, cutoff Tue 6 Oct 12:00): building now

- Stack set up (Astro, SQLite/Drizzle on `/data`, migrations at boot).
- Anonymous person cookie (ADR 0002).
- Landing page = launchpad: form with band, callsign and beacon (rules
  above). One live satellite per person; cooldown stored but only matters
  once satellites can die.
- Launch stores the satellite (band, jittered radius, phase, launch time).
- Simple launch animation and camera pan up to the 2D orbit view; the new
  satellite is highlighted.
- Orbit view draws every live satellite from its stored elements and the
  server clock.
- Beacon shows when a satellite crosses the shared ground station.
- SSE: a launch appears in every open session within about a second;
  reconnect catches up from a snapshot.
- First `README.md`, served at `/readme/`; `PROCESS.md`; `reflections/crit-8.md`.
- Deployed to Fly (only when Advay says so).

### Later

- **Adopted for the sky in C9 (2026-10-05, ADR 0005):** a horizon view
  through an orthographic camera; the launch and collision effects are still
  to do.
- **Visuals (week 12, maybe sooner): Three.js** (Advay, 2026-10-04) for the
  striking version of the sky and the launch: glow, light trails, collision
  bursts. Not for C8; the chart is a 2D canvas for now. It doesn't have to
  undo the 2D decision (an orthographic camera keeps the chart flat), but it
  weighs against the reasons 2D was chosen (light on mobile, accessible), so
  it gets a decision record when it's adopted. The orbit maths in
  `src/lib/orbit.ts` is renderer-agnostic, so swapping the canvas for Three.js
  only touches the drawing code.
- **C9 (week 10), built:** server-side collisions making debris, boot-time
  replay of missed time, orbital decay, deorbiting your own satellite (the
  cooldown became a five-minute gap between launches). Conjunction alerts
  and dodging with fuel moved to C10. See "Status and next steps".
- **A page explaining Kessler syndrome (added 2026-10-06; built
  2026-10-06).** People Advay has shown the app to don't know what Kessler
  syndrome is, so the name and the argument don't land. A short plain-language
  page at `/kessler/`: what it is, how one collision makes the debris
  that causes the next, the real cases (the 2007 FY-1C test, the 2009
  Iridium 33 / Kosmos-2251 collision), why it's a commons problem, and how
  the app's mechanics map onto it, with "not built yet" on collisions, decay,
  deorbiting and lineage. Linked from the nav, the launchpad and the sky.
  The launchpad's intro now carries a one-line explanation ("in a crowded
  orbit one collision can set off the next: Kessler syndrome"), for Advay to
  confirm. The "not built yet" tags are gone now that all four are built.
- **Seeing a burn-up on demand (added 2026-10-06, for later).** The shortest
  lifetime is hours and everyone has one satellite, so a visitor (or a
  marker) only sees a re-entry if someone else's falls while they watch.
  Ideas: replay the latest burn-up on request, or a short "watch the last
  re-entry" clip from the sky page. Not decided; see ADR 0007.
- **Boosting a satellite (added 2026-10-06; built 2026-10-07, ADR 0011).**
  The other half of deorbiting: an owner raises their own orbit one band,
  once, to stay up longer. No fuel; a boost is a new epoch for that object.
- **C10 (week 11):** server-side logs as evidence (launches per band,
  collisions, dodges, deorbits); conjunction alerts and dodging with fuel
  (moved from C9). The catalogue's lineage was built in C9.
- **Week 12:** visual polish (light trails, collision effects), README and
  PROCESS write-up.

## Sources to read

- Kessler & Cour-Palais (1978), the original cascade paper
- 2009 Iridium 33 / Kosmos-2251 collision
- 2007 Chinese anti-satellite test (FY-1C)
- ESA Space Environment Report
- FCC five-year deorbit rule (2022)
- Hardin (1968); Ostrom (1990)
- *Stuff in Space* (visual reference)

## Design direction (from Advay)

- Visually striking and thought-provoking: the mechanics should embody an
  argument, not decorate a utility.
- No proposing or voting on rules; governance comes only from what people can
  see and choose for their own satellite.
- Avoid overlap with classmates' public finals, notably Constellation (people
  as stars joined by declared connections) and The Garden (grows only while
  people are present together).

## Collisions that mean something

_Added 2026-10-06 at Advay's request; the couplet built for C9; explored
again and decided 2026-10-07 (ADR 0017, proposed), after Advay (and the
marker) said the couplet hadn't met it._

Why the couplet fell short: it framed a random pairing and then nothing
changed. Both lines died with their satellites, the fragments were
anonymous dots, and the two people never learned anything of each other.
The collision is the one moment two strangers' words touch here, and it
left no mark on either.

Options weighed (the record is ADR 0017):

- **The couplet** (built in C9): both beacons side by side. A
  juxtaposition, not a connection.
- **Aim at a satellite** (a "reply" launch onto a crossing orbit):
  rejected twice. It makes a collision chosen, which breaks the argument
  (debris as a cost nobody meant to cause), and drifts towards
  Constellation's declared connections.
- **Collide by meaning** (similar lines likelier to meet): the server
  judging text, opaquely. A trick.
- **The wreck keeps the words** (built): each fragment carries a run of
  words from each line, every word of both surviving once, paired with
  pieces of the other; a cut-up neither person wrote. Cascades carry words
  on down the lineage.
- **The wreck keeps talking** (built): fragments with words are heard as
  static at the stations, taking turns over everyone else's beacons, and
  appear in the feed. Crowding costs airtime, not only satellites.
- **The wreck falls silent as the sky heals** (built): "the wreck says"
  fades each piece as its fragment burns up.
- **An encounter** (built): both owners find the collision in Yours: who
  they met, what that person said, what the wreck says. The only way you
  meet a stranger here.
- **Thematic as well as causal** (built with the question, ADR 0018): two
  answers to the same day's question that collide are told as such.

Settled on the old questions: the connection is causal (and thematic only
through the question, which nobody judges); the filter runs on every
shard; fragments' words are one nullable column (`objects.words`).

## What Kessler is for

_Added 2026-10-06 as "A purpose" (three ideas Advay liked); decided and
fleshed out 2026-10-07 at his request (ADRs 0016–0018, proposed). The long
version for visitors is the Why page, `/why/`; the launchpad says it in
four lines._

The why has two halves. The app used to say only the second.

**For a visitor: why launch, why stay, why come back.**

1. **Say one thing to the people who are here.** 140 characters on a
   satellite, heard by whoever has the sky open each time it passes over a
   station, all at once. Not a feed you scroll alone: a moment shared with
   whoever is present.
2. **Be heard, counted.** Each beacon says how many different people have
   heard it ("heard by"), and nobody can raise their own. Being heard needs
   other people to be here at the same time.
3. **Listen.** The sky is also a radio. Your being here is everyone else's
   audience; a line passing over a station with nobody listening isn't
   heard at all.
4. **Answer the question.** One a day from the stations, a prompt to write
   to and a topic shared by everyone that day; tomorrow there's another.
5. **Decide what your words cost.** Every launch crowds a sky everyone
   shares; the low band is heard most and crowds fastest; a collision
   breaks your words into a stranger's and leaves them as static over
   everyone else's. Bringing yours down keeps the sky readable.
6. **Meet someone, the only way you can.** No chat, no replies: a
   collision is the only way your words ever touch a stranger's, and you
   find who you met in Yours.

**For the project: the argument.** Attention is a commons. A post costs
nothing to make and takes a little of a shared, finite thing (the room to
be heard), and nobody pays for that directly, so it's overused (Hardin
1968). Low orbit is the newest commons and fills the same way (Kessler and
Cour-Palais 1978). Kessler makes the cost physical: words take up orbit,
crowding makes collisions, and collisions turn words into noise made of
real people's words, torn out of context and mixed with a stranger's. No
rules to vote on and no moderator; what keeps the sky usable is what
everyone can see (who launched what, who's been heard, what each launch
went on to cost, traced through lineage) and what each person does with
their own satellites (Ostrom 1990).

The question it leaves each visitor with: **what's worth saying, if saying
it costs everyone a little?**

Settled from the old list of things to ponder:

- "Heard by" counts **people**: an operator, or a hashed cookie, once per
  satellite; tabs don't count twice; a new browser still does (ADR 0009's
  known cost). It's shown to everyone, on every beacon, since a social
  space's audience is public; the owner can't raise their own.
- **Debris takes airtime** by taking turns like a beacon, sized to its
  words; a cascade fills the stations with static until it burns up (hours
  in the low band). Watch whether that's too much once real people use it.
- **Questions** are a fixed list in the code for Advay to edit; beacons
  may ignore them (ticked by default).
- Left out still: a shared sky-health number on every screen.

## Open questions

Resolved 2026-10-04 (now in "Decisions so far"): C8 scope, overhead, launch
flow, beacon rules, launch limits, bands.

- **C9 (settled 2026-10-06):** the written decision is **who sees the
  blame** (every screen live, the catalogue, or only you; the answer itself
  goes in its record); **the server picks direction at random**, like
  height and phase; signing in on a device with its own live satellite
  **merges** it into the operator's record (no new launch until both are
  gone); a collision shows **both beacons as a couplet** on every screen
  and in the catalogue, and fragments carrying words can come later as a
  nullable column.
- **C9, tuned 2026-10-06 (ADR 0008):** a floor of 20 satellites and
  derelicts, topped up at most one every 10 minutes; 3 fragments per
  satellite, none from debris; a 2% chance a meeting; debris decays like
  everything else. Advay chose the gentler rate: 1 to 5 collisions an hour
  in a quiet sky, about half of satellites burning up before a hit.
- ~~**C9:** collision radius~~: settled in ADR 0008 (hit distance and a 2%
  chance a meeting), with the head-on chance tripled in ADR 0013 to keep
  collisions per hour once orbits slowed.
- **C10:** how fuel works, and whether it refills (moved with dodging;
  boosting needs none).
- ~~**C9:** exact cooldown length~~: replaced by a five-minute gap between
  launches (2026-10-06).
- ~~**Week 12 (or sooner):** whether to move the sky's rendering to
  Three.js~~: done in C9 (ADRs 0005 and 0006).
- **Before the final README:** the name (Kessler stays the working title).
- ~~**Open:** whether the catalogue shows owners' callsigns next to the
  debris they caused~~: yes, on every screen (ADR 0010).
- ~~**Before the C9 debris table:** how colliding beacons connect~~: a
  couplet; words on fragments later (see "Collisions that mean something").
- ~~**Open:** which of the purpose ideas to adopt~~: all three, with the
  wreck (ADRs 0016–0018, proposed; see "What Kessler is for").
- **Open (2026-10-07):** whether static should take full turns at the
  stations in a cascade, or less; whether to archive answers per question
  in the catalogue; whether Yours should tell you about an encounter the
  next time you visit (it lists them, but doesn't announce them).
- **Open:** seeing a burn-up on demand (see "Now and later").
