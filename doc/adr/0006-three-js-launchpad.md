# 0006. The launchpad is a Three.js scene, and the launch hands off to the sky

**Status:** proposed (2026-10-06)

## Context

The launchpad (`/`) drew its rocket as an SVG beside the form, and launching
slid the rocket up and the dusk gradient down for 2.4 seconds before going to
the sky page. `PLAN.md` ("Launch flow") always meant the launch to become
cinematic later. ADR 0005 moved the sky to Three.js. Advay liked the
launchpad's layout but wanted it more striking, and the launch more
realistic and more of a piece with the sky it leads to.

## Options

- **Keep the SVG and animate it harder** (CSS or canvas 2D): no new weight on
  the first page a stranger sees, but smoke, light and a camera that moves in
  depth are hard to make convincing by hand.
- **A Three.js scene with a perspective camera.** Real lighting on the rocket
  and tower, a particle ground cloud, and a camera that can follow the rocket
  up and pull back to the planet. Puts Three.js (about 140 kB gzipped) on the
  landing page, and needs WebGL.
- **A pre-rendered video of the launch.** Looks best for the least runtime
  work, but is heavy, can't use the person's callsign or match the live sky,
  and is the same every time.

## Decision

**The launchpad is a Three.js scene behind the unchanged form, with a
perspective camera.**

- The scene is dusk at the pad: a lit rocket by a lattice tower, two
  searchlights, ridges of hills against the afterglow, the stars the sky page
  shows. It is framed from the page's layout (between the intro and the form
  on a desktop, beside the intro on a phone), so the layout stays as it was.
- The pad stands on top of a planet, so the ground the camera starts on is
  the limb it ends looking at. Launching plays ignition and a ground cloud,
  liftoff, a gravity turn eastward (left to right, as satellites cross the
  sky page), a plume that lights up once it rises into sunlight, and a camera
  pull-back to a view of the limb like the sky page's. It fades to the sky
  page's dark, and the sky page fades in from it. A readout shows the
  callsign, the band and the flight's time, altitude and speed.
- It takes about seven seconds, so there is a skip button (and Escape).
- The perspective camera doesn't contradict ADR 0005: that record is about the
  sky chart, which stays orthographic and 2D. The launchpad is a picture of a
  place, not a chart.
- Three.js loads after the form works and is cached for the sky page, which
  uses the same chunk. Without JavaScript the form posts as before; without
  WebGL the SVG rocket and its CSS launch stay; with reduced motion the scene
  is still and a launch goes straight to the sky.

## Consequences

- The landing page now downloads Three.js (about 140 kB gzipped) plus the
  scene (about 10 kB). The form never waits for it.
- The scene renders every frame while the launchpad is open, which costs
  battery on a phone. It stops when the tab is hidden.
- Launching takes longer: about seven seconds instead of 2.4, skippable.
- The animation's numbers (altitude, speed) are dressed up, not simulated;
  the satellite's real orbit is only decided by the server.
