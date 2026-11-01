import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";

import { dbTime, exec, sql, uuid } from "./db.server";

export const STAFF_ROLES = ["admin", "editor", "booking_manager", "executive"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

const COOKIE = "dmojo_session";
const SESSION_DAYS = 7;
const SCRYPT_N = 16384;

/* ───────────── passwords ───────────── */

// Format: scrypt$N$salt(b64)$hash(b64). scripts/create-admin.mjs uses the same format.
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N: SCRYPT_N });
  return `scrypt$${SCRYPT_N}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, n, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !n || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = scryptSync(password, Buffer.from(salt, "base64"), expected.length, { N: Number(n) });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/* ───────────── sessions ───────────── */

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function cookieSecure(): boolean {
  const flag = process.env["COOKIE_SECURE"];
  if (flag === "true") return true;
  if (flag === "false") return false;
  return process.env["NODE_ENV"] === "production";
}

export async function startSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await exec`DELETE FROM sessions WHERE expires_at < UTC_TIMESTAMP(3)`;
  await exec`INSERT INTO sessions (id, user_id, token_hash, expires_at)
             VALUES (${uuid()}, ${userId}, ${sha256(token)}, ${dbTime(expires)})`;
  setCookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
    expires,
  });
}

export async function endSession(): Promise<void> {
  const token = getCookie(COOKIE);
  if (token) await exec`DELETE FROM sessions WHERE token_hash = ${sha256(token)}`;
  deleteCookie(COOKIE, { path: "/" });
}

export type SessionUser = { id: string; email: string; roles: StaffRole[] };

/** The signed-in user for the current request, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = getCookie(COOKIE);
  if (!token) return null;
  const [row] = await sql<{ id: string; email: string }[]>`
    SELECT u.id, u.email
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${sha256(token)} AND s.expires_at > UTC_TIMESTAMP(3)`;
  if (!row) return null;
  const roles = await sql<{ role: StaffRole }[]>`SELECT role FROM user_roles WHERE user_id = ${row.id}`;
  return { id: row.id, email: row.email, roles: roles.map((r) => r.role) };
}

/* ───────────── authorisation ───────────── */

export function hasAnyRole(user: SessionUser | null, allowed: readonly StaffRole[]): boolean {
  return !!user && user.roles.some((r) => allowed.includes(r));
}

/** Throws unless the request is signed in with at least one of `allowed` (any signed-in user if empty). */
export async function requireUser(allowed: readonly StaffRole[] = []): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("Unauthorized: please sign in.");
  if (allowed.length && !hasAnyRole(user, allowed)) throw new Error("Forbidden: you don't have access to this.");
  return user;
}

/* ───────────── brute-force throttle (in-memory, per server process) ───────────── */

const attempts = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 8;

export function loginThrottled(key: string): boolean {
  const a = attempts.get(key);
  if (!a) return false;
  if (Date.now() - a.first > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return a.count >= MAX_FAILURES;
}
export function recordLoginFailure(key: string): void {
  const a = attempts.get(key);
  if (!a || Date.now() - a.first > WINDOW_MS) attempts.set(key, { count: 1, first: Date.now() });
  else a.count += 1;
}
export function clearLoginFailures(key: string): void {
  attempts.delete(key);
}
