import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "../db/index.ts";
import { blocked } from "./launch.ts";
import { listenerKey, signedInAs } from "./listener.ts";
import { log, whoIs } from "./log.ts";

const { objects, operators, people } = schema;

// Operators (ADR 0009). A person is still an anonymous cookie and can launch
// at once; claiming a handle with a passphrase makes them an operator, whose
// satellites (and the blame for them, ADR 0010) follow them to any device
// they sign in on. No email and no real names: there's nothing to recover a
// forgotten passphrase with, and nothing personal to leak.

export interface Operator {
  id: number;
  handle: string;
}

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 20;
export const PASSPHRASE_MIN = 8;
const PASSPHRASE_MAX = 200;

export type OperatorErrors = Partial<Record<"handle" | "passphrase" | "form", string>>;

export interface OperatorForm {
  action: "claim" | "sign-in" | "sign-out";
  handle: string;
  passphrase: string;
}

export function readOperatorForm(form: FormData): OperatorForm | null {
  const action = String(form.get("action") ?? "");
  if (action !== "claim" && action !== "sign-in" && action !== "sign-out") return null;
  return { action, handle: String(form.get("handle") ?? "").trim(), passphrase: String(form.get("passphrase") ?? "") };
}

// Words the server's record uses for who someone is (ADR 0023): a person
// with one of these as a handle would read as an anonymous visitor, as
// no-one, or as an extra.
const RESERVED = new Set(["anon", "nobody", "none", "extra"]);
const HANDLE = /^[A-Za-z0-9_-]+$/;

// What's wrong with a claim, and why in a word or two for the record (ADR
// 0023), which never says more of a passphrase than that.
function checkClaim({ handle, passphrase }: OperatorForm): { errors: OperatorErrors; why: string[] } {
  const errors: OperatorErrors = {};
  const why: string[] = [];
  if (handle.length < HANDLE_MIN || handle.length > HANDLE_MAX) {
    errors.handle = `A handle is ${HANDLE_MIN} to ${HANDLE_MAX} characters.`;
    why.push("handle-length");
  } else if (!HANDLE.test(handle)) {
    errors.handle = "Use letters, numbers, hyphens or underscores.";
    why.push("handle-characters");
  } else if (blocked(handle)) {
    errors.handle = "That handle has a word we don't broadcast. Pick another.";
    why.push("handle-blocked");
  } else if (RESERVED.has(handle.toLowerCase())) {
    errors.handle = "That handle is taken. Pick another.";
    why.push("handle-reserved");
  }
  if (passphrase.length < PASSPHRASE_MIN || passphrase.length > PASSPHRASE_MAX) {
    errors.passphrase =
      passphrase.length < PASSPHRASE_MIN
        ? `A passphrase is at least ${PASSPHRASE_MIN} characters.`
        : `A passphrase is at most ${PASSPHRASE_MAX} characters.`;
    why.push("passphrase-length");
  }
  return { errors, why };
}

// scrypt with its default cost, a 16-byte salt per operator. Off the event
// loop, and only a few at a time, so a flood of sign-ins can't stall
// everyone else's sky.
const scryptAsync = promisify(scrypt) as (passphrase: string, salt: string, length: number) => Promise<Buffer>;
const HASHING_MAX = 4;
let hashing = 0;
const BUSY = { ok: false as const, errors: { form: "The station is busy. Try again in a moment." }, why: "busy" };
async function hashOf(passphrase: string, salt: string): Promise<Buffer | null> {
  if (hashing >= HASHING_MAX) return null;
  hashing++;
  try {
    return await scryptAsync(passphrase.normalize("NFC"), salt, 64);
  } finally {
    hashing--;
  }
}

// Everything this person launched while anonymous becomes the operator's,
// and so does everything they heard (ADR 0016), so they're one listener,
// not two, signed out and in; less anything of the operator's own it heard
// (a second device, signed out, hearing theirs), since nobody hears their
// own.
// Returns how many satellites it took over.
export function link(person: string, operator: number): number {
  const was = listenerKey({ person, operator: null });
  const now = listenerKey({ person: undefined, operator });
  const took = db.transaction((tx) => {
    tx.insert(people).values({ person, operator }).onConflictDoUpdate({ target: people.person, set: { operator } }).run();
    const { changes } = tx
      .update(objects)
      .set({ operator })
      .where(and(eq(objects.owner, person), isNull(objects.operator)))
      .run();
    tx.run(sql`INSERT OR IGNORE INTO listens (object, listener, at) SELECT object, ${now}, at FROM listens WHERE listener = ${was}`);
    tx.run(sql`DELETE FROM listens WHERE listener = ${was}`);
    tx.run(sql`DELETE FROM listens WHERE listener = ${now} AND object IN (SELECT id FROM objects WHERE operator = ${operator})`);
    return changes;
  });
  signedInAs(was, now);
  return took;
}

// A refusal says why, in a word or two, for the record.
type Result = { ok: true; operator: Operator; took: number } | { ok: false; errors: OperatorErrors; why: string };

// Tries per place (an address, and the handle tried), with a lock after too
// many: after FAILS wrong passphrases from one place, that place waits
// LOCK_MS, and the count starts again once the lock has passed. Keyed by
// place as well as handle, so someone guessing can't lock the owner out
// from anywhere else. Claims are limited per address too. In memory, swept
// as it grows; a restart forgets it.
const FAILS = 5;
const LOCK_MS = 30_000;
// generous: a whole class can sit behind one campus address
const CLAIMS_PER_HOUR = 60;
// this machine itself (development, and the tests) isn't limited
const LOCAL = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const tries = new Map<string, { count: number; until: number }>();
const claims = new Map<string, number[]>();
function sweep(now: number) {
  if (tries.size > 1_000) for (const [key, t] of tries) if (t.until <= now && t.count < FAILS) tries.delete(key);
  if (tries.size > 10_000) tries.clear();
  if (claims.size > 10_000) claims.clear();
}

export async function claim(person: string, form: OperatorForm, from: string, now = Date.now()): Promise<Result> {
  if (operatorOf(person)) return { ok: false, errors: { form: "You're signed in. Sign out first to claim another handle." }, why: "signed-in" };
  const { errors, why } = checkClaim(form);
  if (why.length > 0) return { ok: false, errors, why: why.join(",") };
  sweep(now);
  const recent = (claims.get(from) ?? []).filter((at) => now - at < 3_600_000);
  if (!LOCAL.has(from) && recent.length >= CLAIMS_PER_HOUR)
    return { ok: false, errors: { form: "Too many handles claimed from here. Try later." }, why: "too-many-claims" };
  const salt = randomBytes(16).toString("hex");
  const hash = await hashOf(form.passphrase, salt);
  if (!hash) return BUSY;
  claims.set(from, [...recent, now]);
  let row: Operator;
  try {
    row = db
      .insert(operators)
      .values({
        handle: form.handle,
        handleKey: form.handle.toLowerCase(),
        salt,
        hash: hash.toString("hex"),
        createdAt: now,
      })
      .returning({ id: operators.id, handle: operators.handle })
      .get();
  } catch (error) {
    if ((error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE")
      return { ok: false, errors: { handle: `${form.handle} is taken. Pick another handle.` }, why: "taken" };
    throw error;
  }
  return { ok: true, operator: row, took: link(person, row.id) };
}

// The same answer for an unknown handle and a wrong passphrase, so a
// sign-in can't be used to find out which handles exist.
const WRONG = { ok: false as const, errors: { form: "That handle or passphrase isn't right." } };
const wrong = (why: string) => ({ ...WRONG, why });

export async function signIn(person: string, form: OperatorForm, from: string, now = Date.now()): Promise<Result> {
  sweep(now);
  const handleKey = form.handle.toLowerCase();
  const key = `${from}|${handleKey}`;
  let tried = tries.get(key);
  if (tried && tried.until > now) {
    return { ok: false, errors: { form: `Too many tries. Wait ${Math.ceil((tried.until - now) / 1000)} s.` }, why: "too-many-tries" };
  }
  // a lock that has passed starts the count again
  if (tried && tried.count >= FAILS) tried = undefined;
  const row = db.select().from(operators).where(eq(operators.handleKey, handleKey)).get();
  // hash even for an unknown handle, so both take as long
  const given = await hashOf(form.passphrase, row?.salt ?? "no such operator");
  if (!given) return BUSY;
  // an extra's handle (ADR 0021) has no passphrase anyone knows
  if (!row || row.extra || !timingSafeEqual(given, Buffer.from(row.hash, "hex"))) {
    const count = (tried?.count ?? 0) + 1;
    tries.set(key, { count, until: count >= FAILS ? now + LOCK_MS : 0 });
    // the record may say which, though the page doesn't
    return wrong(!row ? "no-such-handle" : row.extra ? "extras-handle" : "wrong-passphrase");
  }
  tries.delete(key);
  return { ok: true, operator: { id: row.id, handle: row.handle }, took: link(person, row.id) };
}

// What the operator page does with a form (null if it couldn't be read):
// claims, signs in or signs out, and on success gives back the device's new
// cookie for the page to set (a new person after signing out; after
// claiming or signing in, a cookie nobody has seen, so one seen before
// can't follow it in). Each is a line in the record, naming who the device
// was and who it is now, and how many of its satellites became the
// operator's; a refusal names the handle tried and why, and never the
// passphrase: a handle tried that couldn't be one (spaces, punctuation,
// too long) is only counted, in case it's a passphrase in the wrong box.
export type Operated = { ok: true; person: string; action: OperatorForm["action"] } | { ok: false; errors: OperatorErrors; status: 400 | 422; action: OperatorForm["action"] | null; handle: string };
export async function operate(person: string, form: FormData | null, from: string, now = Date.now()): Promise<Operated> {
  const who = whoIs(person, operatorOf(person)?.handle ?? null);
  const read = form && readOperatorForm(form);
  if (!read) {
    log("operator-refused", { who, reason: "unreadable" });
    return { ok: false, errors: { form: "That form couldn't be read. Try again." }, status: 400, action: null, handle: "" };
  }
  if (read.action === "sign-out") {
    signOut(person);
    const next = crypto.randomUUID();
    log("sign-out", { who, now: whoIs(next, null) });
    return { ok: true, person: next, action: "sign-out" };
  }
  const result = read.action === "claim" ? await claim(person, read, from, now) : await signIn(person, read, from, now);
  if (!result.ok) {
    const plausible = read.handle.length <= HANDLE_MAX && HANDLE.test(read.handle);
    log(`${read.action}-refused`, {
      who,
      handle: plausible ? read.handle : null,
      handle_length: plausible ? null : [...read.handle].length,
      reason: result.why,
    });
    return { ok: false, errors: result.errors, status: 422, action: read.action, handle: read.handle };
  }
  const next = crypto.randomUUID();
  moveTo(person, next);
  log(read.action, { who, handle: result.operator.handle, now: whoIs(next, result.operator.handle), took: result.took });
  return { ok: true, person: next, action: read.action };
}

// This device stops being the operator; the caller gives it a fresh cookie.
export function signOut(person: string): void {
  db.delete(people).where(eq(people.person, person)).run();
}

// After claiming or signing in, the device gets a new cookie, so a cookie
// someone saw before can't follow it into the operator.
export function moveTo(from: string, to: string): void {
  db.update(people).set({ person: to }).where(eq(people.person, from)).run();
}

export function operatorOf(person: string | undefined): Operator | null {
  if (!person) return null;
  const row = db
    .select({ id: operators.id, handle: operators.handle })
    .from(people)
    .innerJoin(operators, eq(people.operator, operators.id))
    .where(eq(people.person, person))
    .get();
  return row ?? null;
}

// Handles by operator id, for naming who launched what.
export function handles(ids: Iterable<number | null>): Map<number, string> {
  const wanted = [...new Set([...ids].filter((id): id is number => id !== null))];
  if (wanted.length === 0) return new Map();
  const rows = db
    .select({ id: operators.id, handle: operators.handle })
    .from(operators)
    .where(inArray(operators.id, wanted))
    .all();
  return new Map(rows.map((row) => [row.id, row.handle]));
}
