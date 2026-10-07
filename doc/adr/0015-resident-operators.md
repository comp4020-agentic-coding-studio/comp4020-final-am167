# 0015. Resident operators launch on a schedule

**Status:** proposed (2026-10-07).

## Context

The sky only has satellites when people launch them. Most of the hours
nobody is on, so a visitor (or a marker) usually arrives to a sky of
derelicts and debris, a catalogue whose latest launch is hours old and
beacon panels with little to hear. The derelict floor (ADR 0008) gives
collisions something to hit, but derelicts are silent: nothing in the sky
says anything, and nothing is launched while you watch.

Advay asked for launches seeded in every hour, real-looking ones from a
varied cast of launchers, so the site feels active.

Real orbit is mostly launched by operators like these: imaging and
communications companies, weather and navigation services, universities,
radio clubs, the odd artwork and memorial. Some of them flying in the
shared sky fits the argument: the commons isn't only people like you.

## Options

- **Leave it to people and derelicts.** Honest and simple, but the sky is
  quiet most of the time, which is what prompted this.
- **More derelicts.** Still silent, and more of them raises the collision
  rate ADR 0008 tuned.
- **Fake people:** anonymous launches indistinguishable from a person's.
  Livens the sky the same, but the record would then pass off the server's
  launches as people's, to visitors and to whoever marks the app.
- **Resident operators:** a fixed cast with handles, launching on a
  schedule, whose records say plainly that they're residents, not people.
- **Resident operators, undisclosed:** the same cast, with nothing on the
  page saying they aren't people.

## Decision

**Resident operators, undisclosed for now** (Advay, 2026-10-07: he may
add the disclosure back later), in `src/lib/residents.ts`:

- **A cast of sixteen**, each with its own handle, bands, callsigns and
  lines: an imaging company, a comms constellation, a weather service, a
  navigation service, an ocean monitor, space physicists, a seed bank, a
  student CubeSat lab, a radio club, a primary school, an art collective, an
  advertiser, a memorial and three hobbyists. Invented names, none of a
  real organisation. Those that want to be heard fly low; the memorial
  flies high, to last. Their callsigns and lines pass the same rules as a
  person's launch (`readLaunch`).
- **A schedule that is a pure function of the clock.** Each hour, a
  generator seeded by the hour picks how many launch (Poisson, about three
  an hour; some hours none), who (each at most once an hour), when, into
  which band, with which callsign and line, and the orbit's seed. Numbered
  callsigns take a serial that goes up by one each hour, so a resident
  doesn't reuse one within its range. Every server agrees on the schedule.
- **Launched like anyone's satellite**, as `kind = "satellite"` with the
  resident's operator, so they're heard over the stations, collide, leave
  debris and are named in the blame (ADR 0010) like anyone's. Their
  operator rows carry a new `resident` flag (migration
  `0005_resident_operators`): nobody can sign in as one (no passphrase),
  and their handles are taken, so nobody can pose as one. A handle a person
  claimed first stays theirs, and that resident never launches.
- **Run in the catch-up**, like collisions and burn-ups (ADR 0004, 0008):
  `settle` launches each one that has come due, at the time it was due,
  between the collisions before and after it, so ids follow the order
  things happened and a server that was stopped ends with the same sky as
  one that ran (a collision's outcome is drawn from its objects' ids). A
  fresh or long-stopped server launches what it missed up to six hours
  back, so the record looks lived-in from the first visit. A launch is
  never made twice.
- **Limited**, so they never crowd anyone out: at most 20 of theirs up at
  once (the derelict floor, which counts them, so in a quiet sky they take
  the derelicts' place), and none while the sky is half full (`SKY_CAP`).
  `RESIDENTS` (launches an hour, 0 for none) and `RESIDENT_CAP` override
  them.
- **Not disclosed, for now.** On the sky, in the catalogue and in each
  object's record they look like anyone's. The record knows
  (`History.resident`), so saying so later is one line in
  `src/components/ObjectHistory.astro`; a first draft did, and was taken
  out at Advay's call.

## Consequences

- The sky has something launching and something to hear at any hour, and
  the catalogue a varied history from the first visit.
- Collisions come more often in a quiet sky: simulated over three days with
  people's launches held at none, about 2.7 an hour with residents against
  1.1 without (residents settle at about 17 up and the derelicts fall to
  about 5; the cap holds launches to about 1.6 an hour). Still inside the
  1 to 5 an hour Advay chose for a quiet sky (ADR 0008). Re-check when the
  tuning changes.
- Blame lands on residents too, so a person's satellite can be destroyed
  by a resident's debris and the record names the resident.
- The app is less purely a record of what people did, and nothing on the
  page says which satellites aren't people's. Activity a marker sees may be
  the server's, not other visitors'. `README.md` should say so when it's
  next rewritten, since it's what the app is marked on.
- The server tests that need an exact sky set `RESIDENTS=0`, as they set
  `DERELICTS=0`. The HTTP spec runs against an app with residents on.
- A restart and an uninterrupted run agree only while nothing else random
  happens: derelicts are still placed at random (ADR 0008).
