# 0010. Every screen names who caused a collision, as it happens

**Status:** accepted (2026-10-07; proposed 2026-10-06). The C9 decision
about how the app behaves with several people in it.

## Context

C9 asks for one decision about how the app behaves when several people use
it at once, decided by what `README.md` says good means. The app's argument
is that orbit is a commons: everyone launches to be seen, crowding is what
makes it risky, and the debris is a cost nobody pays directly.

With collisions (ADR 0008) and operators (ADR 0009), every collision and
every fragment can be traced to the satellites, callsigns and operators at
its root. Whether other people see that, and when, decides whether the cost
stays hidden or becomes something everyone watching shares.

## Options

- **Every screen, live.** When a collision happens, everyone with the sky
  open sees who was involved: both callsigns and their operators (or
  "launched without a handle"), and for debris, whose collision it came from. The
  catalogue keeps it.
- **The catalogue only.** Collisions show live, but anonymously ("two
  objects collided at 640 km"). Who caused what is there for whoever goes
  looking.
- **Only you.** You're told when your satellite or its debris causes harm;
  nobody else is. Private, no shaming, but the cost stays as hidden as it is
  in real orbit.

## Decision

**Every open screen names who was involved, the moment it happens.**

- The `collision` event carries, for each of the two objects, its callsign
  and operator handle (or "launched without a handle"). For a fragment, it carries
  the collision it came from and the operators at that collision's root.
- The sky page shows it as the couplet (ADR 0008) with the names under it,
  and "Sky now" keeps the latest few.
- The catalogue shows the same for every collision and fragment, kept
  forever (ADR 0003).
- **Both sides are named, neither is singled out.** Nobody aims at a
  collision; two objects in a crowded shell meet. The wording says "A and B
  collided", never "A hit B".
- Debris that hits something passes the blame back to its root: "debris from
  A and B's collision destroyed C".

## Consequences

- The cost becomes visible to everyone at once, which is the argument: you
  watch someone's choice of height make debris that falls on others. It
  also makes the commons social: people see who else is up there, by what
  they caused.
- It names people. Handles are pseudonyms and claiming one is optional (ADR
  0009), so nobody is named who didn't choose a name; callsigns, already
  public, are named for everyone.
- Staying unclaimed shields your handle but not your callsign, so blame
  can't be fully dodged by not signing in.
- Testable over HTTP: two sessions, one sees a collision named with the
  other's callsign and handle. The live part rides the existing SSE stream
  (ADR 0004).
- Rejected "only you" because it keeps the cost private, which is the
  failure the app is about; rejected "the catalogue only" because almost
  nobody goes looking, so in practice it's the same as hiding it.
