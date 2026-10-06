# 0007. Orbital decay in closed form, ending in a scripted burn-up

**Status:** accepted (2026-10-06)

## Context

`PLAN.md` ("Ending") settled that nothing resets the sky: orbital decay pulls
everything down, low orbits fast and high ones slowly, so the sky heals over
time. ADR 0003 says objects leave the sky but their rows stay, with a fate of
`decayed` and the time it happened, and that a server stopped while things
fell must catch up on boot. ADR 0004 says positions are never sent: every
client works them out from the stored orbit and the server's clock.

Until now an orbit was a fixed radius and a fixed period, and each band had
its own period law, so two objects at the same height in different bands
moved at different speeds. With decay, objects fall through the bands, so a
band has to become a range of one continuous height rather than a shelf.

Advay also wanted the end of an orbit to be seen: a re-entry that looks real
and is worth watching.

## Options

- **Store a decaying radius and re-save the orbit now and then** (the server
  rewrites radius, phase and epoch every few minutes and broadcasts it).
  Simple maths, but every rewrite is an event, a restart has to replay the
  rewrites, and clients between rewrites drift.
- **Step a drag model numerically** on the server and the client. Realistic
  (drag grows exponentially as the air thickens), but every client has to
  integrate from each object's launch to now, and the steps have to match
  exactly for every screen to agree.
- **A decay law with a closed-form answer.** Pick a law whose radius and angle
  can both be written down for any time, so a position is still a pure
  function of the stored orbit and the clock. Less physical, but nothing
  new is stored or sent, and a restart needs no replay beyond marking what
  has burned up.

## Decision

**Decay in closed form, then a fixed, scripted plunge.**

- **One period for each height** (`periodAt` in `src/lib/orbit.ts`): the
  period grows as radius^3.39, fitted so the low band's middle comes round
  once a minute and the high band's every eight, as before. Everything at the
  same height moves together. The mid band's middle becomes 2.7 minutes (it
  was 3; the launchpad still says "every 3 minutes").
- **radius³ falls at one steady rate**, the same for every object, so an
  orbit falls slowly at first and faster as it gets lower. The rate is set so
  an orbit at the low band's middle lasts 4 hours; from the mid band's middle
  it lasts about 17 hours, from the high band's about 2 days. A launch can
  land anywhere in its band's reach, so the spread is wide: 1 to 8 hours in
  the low band, 9 to 27 hours in the mid, 31 hours to 3 days in the high, so
  nothing stays up more than about 3 days. (First set at radius^6 and a day
  for the low band, which let high orbits last up to four months: far too
  long for a sky meant to heal while people watch.)
  Integrating the angular speed (period law) against that fall gives the
  angle in closed form.
- **At 1.06 planet radii it starts a 30-second plunge**: it dives towards the
  ground and slows hard, its angular speed falling as (1 − 0.85s)³ over the
  plunge, and it has burned away at 1.005. That's when it leaves the sky.
- **Bands are ranges.** A height belongs to the band whose range it is in,
  and the ranges meet halfway between the old band edges (1.5 and 2.05), so
  every height from the ground up is in exactly one band. You still launch
  into a band; the counts on the sky page say where things are now.
- **The server marks burn-ups.** Before any read of the sky, and on a timer
  set for the next burn-up, every live object whose burn-up time has passed
  gets fate `decayed`, dated to the moment it burned up (worked out from its
  orbit, not when the check ran), and a `decay` event goes out on the stream.
  A server that was stopped catches up on its first request.
- **Heights are shown in kilometres** (`heightKm`): 2,000 km per planet
  radius, so the burn-up starts at 120 km, where real re-entries begin, and
  the bands are 400 to 800 km, 1,200 to 1,800 km and 2,400 to 3,200 km. The
  chart isn't drawn to that scale (the planet would be three times bigger).
  The catalogue shows each object's height and how fast it's falling, live.
- **Clients don't wait for the event.** Each one works out when every object
  plunges and burns up, so every screen sees the same burn-up at the same
  moment; the event only confirms it. A burned-up object stays in the scene
  for eight seconds while its wake fades, then goes.
- **The burn-up is drawn by `src/scripts/reentry.ts`**: a hot head with a
  bow-shock glow, a wake cooling from white through orange to red with a
  faint green train, a breakup into fragments that fall behind, sparks, and
  flares as each piece burns out. Fragments come from a generator seeded by
  the object's id, so every screen sees the same breakup.

## Consequences

- No schema change: the stored orbit (radius, phase, period, epoch) is now
  read as the orbit at its epoch, and its future follows from it.
  Satellites launched before this change start falling from their own
  launch time, so some already in the deployed sky will burn up at once.
- A launch now has a lifetime, shown on the launchpad as the band's spread
  ("burns up in 1 to 8 hours"), and your satellite's line on the sky page
  says when it will burn up, and whether it will reach the station first.
  Low stays the band that's heard most often, and now also the one that
  falls first.
- The decay rate is a constant in shared code, so it can't be overridden for
  a test without the server and clients disagreeing; the HTTP spec can't
  make an object burn up quickly. The maths has its own tests
  (`spec/decay.test.ts`), and the server's marking, catch-up and cooldown
  are tested against a throwaway database with the clock passed in
  (`spec/decay-server.test.ts`).
- Catching up happens on the first request after a restart, not at boot
  itself (ADR 0003 says "on boot"): nothing can see the sky before that
  request, so the difference doesn't show.
- **Nobody sees a burn-up on demand.** The shortest lifetime is hours and
  you get one satellite at a time, so a visitor only sees a re-entry if
  someone else's falls while they watch. "Sky now" always says what burns up
  next. Something happening within ten minutes of arriving (`PLAN.md`) is
  left to collisions.
- Most burn-ups happen out of the station's view (the horizon shows about 40°
  of the orbit), so the sky page's summary says what's burning and what
  burned up last.
- Debris from collisions (still to come) can reuse the same decay, or be
  given its own rate later (a lighter fragment falls faster), which would be
  a stored per-object factor and a new record.
- The physics is a toy: real decay is exponential in altitude and real
  plunges last minutes, not 30 seconds. The law is chosen to be watchable and
  computable, and `/kessler/` only claims that lower orbits fall sooner, with the app's own
  spreads.
