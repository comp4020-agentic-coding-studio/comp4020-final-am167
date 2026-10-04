# Kessler

One low orbit, shared by everyone who visits. You launch a satellite and give
it a beacon: one line, shown to everyone watching each time the satellite
passes over the ground station. Nobody owns the sky, and every launch makes it
more crowded.

This is a first version (week 9). The cascade the app is named after comes
next.

## What good means here

Low orbit is a commons. Kessler and Cour-Palais (1978) showed that once enough
objects share an orbit, collisions make debris faster than drag clears it,
and the orbit becomes unusable for everyone. Hardin (1968) would call that
inevitable. Ostrom (1990) showed that commons survive when the people using
them can see the state of the resource and what each user takes from it. So
Kessler is good if:

1. **The sky is visibly shared.** Your launch shows up on every open screen
   within about a second, and everyone sees each satellite in the same place
   at the same moment.
2. **Wanting to be seen has a cost.** A beacon is only heard when its
   satellite crosses the station. Low orbits pass over every minute; high
   ones every eight. The catalogue never gives beacons away, so the only way
   to be heard more is to crowd the low band, which from week 10 is what
   makes collisions likely.
3. **What you do stays.** Your satellite is still yours when you come back.
   Every object's record is kept for good, so in later versions every piece
   of debris can be traced to the launches that made it.
4. **The rules are the same for everyone.** One live satellite each, a sky
   that holds at most 200, and a short beacon with no links. Nobody votes on
   the rules and nobody moderates; the only influence you have is over your
   own satellite.

## What is enforced and what is judged

Checked by the tests in `spec/`, against the running app:

- a visitor is an anonymous cookie, and two browsers are two people
- one live satellite per person; a second launch is refused
- beacons: at most 60 characters, no links, a small word filter that doesn't
  catch ordinary words like "sky"
- a launch reaches another open session within a second
- the live stream starts with the server's time and the current sky
- no one's id appears in a page, and beacons are shown as text, not markup
- launching works with JavaScript off

Judged, not tested: whether the trade-off in point 2 actually changes where
people launch, and whether the chart is readable to a stranger in a minute.
My crit pod reads this page, uses the app and tells me whether it lives up to
it; launch counts per band, logged from week 11, will answer the first
question with data.

## What I chose not to build

- **Accounts.** A stranger should launch in seconds. The cost is that one
  person with two browsers is two people.
- **A reset.** The sky will heal slowly through orbital decay, not be wiped.
- **Debris cleanup.** Nobody can undo a collision, which is the point.
- **Chat or voting.** Beacons are the only voice; governance only happens
  through what each person does with their own satellite.

## Sources

- D. J. Kessler and B. G. Cour-Palais, "Collision frequency of artificial
  satellites: the creation of a debris belt", *Journal of Geophysical
  Research*, 1978.
- G. Hardin, "The tragedy of the commons", *Science*, 1968.
- E. Ostrom, *Governing the Commons*, 1990.
- The 2009 Iridium 33 and Kosmos-2251 collision; the 2007 Fengyun-1C
  anti-satellite test.
- *Stuff in Space* (stuffin.space), as a visual reference.
