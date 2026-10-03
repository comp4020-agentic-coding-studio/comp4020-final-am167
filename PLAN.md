# Plan: Kessler (working title)

A planning snapshot, not the README. Details get fleshed out later; decisions
that are expensive to reverse go into `doc/adr/` once made. Any agent picking
this up: read this file, then `notes/log.md`, before planning or building.

## Status and next steps

_Last updated 2026-10-03._

- **Done:** idea chosen; the decisions below agreed with Advay. No code yet;
  the repo is still the placeholder (the Astro stack was set up then reverted,
  see `git log`).
- **Next, in order:**
  1. Resolve the open questions at the bottom of this file, one at a time
     with Advay (the week 8 lecture suggests the agent quiz the student: what
     counts as a person, what persists, how a change reaches everyone).
  2. Write the stack ADR (`doc/adr/0001-...`, Nygard format: title, status,
     context, options, decision, consequences) and set up the stack
     (`/comp4020:stack` installs the Astro default).
  3. Draft the first `README.md` (400–600 words; Advay drafts it, since
     writing that reads like agent output is marked down) and publish it at
     `/readme/`.
  4. Build the C8 slice (see "Crit thread").
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

## The altitude trade-off

| Band | Benefit | Cost |
|---|---|---|
| Low | Passes overhead often, so the beacon is read more | Drag brings it down fast; crowded |
| High | Lasts much longer | Rarely overhead; its debris lingers far longer |

Exact bands and decay rates are still open.

## Co-presence

- Launches, collisions and fragment clouds appear on every open screen at once.
- **Conjunction alerts** (likely the C9 decision): when two satellites are on a
  collision course, both owners are warned and either can spend limited fuel to
  dodge. If both are online, who moves? If an owner is offline, they can't
  dodge, so being absent makes you vulnerable. (Precedent: ESA moving Aeolus
  for a Starlink satellite in 2019.)

## The four marked decisions (first answers)

- **Who counts as a person:** an anonymous cookie with a callsign, one active
  satellite each. Opening more browsers gets you more satellites; that needs
  its own decision record.
- **What expires:** everything, through orbital decay, at rates set by altitude.
- **History:** a public catalogue of every object. Each fragment traces back to
  the collision that made it and who launched what was involved.
- **What we chose not to build:** debris cleanup, a reset, any channel to talk
  to other operators beyond beacons and alerts.

## Technical shape

- Stack per CLAUDE.md: server-rendered Astro, SQLite via Drizzle, SSE.
- Orbits are stored as elements plus a start time, so any object's position at
  any moment is a pure function of time.
- Collision checks run on the server. Fly can stop an idle machine, so on boot
  the server replays the time it missed in fixed steps and applies any
  collisions that fell in the gap. A restart and an uninterrupted run produce
  the same sky.
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

## Crit thread

- **C8 (week 9):** 2D chart, launch into a band with a beacon, orbits drawn
  from elements, server-side collisions making debris, SSE updates, first
  README at `/readme/`.
- **C9 (week 10):** conjunction alerts and dodging, plus orbital decay and
  deorbiting.
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

- Altitude bands, decay rates and collision radius, tuned so a marker sees
  something happen within ten minutes while the sky still lasts weeks.
- Launch limits: cooldowns, and what stops one person filling the sky.
- What "overhead" means in 2D: one shared viewing point, or one per visitor.
- Beacon length and moderation.
- How fuel works, and whether it refills.
- Name.
