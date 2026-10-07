# 0016. A beacon is heard by people, and the sky keeps a log of what was heard

**Status:** proposed (2026-10-07). Supersedes the beacon rules' 60
characters (`PLAN.md`, "Beacon rules", 2026-10-04) and, in part, ADR 0012's
rule that a flying satellite's beacon is withheld from its history.

## Context

Advay, after playing with the app (2026-10-07): it's starting to feel less
like a unique, thought-provoking social thing and more like a web app
visualising Kessler syndrome. He asked for longer beacons, shown better,
more like a social app, and for the purpose (the "why") to be fleshed out a
lot more.

The beacon was meant to be the point: you launch to be heard. But in the
app a beacon was a line of small type in a corner panel, gone the moment
its satellite left a station's window, and nothing said whether anyone had
been there to read it. Everything else on the sky page (the planet, the
orbits, the collisions, the counts) is about the physics. The people were
only in the callsigns.

Three things were missing for the beacons to carry the app:

- **Room to say something.** At 60 characters a beacon is a slogan. People
  have more to say than that, and the sky page has been reworked since
  (ADR 0013 slowed the orbits so a low beacon is overhead for about 12
  seconds, long enough to read a few lines).
- **An audience you can see.** "Be seen" only means something if someone
  sees. The server knows who has the sky open (their event streams), so it
  can say who was there when a beacon passed over.
- **A place to read them.** A social app is a stream of what people said,
  newest first, with who said it and who heard it.

`PLAN.md`'s "A purpose" had the first sketch of this: "Be heard, and count
it" (a heard-by count), with the worry that one person with many tabs
inflates it.

## Options

**How long a beacon is.**

- **60** (as it was): a slogan.
- **140**: a thought, readable in the 12 seconds a low satellite is
  overhead. The old limit of the attention economy's best-known stream.
- **280 or more**: longer than anyone can read in a pass; the station would
  have to page through it.

**What "heard" counts.**

- **Sessions** (open streams): a person with three tabs is three.
- **People**: each person (cookie, or operator if signed in) once, however
  many tabs. A new browser is still a new person (ADR 0009's known cost).
- **Passes**: how many times it went over a station, listened to or not.

**Where beacons are read.**

- **Only at the stations, live** (as it was).
- **A log of what was heard**: every time a beacon passes over a station
  while someone is listening, it's logged, and the sky page shows the log
  as a feed beside the sky, each beacon once, latest first.

## Decision

**140 characters; a beacon is heard by the people listening when it passes
over a station; the sky keeps a log of what was heard, shown as a feed.**

- **A beacon is at most 140 characters**, with the same rules (plain text,
  no links, the word filter). The stations give each beacon overhead a turn
  long enough to read it (longer lines get longer turns, between 4 and 10
  seconds), by the server's clock, so every screen still shows the same one.
- **Listening** is having the sky open: its event stream. The server
  counts **people**, not tabs: each listener is their operator if signed in,
  otherwise a one-way hash of their cookie (the cookie itself is never
  stored again). The sky page says how many are listening now.
- **Hearing.** Every second the server looks at what came into a station's
  window since its last look. A pass while at least one person is listening
  is a **transmission**: logged with the station, the time and how many
  were listening. Each listener who isn't the satellite's own owner is
  recorded as having heard it, once per satellite, so **"heard by"** is the
  number of different people who were there for at least one of its passes.
  A pass with nobody listening isn't heard, and isn't logged. Everyone is
  told (`heard`).
- **The feed.** The sky page has a column (under the sky on a phone): the
  three stations, live, as before, and under them **Heard**: each beacon
  the stations have picked up, latest pass first, as a card: who launched
  it (handle, or none), the line, which station heard it last and when,
  how many people have heard it and over how many passes. A new pass moves
  its card to the top, live. It's rendered by the server too, so it reads
  without JavaScript.
- **A history shows a beacon once it has been heard** (or always, to its
  owner, as before). Until its first transmission, a flying satellite's
  line is withheld, as ADR 0012 said; after it, it's in the log anyway. A
  history and a satellite's card in Yours say how many people heard it.
- **The altitude trade-off moves from visibility to audience.** A low
  satellite passes a station every minute or so, so it's heard more often,
  by more of the people who come and go, and keeps coming back to the top
  of the feed; a high one may pass once while you're watching. Crowding the
  low band is still the way to be heard most, and still what makes
  collisions likely.

## Consequences

- The page now has people on it: who said what, who heard it, how many are
  here now. Being online at the same time as someone matters: you're their
  audience, and they're yours.
- "Heard by" is a score, and scores get gamed: one person with two browsers
  counts twice (accepted, as ADR 0009 accepts it), and nobody can raise
  their own count, since the owner isn't counted. It counts people who had
  the page open, not people who read the line.
- Storage grows only while people listen: one row per pass heard, one per
  new listener per satellite. At a busy hour (20 satellites, someone always
  watching) that's about 30,000 passes a day, a few megabytes; nothing is
  stored while nobody's there.
- The server does a little work every second while anyone is listening (a
  closed-form check of each satellite against three windows); none while
  nobody is.
- A beacon that's been heard is public in the feed while its satellite still
  flies. The station is no longer the only place a live beacon is read,
  but it's the only place it's heard: a beacon enters the log only by
  passing over one while someone's there.
- Testable on the server against throwaway databases with the clock passed
  in: a pass with listeners is logged, the owner isn't counted, the same
  person twice counts once, a pass with nobody listening isn't logged, a
  satellite that burns up first is never heard. Over HTTP: the beacon
  limit, the feed and the listening count on the sky page, and a history
  showing a beacon once it's been heard.
