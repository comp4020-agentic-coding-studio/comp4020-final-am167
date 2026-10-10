# 0017. When two beacons collide, the wreck keeps both their words

**Status:** accepted (2026-10-10; proposed 2026-10-07). Builds on the couplet (ADR 0008, 0010) and
the nullable "words on fragments" that `PLAN.md` deferred ("Collisions that
mean something", 2026-10-06).

## Context

Advay asked on 2026-10-06 for colliding messages to mean something, to
have a connection. The marker raised the same thing. What was built for C9
is the couplet: a collision shows both beacons side by side, on every
screen, in the catalogue and in each history. Advay, 2026-10-07: that
hasn't met it; explore it properly and build something meaningful.

Why the couplet falls short: it frames a random pairing, then nothing
changes. Both lines are destroyed with their satellites, the fragments are
anonymous dots, and the two people never learn anything of each other
unless they happen to be watching. The collision is the one moment two
strangers' words touch in this app, and it passes without leaving a mark
on either.

The plan's open questions were whether the connection should be
**thematic** (the two lines relate) or **causal** (they're joined because
they hit), and noted that only the causal one can be done without the
server reading meaning into text. Since then, ADR 0016 made beacons things
people hear, with a feed, and made airtime at a station something beacons
share.

## Options

Explored with the agent; not exclusive.

- **The couplet** (built). Cheap, but a juxtaposition, not a connection.
- **Aim at a satellite** ("reply" launches onto a crossing orbit). The
  most direct connection, but it makes a collision something you choose,
  which breaks the argument (debris is a cost nobody meant to cause), and
  drifts towards declared connections (a classmate's Constellation).
  Rejected again.
- **Collide by meaning** (similar lines more likely to meet). The server
  would have to judge meaning, opaquely; it would feel like a trick.
- **The wreck keeps the words.** Each fragment carries a piece of both
  lines: a run of words from one, a run from the other. All of both lines
  survive, scattered across the fragments, each piece of one next to a
  piece of the other. Read in order, the wreck is a new text neither person
  wrote: a cut-up. A cascade carries it on: a fragment that destroys a
  third satellite leaves fragments that carry that satellite's words and
  the fragment's, so words travel down the lineage (ADR 0003) as text, not
  only as ids.
- **The wreck keeps talking.** A fragment that carries words is heard as
  it passes over a station, like a beacon but as **static**: broken pieces
  of two strangers' lines, taking a turn at the station like any beacon.
  So a crash doesn't only destroy two beacons; it puts noise into the
  stations, made of their words, that everyone has to hear around until
  the debris burns up. In a cascade the stations fill with static.
- **The wreck falls silent as the sky heals.** Each fragment's words leave
  the sky when it burns up, so the record of a collision shows its words
  going quiet one by one: the cut-up erodes as decay clears the orbit.
- **An encounter.** The two people whose satellites met each find it in
  Yours: who they met, what that person had said, and what the wreck says
  now. In Kessler, a collision is the only way you ever meet a stranger.

## Decision

**The wreck keeps both lines' words, keeps broadcasting them as static,
falls silent as it burns up, and each owner finds the encounter in
Yours.**

- **What a fragment carries.** At a collision, each fragment gets a shard:
  a run of words from one side and a run from the other, joined by " … ".
  Each side's line is cut into as many runs as there are fragments, in
  order, so every word survives once; one side's runs are dealt in order,
  the other's shuffled, and which comes first is drawn per fragment, all
  seeded by the two objects' ids, so a replay after a restart makes the
  same shards. A side's line is its beacon (a satellite), its own shard
  (debris), or its echo (a derelict: the last words of a satellite gone
  from the sky, picked when it's put up; ones up from before echoes get
  one as the server starts). If neither side has words, the fragments are
  silent. A shard is checked against the word
  filter (two clean lines can't spell anything run together, but it's
  checked anyway) and dropped if it fails.
- **Static.** A fragment with words is heard over the stations like a
  beacon: it's logged when someone's listening, and it appears in the feed
  (ADR 0016), styled as static, from whose collision. All the static over
  a station shares one turn between it (a fragment a cycle), so a crash
  costs every beacon there a share of the airtime without drowning them.
  Silent fragments stay silent, and a derelict never broadcasts its echo:
  only its wreck does.
- **What the wreck says.** A collision is told with its two beacons (the
  couplet) and with its wreck: every fragment's shard in order, the ones
  still up in full, the ones burned up faded. On the sky's collision card,
  in the catalogue's collisions, in the histories of the two that met, and
  in a fragment's own history ("what it says").
- **An encounter.** Yours lists each collision a satellite of yours was in:
  what it met, that side's line (or what the debris that destroyed it was
  carrying), and what the wreck says now.
- Stored as nullable columns: `objects.words` (a fragment's shard, a
  derelict's echo) and `objects.echo` (whose line it is). Nothing is
  worked out from meaning; the connection is causal, as the plan said it
  had to be.

## Consequences

- A collision changes the sky's text, not only its objects. The two lines
  are now joined for as long as the wreck flies, and in the record for
  good. Anyone can read the result, and its two authors find it waiting.
- Crowding now costs everyone airtime as well as satellites: a busy sky's
  stations are full of other people's broken words. That's the attention
  economy's noise made literal, and the commons argument (Hardin, Ostrom)
  made audible: the cost of one collision is heard by everyone.
- Debris is still nobody's; static has no owner to raise its count, and
  "heard by" for a fragment counts everyone who was listening.
- People will find their words in combinations they didn't choose. The
  filter runs on every shard, but it can't catch a meaning that only
  exists in the pairing. Accepted: the pairing is the point, and the
  record says which two lines it came from.
- Determinism holds: shards depend only on the ids and the lines, so
  stopping the server through a cascade still gives the same sky, now with
  the same words.
- Testable on the server: every word of both lines appears across the
  shards, in order within each side; the same collision gives the same
  shards; a derelict adds its echo; a cascade carries words on; fragments
  with words are heard over a station and fragments without aren't; a
  collision's wreck fades as its fragments burn up; each owner's encounter
  names the other side.
