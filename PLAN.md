# Plan: Kessler (working title)

A planning snapshot, not the README. Details get fleshed out later; decisions
that are expensive to reverse go into `doc/adr/` once made. Any agent picking
this up: read this file, then `notes/log.md`, before planning or building.

## Status and next steps

_Last updated 2026-10-04._

- **Done:** idea chosen; the decisions below agreed with Advay; person,
  persistence and real-time settled ("Foundations"), each with a decision
  record in `doc/adr/` (0001–0004; 0002, the person, is still proposed).
  2026-10-04: the C8 open questions resolved (scope, overhead, launch flow,
  beacon rules, launch limits, bands); the rest deferred to C9 or later, see
  "Now and later". No code yet; the repo is still the placeholder (the Astro
  stack was set up then reverted, see `git log`).
- **C8 cutoff:** Tue 6 Oct 2026, 12:00 (moved from Monday for Labour Day).
- **Next, in order:**
  1. Set up the stack (`/comp4020:stack` installs the Astro default), per
     `doc/adr/0001-astro-and-sqlite-stack.md`.
  2. Draft the first `README.md` (400–600 words; Advay drafts it, since
     writing that reads like agent output is marked down) and publish it at
     `/readme/`.
  3. Build the C8 slice (see "Now and later").
  4. `PROCESS.md` overview and `reflections/crit-8.md`.
- **Never deploy, flip public or commit without Advay's say-so** (CLAUDE.md).

## The idea

One shared low orbit that everyone uses and nobody owns. Visitors launch
satellites into it, and every choice that makes sense on its own pushes the sky
towards a Kessler cascade: a collision makes debris, debris causes more
collisions, and eventually orbit is unusable for everyone.

The argument: space is the newest commons (Hardin 1968, Ostrom 1990), and the
attention economy is an old one. People launch to be seen, crowd the orbits
where they're seen most, and the debris is a cost nobody pays for directly.

## Core loop

1. **Launch.** One active satellite per person. Pick an altitude band and a
   callsign, and write a short beacon line.
2. **Be seen.** Every time your satellite passes over the shared viewing point,
   its beacon line shows to everyone watching.
3. **Share the sky.** Satellites and debris follow deterministic orbits.
4. **Collide.** Two objects that meet become a cloud of fragments, and those
   fragments can hit other objects.
5. **Deorbit (optional).** An owner can bring their own satellite down on
   purpose, giving up their visibility to leave the sky cleaner.

## Decisions so far

| Question | Decision |
|---|---|
| Incentive (why launch?) | **Beacon** first: your satellite carries one short line, shown to everyone when it passes overhead. **Some Light** too: each satellite leaves a faint coloured trail, so the sky is also a shared light picture that debris scratches grey. |
| Ending | **No reset; the sky decays.** Orbital decay slowly pulls everything down, satellites and debris alike. Low orbits decay fast, high orbits slowly, so the sky heals over time but a bad cascade takes a long while to clear. |
| Dimension | **2D** orbital chart: clearer, lighter on mobile, easier to make accessible than 3D. |
| Deorbiting | **Allowed** for your own satellite. Debris can't be cleaned up by anyone. |
| C8 scope (2026-10-04) | **Proof of life + SSE:** launch, persist, orbits drawn, launches appear live in other sessions. Collisions, debris, decay and deorbiting move to C9. The C8 brief only asks for proof of life ("the real-time layer and the polish can all wait"); SSE is kept to build the event plumbing early. |
| Overhead (2026-10-04) | **One shared ground station**, a fixed point on the planet. A beacon shows to everyone when its satellite crosses that arc, so everyone reads the same line at the same moment. The station is the launchpad. |
| Launch flow (2026-10-04) | The landing page is the **launchpad** with the launch form. Launching plays a rocket rising, then the camera **pans up** into the orbit view and the new satellite appears. C8 gets a simple version of the pan; the cinematic version is week 12 polish. Without JS the form still posts and redirects to the orbit view. |
| Beacon rules (2026-10-04) | **At most 60 characters, plain text, no URLs, a small word blocklist.** Shown in the sky while the satellite is live; the catalogue keeps it after. |
| Launch limits (2026-10-04) | **One live satellite per person, plus a cooldown** (starting at 10 minutes) after your satellite dies or is deorbited, so relaunching costs something. |
| Bands (2026-10-04) | **Three bands (low, mid, high) with jitter:** you pick a band, the server picks a random radius and phase inside it, so orbits aren't identical. |

## The altitude trade-off

| Band | Benefit | Cost |
|---|---|---|
| Low | Passes overhead often, so the beacon is read more | Drag brings it down fast; crowded |
| High | Lasts much longer | Rarely overhead; its debris lingers far longer |

Bands are chosen (three, with jitter; see the table above). Starting values,
in units of the planet's radius, to tune once the sim runs: low r 1.2–1.4,
period about 1 minute; mid r 1.6–1.9, about 3 minutes; high r 2.2–2.6, about 8
minutes. Decay rates are set in C9.

## Co-presence

- Launches, collisions and fragment clouds appear on every open screen at once.
- **Conjunction alerts** (likely the C9 decision): when two satellites are on a
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
| What counts as a person | An anonymous cookie, one active satellite each (**proposed**, may change) | `0002-a-person-is-an-anonymous-cookie.md` |
| What persists | The sky decays, every object's record stays forever | `0003-the-sky-decays-the-record-stays.md` |
| How a change reaches everyone | SSE events; the server's clock is the only clock | `0004-server-sent-events-and-one-clock.md` |

### What counts as a person

_Proposed, not final: the working assumption for C8, likely to be revisited._

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
- Open: beacon text is kept forever, so it needs a rule (length, moderation,
  whether a decayed satellite's beacon is still shown).

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
- **Visibility:** open. Whether the catalogue shows owners' callsigns next to
  the debris they caused is a decision to make.
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
- One active satellite per person; dodging uses fuel; only the owner can
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

- **C9 (week 10):** server-side collisions making debris, boot-time replay of
  missed time, orbital decay, deorbiting your own satellite (and the
  cooldown taking effect), conjunction alerts and dodging with fuel. Decide
  the deferred tuning (below) with the sim running.
- **C10 (week 11):** server-side logs as evidence (launches per band,
  collisions, dodges, deorbits), and the catalogue's lineage.
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

## Open questions

Resolved 2026-10-04 (now in "Decisions so far"): C8 scope, overhead, launch
flow, beacon rules, launch limits, bands.

- **C9:** decay rates and collision radius, tuned so a marker sees something
  happen within ten minutes while the sky still lasts weeks. Exact band
  numbers confirmed then too.
- **C9:** how fuel works, and whether it refills.
- **C9:** exact cooldown length (10 minutes is the starting value).
- **Before the final README:** the name (Kessler stays the working title).
- **Open:** whether the catalogue shows owners' callsigns next to the debris
  they caused.
