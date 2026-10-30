# 0026. The sky as a radio, off until you turn it on

**Status:** rejected (2026-10-31; Advay: "not liking this sound stuff -
lets scrap it"). Built twice, heard, and removed; none of it is in the
app. Kept as the record of what was tried and why it went.

## Context

Kessler says the sky is a radio (ADR 0016): beacons are "heard" over three
ground stations, and a collision's fragments are "static" (ADR 0017). But
the page is silent; hearing is only a word. Sound could make the cost of a
cascade felt rather than read.

Sound on a web page is also an imposition. Browsers block audio until a
person interacts, people open the sky in a lecture or a library, and a
page that starts making noise is a page that gets closed. Advay
(2026-10-31): the radio "should default to disabled/off and must be
enabled by the user".

A first version keyed each callsign in Morse on a pure tone per station
(600, 700 and 820 Hz), ran a steady hiss for the static and hit each
collision with a noise burst and a 35 to 70 Hz thump. Advay heard it and
found it "spooky and disturbing". Three adversarial reviews (2026-10-31:
sound design, a first-time visitor, a marker weighing scope) agreed why:
the clear sky already sounded bad, so debris had nothing to spoil. The
argument needs a contrast, a shared thing worth hearing that a cascade
ruins. They also found the station tones clashing, nobody able to read the
Morse, a beacon chiming nearly every second, the hiss tiring and out of
step with the screen, the collision a startle (loudest by far, an instant
attack and a sub-bass thud) and nothing stopping it all from clipping.

## Options

- **Leave it silent.** The words carry it, as now.
- **Sound on by default, a mute button.** Browsers would block it until the
  first click anyway, and the first click then makes noise nobody asked for.
- **Sound off, a button to turn it on, never remembered.** Every visit
  starts silent; a person who wants it turns it on for this visit.
- **Off by default, remembered once turned on** (for the visit, as a
  reviewer suggested, or longer). Convenient, but a page could then start
  making sound the person didn't choose on that page.

## Decision

The third. A **Sound** button in the Beacons box, off on every page load
(`aria-pressed="false"`), shown only with JavaScript (without it there's
nothing to hear). Nothing is made, not even an `AudioContext`, until it is
pressed, and the choice isn't stored anywhere, so a reload or another visit
is silent again. Pressing it again turns it off.

What it plays, made in the browser with Web Audio, no sound files
(`src/lib/radio.ts` for the notes, pacing and levels; `src/scripts/radio.ts`
for the sound):

- **A beacon coming on air:** a chime of two or three notes, the same for
  the same callsign every time, all from one pentatonic scale (D E F# A B)
  so overlapping chimes never clash; low at Canberra, middling at
  Goldstone, high at Madrid. A soft attack, a 1.2 s ring, a little room.
  That station's row lights while it rings, so the sound points at what
  it's about.
- **Not every beacon:** a station chimes at most every 6 s, any two chimes
  are 1.5 s apart, and the same callsign isn't chimed again at a station
  for 15 s. One that comes too soon is skipped, not queued, and its row
  doesn't light.
- **The static:** fragments overhead make the beacons worse, not a sound of
  their own. The chimes grow duller with each fragment, and quiet clicks
  crackle over them, more often with each, both to a cap. A clear sky is
  clean; a cascade is heard as everyone else's words breaking up.
- **A collision:** a short soft knock, then the two satellites' chimes
  sounding together and falling as they dull. No thud, and no louder than
  a chime. At most one a second: a cascade can set off several within half
  a second.
- **The mix:** a compressor before the output, so a cascade at once can't
  clip, and a quiet master level (0.35).

While it's on, the note under the Beacons heading says what the sounds
are. Turning it on plays what's on air at the first station that has a
beacon up, so it isn't silent until the next turn. A hidden tab suspends
the sound and a shown one resumes it.

## Why it was rejected

The second version was built as decided above and passed its tests
(`spec/radio.test.ts`: the scale, the pacing, the static's caps, off until
pressed, nothing stored; each rule broken to watch it go red). Advay listened
to it on the sky and still didn't like it. Tests could say the sound kept its
rules; only listening could say whether it was worth hearing. Sound is off the
spec's list and unasked for by anyone who's used the app, so the code, its
tests and the README line were removed rather than tuned a third time.

## Consequences, had it shipped

- Which beacon is on air, and when, is the same on every screen (the
  server's clock, ADR 0014), but **which ones chime isn't**: the pacing
  counts from when each person turned the sound on, so two people listening
  may hear different chimes from the same sky. A row lights only for a
  chime actually played.
- Nothing is sent to the server; whether someone has sound on isn't
  recorded or logged.
- A visitor who wants sound presses the button on every page load,
  including coming back to the sky from the catalogue. That's the cost of
  never surprising anyone.
- Nothing is told by sound alone: everything heard is on screen too.
  Screen readers announce the station rows (`aria-live`), and chimes play
  over them, but only for someone who turned the sound on.
- On iPhones, Web Audio follows the silent switch, so Sound can be on and
  silent.
- Tested: the button is off and hidden in the served page
  (`spec/sky.test.ts`); the toggle starts off, makes no audio until
  pressed, stores nothing and reports which beacons chimed
  (`spec/radio.test.ts`); the chimes' scale, registers and sameness, the
  pacing, and the static's crackle and muffling, each to a cap
  (`spec/radio.test.ts`).
