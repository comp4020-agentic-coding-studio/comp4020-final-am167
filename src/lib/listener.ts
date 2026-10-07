import { createHash } from "node:crypto";

// A listener, as the server keeps them (ADR 0016): their operator, once
// signed in, so two devices are one listener; otherwise a one-way hash of
// their cookie, so the cookie (which is what lets them act as themselves)
// isn't kept again. Its own module so signing in (operators.ts) can carry
// what a cookie heard over to its operator.
export function listenerKey(viewer: { person: string | undefined; operator: number | null }): string {
  if (viewer.operator !== null) return `o:${viewer.operator}`;
  return `p:${createHash("sha256")
    .update(viewer.person ?? "")
    .digest("hex")
    .slice(0, 24)}`;
}

// A cookie's key that has signed in since, and the operator's it's now
// (operators.ts, link): a tab opened before still listens as the cookie it
// had until its stream reconnects, and is the operator meanwhile. In
// memory: after a restart every stream has reconnected as it is now.
const signedIn = new Map<string, string>();
export const signedInAs = (from: string, to: string) => void signedIn.set(from, to);
export const sameAs = (key: string): string => signedIn.get(key) ?? key;
