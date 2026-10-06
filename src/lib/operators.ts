import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "../db/index.ts";
import { blocked } from "./launch.ts";

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

function checkClaim({ handle, passphrase }: OperatorForm): OperatorErrors {
  const errors: OperatorErrors = {};
  if (handle.length < HANDLE_MIN || handle.length > HANDLE_MAX)
    errors.handle = `A handle is ${HANDLE_MIN} to ${HANDLE_MAX} characters.`;
  else if (!/^[A-Za-z0-9_-]+$/.test(handle)) errors.handle = "Use letters, numbers, hyphens or underscores.";
  else if (blocked(handle)) errors.handle = "That handle has a word we don't broadcast. Pick another.";
  if (passphrase.length < PASSPHRASE_MIN) errors.passphrase = `A passphrase is at least ${PASSPHRASE_MIN} characters.`;
  else if (passphrase.length > PASSPHRASE_MAX) errors.passphrase = `A passphrase is at most ${PASSPHRASE_MAX} characters.`;
  return errors;
}

// scrypt with its default cost, a 16-byte salt per operator. Off the event
// loop, and only a few at a time, so a flood of sign-ins can't stall
// everyone else's sky.
const scryptAsync = promisify(scrypt) as (passphrase: string, salt: string, length: number) => Promise<Buffer>;
const HASHING_MAX = 4;
let hashing = 0;
const BUSY = { ok: false as const, errors: { form: "The station is busy. Try again in a moment." } };
async function hashOf(passphrase: string, salt: string): Promise<Buffer | null> {
  if (hashing >= HASHING_MAX) return null;
  hashing++;
  try {
    return await scryptAsync(passphrase.normalize("NFC"), salt, 64);
  } finally {
    hashing--;
  }
}

// Everything this person launched while anonymous becomes the operator's.
export function link(person: string, operator: number): void {
  db.transaction((tx) => {
    tx.insert(people).values({ person, operator }).onConflictDoUpdate({ target: people.person, set: { operator } }).run();
    tx.update(objects)
      .set({ operator })
      .where(and(eq(objects.owner, person), isNull(objects.operator)))
      .run();
  });
}

type Result = { ok: true; operator: Operator } | { ok: false; errors: OperatorErrors };

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
  if (operatorOf(person)) return { ok: false, errors: { form: "You're signed in. Sign out first to claim another handle." } };
  const errors = checkClaim(form);
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  sweep(now);
  const recent = (claims.get(from) ?? []).filter((at) => now - at < 3_600_000);
  if (!LOCAL.has(from) && recent.length >= CLAIMS_PER_HOUR) return { ok: false, errors: { form: "Too many handles claimed from here. Try later." } };
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
      return { ok: false, errors: { handle: `${form.handle} is taken. Pick another handle.` } };
    throw error;
  }
  link(person, row.id);
  return { ok: true, operator: row };
}

// The same answer for an unknown handle and a wrong passphrase, so a
// sign-in can't be used to find out which handles exist.
const WRONG = { ok: false as const, errors: { form: "That handle or passphrase isn't right." } };

export async function signIn(person: string, form: OperatorForm, from: string, now = Date.now()): Promise<Result> {
  sweep(now);
  const handleKey = form.handle.toLowerCase();
  const key = `${from}|${handleKey}`;
  let tried = tries.get(key);
  if (tried && tried.until > now) {
    return { ok: false, errors: { form: `Too many tries. Wait ${Math.ceil((tried.until - now) / 1000)} s.` } };
  }
  // a lock that has passed starts the count again
  if (tried && tried.count >= FAILS) tried = undefined;
  const row = db.select().from(operators).where(eq(operators.handleKey, handleKey)).get();
  // hash even for an unknown handle, so both take as long
  const given = await hashOf(form.passphrase, row?.salt ?? "no such operator");
  if (!given) return BUSY;
  if (!row || !timingSafeEqual(given, Buffer.from(row.hash, "hex"))) {
    const count = (tried?.count ?? 0) + 1;
    tries.set(key, { count, until: count >= FAILS ? now + LOCK_MS : 0 });
    return WRONG;
  }
  tries.delete(key);
  link(person, row.id);
  return { ok: true, operator: { id: row.id, handle: row.handle } };
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
