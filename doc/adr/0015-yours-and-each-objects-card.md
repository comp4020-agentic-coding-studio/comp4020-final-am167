# 0015. Your satellites are managed from "Yours" and from each one's card

**Status:** accepted (2026-10-10; proposed 2026-10-07). Supersedes where ADR 0011 put the
controls (the sky's station panel) and how ADR 0012 shows a history (a
panel over the sky, and a page of its own).

## Context

ADR 0011 put boosting and bringing down in the sky's station panel, for the
satellite the panel was talking about: whichever of yours was next over a
ground station. That was fine with one satellite each. Since launches went
to "any number, five minutes apart" (`PLAN.md`, "Launch limits"), most
people who come back have several up, and the panel's controls act on
whichever happens to pass next, which changes under your hand. Advay, after
playing with it (2026-10-07): it doesn't make sense when several of yours
are up; take it out of the sky page, and give "just me" a section of the
catalogue with the management in it.

ADR 0012 gave every object a history, opened in a panel over the sky and at
`/object/<id>/`. Advay: the object's own page is mostly empty space; make
it a pop-up dialog with all its info, and the boost and bring-down buttons
if it's yours.

## Options

**Where the controls go.**

- **Keep them in the station panel, with a choice of satellite.** A select
  or a row per satellite in a panel that is meant to be about beacons, and
  that has to fit over the sky on a laptop screen (it already sheds parts on
  short screens).
- **On each satellite's own card, and in a list of yours.** Every control
  is on one named satellite, so there's never a question of which. The card
  is the history (ADR 0012), opened wherever an object is: clicked in the
  sky, or named in the catalogue, the latest launches or another history.
  The list is a "Yours" view in the catalogue: every satellite of yours up,
  each with its controls, then your whole record.
- **A page of your own (`/me/`).** The same list, but another place in the
  nav, apart from the catalogue it mostly repeats.

**How a history opens.**

- **A panel over the sky, a page elsewhere** (as ADR 0012).
- **A dialog everywhere**, filled from the same fragment the panel used
  (`/object/<id>/panel`), with the page kept for links and for no
  JavaScript, laid out as the same card.

## Decision

**Controls live on each satellite's card and in "Yours"; the card is a
dialog everywhere.**

- **"Yours"** is a third view of the catalogue, beside "In orbit" and
  "Everything ever launched": `/catalogue/?show=mine`. It says who you're
  launching as (your handle, or this browser), lists each satellite of yours
  in orbit as a card (its beacon, which you always see; its height, its next
  pass and when it burns up, counting; boost and bring down, or why not),
  then your whole record as the catalogue's table.
- **Each object's card** is its history (ADR 0012) in a dialog. Any link to
  `/object/<id>/` on the sky or the catalogue opens it in place, and so does
  clicking an object in the sky. For your own live satellite it carries the
  same two forms. It stays open while the sky changes, and is asked for
  again when a collision, a burn-up or a manoeuvre could change it. On the
  sky it isn't modal: it sits beside the beacons, so the sky and the
  stations stay usable and clicking another object switches the card to
  it. Elsewhere it's modal and centred.
- `/object/<id>/` is the catalogue with that object's card open over it
  (the address stays the same), for a link opened on its own and for no
  JavaScript: the same pop-up as everywhere else, not a page of its own.
- **The station panel offers no controls.** It still says what yours is
  doing (next over which station, when it burns up), with a link to Yours.
- **The forms work without JavaScript**: each carries where it came from
  (`back`: `yours` or `object`, a fixed token, never a URL), and the server
  goes back there saying what happened (a thank-you for bringing one down,
  or why it was refused). Anything else goes back to Yours. With
  JavaScript they post in the background, as before, and the card and the
  list update in place.
- The launchpad still offers none: it's for launching.

## Consequences

- Every manoeuvre is on a satellite you named by clicking it, so a
  satellite passing over a station can't change what a button does.
- ADR 0011's rules are untouched: only the owner, a boost once, nothing
  while coming down or burning up, the database write checking it.
- Managing several satellites is one page, not a wait for each to pass.
- On a phone the sky's card is a sheet from the bottom, since the scene is
  only half the screen.
- The history panel's own code (focus going back to what opened it, a
  refresh not stealing focus, a slow answer to an old click dropped) moves
  into the dialog, shared by every page that has one.
- Testable over HTTP: the station panel has no manoeuvre forms; Yours lists
  only yours with their forms; an owner's card has them and a stranger's
  doesn't; a no-JavaScript post goes back to where it came from, and
  nowhere else.
