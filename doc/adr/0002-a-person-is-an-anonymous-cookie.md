# 0002. A person is an anonymous cookie

**Status:** proposed (2026-10-03). Working assumption for C8, not final;
expected to be revisited before it's accepted.

## Context

The brief requires the app to tell people apart, and leaves what a "person" is
to us. In Kessler a person owns a satellite: they launch it, get alerts about
it, dodge with it and can deorbit it. Only the owner may do those things.

The marker arrives as a stranger, with two sessions side by side, and has
about ten minutes. A stranger has to be able to launch within seconds, and the
two sessions must count as two people.

The argument of the app is a commons: one satellite each is what makes the
sky shared fairly, so how easily one human can become several people matters.

## Options

- **Anonymous cookie, plus a callsign chosen at launch.** No sign-up; a stranger
  launches in seconds. A new browser or cleared cookies makes a new person, who
  can launch another satellite and loses control of the old one.
- **Cookie plus a recovery code.** Shown at launch; it reclaims your satellite
  on another device. Still no sign-up, and your trace follows you. An extra
  step, codes get lost, and it still doesn't stop someone opening more browsers.
- **Real accounts** (email or GitHub login). One satellite per real human, so
  the commons is fair and the logs mean more. Friction kills a stranger's first
  try, it's more to build before C8, and it means holding personal data.

## Decision

**A person is an anonymous browser cookie.**

- On first visit the server sets a random id in a long-lived, `httpOnly`,
  `SameSite=Lax` cookie. That id is the owner of anything you launch.
- **One active satellite per cookie.** You can launch again once yours has
  decayed, been deorbited or been destroyed.
- The **callsign** is chosen at each launch and shown publicly; the cookie id
  never is.

## Consequences

- A stranger can do the core thing with no sign-up, and the marker's two
  sessions are two people.
- **The loophole is accepted, deliberately for now:** one human with several
  browsers holds several satellites. The C10 logs (launches per cookie, per
  hour) will show whether it's abused; if it is, a new record supersedes this.
- Clearing cookies orphans your satellite: it stays in the sky and the
  catalogue, but nobody can dodge or deorbit it. That fits the argument (real
  orbit is full of dead satellites nobody controls).
- No personal data is stored, so there's nothing to protect beyond the cookie.
- Callsigns aren't unique and aren't proof of identity; two people can share
  one. The catalogue tells objects apart by id, not callsign.
