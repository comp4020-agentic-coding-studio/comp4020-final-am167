# 0022. Who may see and change what

**Status:** accepted (2026-10-13; Advay: "adr is approved"). Gathers rules already decided in ADRs
0009, 0010, 0011, 0012, 0015, 0016 and 0021 into one place, and changes
none of them.

## Context

Crit 10 asks that "what each person may see and change is checked on the
server, and that decision is written down in the repo with why". At the
crit, two people use the deployed app from separate browsers. If one of
them can change what should be the other's, that's the finding.

The rules exist, but they're spread across the records that introduced
each feature. A person is a cookie, or an operator they've claimed (0009).
Only an owner can deorbit or boost (0011). Every screen names who was
involved in a collision (0010). A live beacon is shown only over a station,
or to its owner (0012, 0016). Nobody can sign in as an extra (0021). A
reader would have to put that together themselves, and nothing said in one
place what the server refuses.

## Options

1. **Leave it in the records that made each rule**, and point at them from
   the crit's reflection.
2. **One record that states the whole policy**, linking back to those
   records for detail.

## Decision

**Option 2.** Everything about the sky is public, and only you can act on
what's yours.

That's the argument (`PLAN.md`, "The idea"). A commons only works when
everyone can see what's in it and who put it there, so seeing is open:
every satellite, every collision, the names behind it, and the record
forever. Changing is not. You can add to the sky, and you can take back or
extend only what you launched. Nobody can remove someone else's satellite,
because that would turn a shared cost into an attack.

Every rule under "Changing" is checked by the server on each request. The
pages only mirror it (a stranger is shown no controls), so a forged request
is refused the same way. Under "Seeing", what the server never sends is
marked as such; one row is a display rule, and says so.

### Who you are

You're the person cookie (`kessler_person`, `httpOnly`, ADR 0009), or the
operator that cookie is signed in as. A satellite belongs to its operator
once it has one, otherwise to the cookie that launched it (`isOwnedBy` in
`src/lib/sky.ts`). Only a cookie the server made is anyone: the middleware
takes a `kessler_person` only if it's shaped like the random UUIDs it
hands out, and gives anything else a new one. That check is all that keeps someone from presenting an extra's
owner (`extra:<key>`, with the keys in the repo) as their cookie, so it
stays strict.

### Changing

| Action | Who may | What the server refuses, and why |
|---|---|---|
| Launch | Anyone, with no sign-up | A second launch within a minute of your last, counted per operator when signed in so two devices don't double it. A full sky (`SKY_CAP`). A callsign or beacon that breaks the rules (`src/lib/launch.ts`): beacons are kept forever, so no links, control characters or blocked words (anything else is shown as text, never as markup). |
| Deorbit | The owner only | `not-yours`: anyone else's, including the extras' and the derelicts'. Also `coming-down` and `burning`. Bringing a satellite down is a choice about your own launch, not a weapon. |
| Boost | The owner only | `not-yours`, as for deorbit. Also `no-fuel` (one boost each, enforced in the database write, so two devices asking at once still get one) and `top-band`. |
| Claim a handle | Anyone not signed in | Claiming while signed in. A handle that's taken (whatever its case), the wrong length, other than letters, digits, `-` and `_`, or with a blocked word: handles are public on every collision. A passphrase under 8 or over 200 characters. Too many claims from one address in an hour, and too many hashing at once ("busy"), so a flood can't stall the sky. Claiming makes this device's satellites the operator's: you can only give away your own. |
| Sign in | Anyone who knows the passphrase | A wrong passphrase, with the same answer as an unknown handle, so sign-in tells a guesser nothing (handles are public anyway, in the catalogue). Five wrong tries from one address on one handle, then a 30-second wait; other addresses aren't locked out. Any extra's handle: they have no passphrase anyone knows. Signing in merges this device's satellites into the operator's, as claiming does. |
| Sign out | Yourself | Nothing. The device becomes a new anonymous person, and what it launched stays the operator's, out of the device's reach. Done on a device that wasn't signed in, it leaves that device's satellites with the old cookie, out of reach for good; only you can do that to yourself. |
| Be counted as listening | Anyone with the sky open | Nothing beyond ADR 0016: a stream counts only from a browser that has loaded a page here. Being here is how someone else's beacon is heard, so one person with many browsers can raise others' counts; it's accepted there, since it can't take anything away. Opening the sky also brings the next staged collision sooner (ADR 0019), for everyone. |

Every form post from another site is refused (Astro's same-origin check,
403), so another page can't make your browser act for you. Claiming or
signing in gives the device a new cookie, so a cookie someone saw before
can't follow it into the operator.

Nobody can edit or delete anything after the fact: callsigns, beacons,
handles, collisions and the record of who launched what. The record staying
is the point (ADR 0003).

### Seeing

| What | Who sees it | Why |
|---|---|---|
| Every object in the sky, its orbit, band, callsign and fate | Everyone | It's one shared sky. |
| Who launched it (a handle, or "launched without a handle") | Everyone | ADR 0010: blame is what makes the cost visible. Both sides of a collision are named, and neither is singled out. |
| A live satellite's beacon | **A display rule, not a server check.** Pages show it to its owner always, and to everyone else once it has been heard over a station (ADR 0016) or once it's gone (ADR 0012). The sky's data sends every live beacon to every browser (below). | You launch to be heard, so the words are for the station passes. |
| The catalogue, histories and what each collision led to | Everyone, forever | ADR 0003: the sky heals, the record doesn't. |
| "Yours", the controls, and `mine` on each object | Only you | They're about what you can change. |
| Person cookies, operator ids, passphrases, and who owns what by cookie | Nobody: the server never sends them | Pages and the event stream (`toPublic`, `forViewer` in `src/lib/stream.ts`) drop the owner and operator from every object and say only whether it's yours. Passphrases are stored only as salted `scrypt` hashes. |
| An extra is invented | Nobody, on the page | ADR 0021: they launch like anyone, by the same rules, so the sky isn't empty. |

The beacon rule is a convention, not a secret. The sky page and its event
stream send every live beacon to every browser, so the stations can show
each one the moment it comes overhead, and anyone reading that data sees a
beacon before it's heard. ADR 0012 accepted that: a beacon is public the
first time it passes a station, at most a few minutes later, and
withholding it on the server would mean sending each one only while it's
overhead. Nothing anyone can change depends on it.

## Consequences

- The crit's failure case, one person changing what's the other's, is
  refused on the server. `spec/manoeuvre-http.test.ts` checks a stranger's
  deorbit and boost (`not-yours`, the satellite unchanged), a device after
  it signs out, a made-up cookie such as an extra's owner, and cross-site
  deorbits and boosts. `spec/operator.test.ts` checks cross-site claims,
  sign-ins and sign-outs, and that no owner, operator id or person id
  reaches any page (the launchpad, the sky, the catalogue, Yours, an
  object's card and panel, the operator page) or the stream, at its start
  or with a launch as it happens.
- The limits on claims and sign-in tries count by the `fly-client-ip`
  header, which Fly's proxy sets on every request. Off Fly it could be
  made up, so the limits only mean what they say behind that proxy.
- Anyone can still make themselves a new person with a new browser or by
  clearing cookies (ADR 0002's loophole, kept in 0009). That gets them more
  launches, never control of anyone else's satellites. The C10 logs will
  show whether it's used.
- A handle is public by design. Claiming one is the only way to keep your
  satellites across devices, and it puts your name on every collision
  they're in.
- A new feature that lets someone change something has to say where it fits
  in the "Changing" table, or supersede this record.
