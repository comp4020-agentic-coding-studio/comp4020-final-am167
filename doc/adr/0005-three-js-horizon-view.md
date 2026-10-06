# 0005. The sky is drawn with Three.js, as a horizon view over the station

**Status:** accepted (2026-10-07; proposed 2026-10-05)

## Context

In C8 the sky page drew a 2D canvas chart: the whole planet from above, every
orbit as a ring, the station at the top. It worked, but read as a diagram, not
as a sky. For C9 Advay sketched a different view: the planet's limb along the
bottom, a realistic star background, the three bands stacked over the
horizon, satellites crossing with a trail and a label, and the "Over the
station" panel floating over it. `PLAN.md` ("Later") had already flagged
Three.js for the striking version of the sky, with a decision record due when
it was adopted.

The simulation stays as it is: orbits are flat circles in one plane (`PLAN.md`,
"Dimension: 2D"; `src/lib/orbit.ts`), and positions are a pure function of
the server's clock (ADR 0004). Only the drawing changes.

## Options

- **Keep the 2D canvas and restyle it.** No new dependency and nothing new
  to load. A starfield, glow and airglow are all possible by hand, but slow to
  draw every frame and fiddly to make look right.
- **Three.js, horizon view, orthographic camera.** The orbit plane is the
  screen's plane, so the chart's maths carries over unchanged; Three.js gives
  shaders for the atmosphere and glow, cheap points for thousands of stars, and
  room for the collision effects planned for later. Costs a large chunk of
  JavaScript (Three.js is most of a ~650 kB minified, ~185 kB gzipped chunk)
  and needs WebGL.
- **Three.js, full 3D globe and inclined orbits.** The most striking, but it
  undoes the 2D simulation, makes "overhead" much harder to see and explain,
  and is heavier on a phone.

## Decision

**Draw the sky with Three.js, as a horizon view through an orthographic
camera; keep the simulation 2D.**

- The view is a fixed window on the limb around the station. Satellites rise
  on the left, cross the station's window (an amber wedge) and set on the
  right. Your own satellite gets a pointer at the left edge with a countdown
  to when it rises.
- **A button zooms out to the whole planet** (added 2026-10-05, after the
  first review showed most of the sky is out of view). The planet shrinks to
  the chart's own size while orbits keep their heights, so it's one
  continuous zoom, and the stars follow it with parallax, as a far-off sky. Zoomed out, every
  satellite, its trail and (in C9) every collision is in view.
- The planet is drawn six chart units across while orbits keep their heights
  above it, so the bands sit close over a gently curved horizon. The display
  is a mirror image of the chart's plane, so motion reads left to right.
- The Earth is stylised: a dark sphere, a rim glow, the green airglow line and
  coastlines baked from Natural Earth (`scripts/coastline.mjs`) around the
  station, which sits on Canberra.
- Labels are HTML over the canvas. Every satellite in view is named unless its
  label would overlap one already placed (yours first, then those overhead).
- Three.js loads on its own after the page works; the station panel and the
  catalogue never wait for it. Without WebGL or JavaScript the page says so and
  the catalogue still lists everything in orbit.

## Consequences

- Over the station, most of an orbit is out of view, so a sparse sky can look
  empty for a while. The zoom-out answers this, and it's where collisions
  elsewhere in the sky can be seen.
- The page is heavier: about 185 kB gzipped of JavaScript for the scene, plus
  the GPU work of drawing it. On a phone the scene is shorter and draws fewer
  stars.
- The canvas is still an image to a screen reader (`role="img"` with a live
  description). Everything it shows is also in the panel and the table.
- Collision bursts, debris and decay (C9) are drawn into the same scene; the
  flat geometry means debris fragments are points and trails like satellites.
- If the sim ever moves to inclined orbits, this record is superseded.
