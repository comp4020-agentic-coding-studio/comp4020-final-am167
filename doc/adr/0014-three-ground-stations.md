# 0014. Three ground stations, and the whole sky first

**Status:** accepted (2026-10-07; proposed 2026-10-07). Supersedes `PLAN.md`'s "one shared
ground station" (2026-10-04); of 0005, the horizon over the station as the
view the sky opens on; and every "the station" in 0007 (what a satellite
reaches before it burns up) and 0008 (the staged collision meets over
Canberra).

## Context

A beacon is heard when its satellite passes over the ground station, a
fixed point on the planet, and everyone reads the same line at the same
moment (`PLAN.md`, "Overhead"). The sky page opened on the horizon over
that station (ADR 0005), with a button out to the whole planet.

Two things pushed on that. Slowing the orbits (ADR 0013) makes passes
three times rarer, so one station would hear a low satellite every three
minutes instead of every minute. And Advay wanted the beacons to be the
focus of the page, not the scene; the horizon view put most of the sky,
and most collisions, out of sight.

NASA's Deep Space Network has three stations, at Goldstone, Madrid and
Canberra, spread round the planet so a spacecraft is always in view of
one. Canberra is already the station, and the launchpad sits on it.

## Options

- **Three stations, each its own horizon view**, picked by the viewer.
  Each person hears a third of the beacons, at different moments: the
  shared moment is gone.
- **Three stations, all heard by everyone**, with the whole sky as the
  view that shows all three; a horizon view over any one of them on
  request.
- **Keep one station; widen its window.** Simple, but a slower sky would
  be heard less often, and the horizon still hides most of the sky.
- **Drop the 3D scene and show only the beacons.** The beacons would be
  the focus, but the cascade, the other half of the app, would be
  invisible.

## Decision

**Three ground stations, at the Deep Space Network's sites, all heard by
everyone. The sky opens on the whole planet; the horizon over any station
is one click away.**

- **Where they are.** The chart is one flat orbit plane (`PLAN.md`,
  "Dimension"), and three points on a globe don't lie on one great circle.
  These three come close: the great circle with its pole at 41.75°N,
  118.25°E passes within 8° of all of them. The chart's plane is that
  circle, and each station sits where its site projects onto it: Canberra
  at the top (90°, as before), Goldstone at −23° and Madrid at −105°. The
  gaps are uneven (113°, 82° and 165°), as the real sites' are; it's a
  stylised planet, but a real network. The coastlines are baked in the
  same frame (`scripts/coastline.mjs`), so each station sits by its own
  coast (Canberra and Madrid are 7–8° off the plane, so their dots sit on
  the limb a little away from the site itself).
- **Every station is heard by everyone.** Each has a 24° window, as the
  one station had. A satellite in any window is overhead: its beacon is
  shown, its dot and label turn amber. Together the windows cover a fifth
  of each lap; one station covered a fifteenth.
- **The panel is the beacons.** "Over the station" becomes "Beacons": a
  row for each station with what it hears now, in larger type, and when
  nothing is overhead there, which satellite is next and when. More than
  one over a station at once take turns, five seconds each, by the
  server's clock so every screen shows the same one. The panel keeps its
  size; on a phone a row has room for three lines of beacon.
- **The sky opens on the whole planet**, with the three windows drawn and
  named. Buttons over the scene switch to the horizon over Canberra,
  Goldstone or Madrid: the same zoom as before, turned so that station is
  at the top. Collisions out of view are still followed in the horizon
  view, and the view turns back to the chosen station after.
- **Arriving from a launch** opens on the horizon over Canberra, where the
  launch's camera ends (ADR 0006), so the hand-off is still one shot.
- **The staged collision** (ADR 0008) meets over a station picked at
  random, not always Canberra.

## Consequences

- "The station" becomes "a ground station" in the copy: the launchpad,
  the Kessler page, the catalogue and the README.
- A satellite's line on the sky page names the station it's over or will
  reach next ("is over Goldstone now", "is next over Madrid in 42 s").
- With the whole planet as the first view, the page is busier on arrival,
  and labels have less room; the horizon view is where a pass reads best,
  and it stays one click away.
- The uneven gaps mean a satellite crossing the 165° gap from Madrid to
  Canberra is silent for longer than elsewhere. Phases are random, so it
  costs nobody more than anyone else.
- A future "airtime" mechanic (`PLAN.md`, "A purpose") gets its slots for
  free: three stations, three things heard at once.
- If the sim ever moves to inclined orbits, this and 0005 are both
  superseded.
