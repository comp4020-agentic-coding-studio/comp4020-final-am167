# 0009. A person is a cookie, and an operator you can claim

**Status:** proposed (2026-10-06). Supersedes 0002.

## Context

ADR 0002 made a person an anonymous cookie, so a stranger can launch within
seconds, and rejected real accounts because sign-up friction kills a
stranger's first try. The cookie already records who launched what
(`objects.owner`).

Collisions (ADR 0008) make blame the point: every fragment traces back to
the satellites that made it, and someone launched those. Two things the
cookie can't give:

- **A name blame sticks to.** Callsigns are chosen per launch and aren't
  unique, so they can't say "this is the same operator who caused the last
  three cascades".
- **Your record on another device**, or after clearing cookies. Today that
  orphans your satellite and your history.

The marker still arrives as a stranger, with two sessions, for about ten
minutes.

## Options

- **Keep the cookie only** (ADR 0002). No blame beyond the callsign.
- **An operator handle, no password.** Pick a unique name once, bound to
  your cookie. Solves blame, not other devices.
- **An operator you can claim, with a passphrase.** Launch anonymously as
  now; claim a unique handle with a passphrase whenever you like, and sign
  in with it elsewhere. No email, no personal data.
- **Required sign-up** before the first launch. The same accounts, but the
  stranger's first try costs a form.
- **GitHub sign-in.** Real identity, but secrets on Fly, an outside service
  in the way, personal data held, and the marker needs a GitHub account.

None of these stops one human opening several browsers; only verified
identity would, and that costs more than the loophole (ADR 0002).

## Decision

**A person is still an anonymous cookie; an operator is a handle with a
passphrase that a person can claim, and sign in to from any device.**

- The cookie (ADR 0002) is unchanged: set on first visit, `httpOnly`, and
  enough to launch.
- **Claiming** takes a handle (3 to 20 letters, digits, `-` or `_`, unique
  ignoring case, through the beacon blocklist) and a passphrase (at least 8
  characters). The passphrase is stored only as an `scrypt` hash with its
  own salt (Node's `crypto`, no new dependency). The cookie is linked to the
  new operator, and every satellite that cookie launched becomes the
  operator's.
- **Signing in** on another device links that device's cookie to the
  operator, after checking the passphrase in constant time. Failed attempts
  per handle are slowed in memory.
- **Merging:** if the device signing in has its own satellites, they join
  the operator's record too. If that leaves the operator with two live
  satellites, both stay, and the operator can't launch again until both are
  gone.
- **Signing out** unlinks the device and gives it a fresh cookie, so it's a
  new anonymous person; what it launched stays the operator's.
- **One live satellite per operator** when signed in, per cookie when not.
  The rule is checked on every launch; the database's unique index stays on
  the cookie.
- Owning a satellite means: it's the operator's, if it has one, otherwise
  it's the cookie's. The cookie id and the passphrase hash are never sent to
  a client; the handle is public.

## Consequences

- A stranger launches within seconds, as before; the marker never has to
  sign up to see anything work.
- A handle is public and blame names it (ADR 0010), so claiming is a choice
  to be named. Staying anonymous keeps you off the blame board under your
  handle, but your callsign is still named.
- There's now something to protect: passphrase hashes. No email or real
  names are stored, so a leak exposes handles and hashes only. Sign-in is a
  form post over HTTPS (Fly terminates TLS).
- Nobody can recover a forgotten passphrase: there's no email to send to.
  Said on the claim form.
- One human can still hold several cookies and several operators; the C10
  logs will show if it matters.
- New tables (`operators`, and the link from cookie to operator) and an
  `operator` column on objects, as a migration.
