// Authentication: scrypt password hashing, opaque server-side sessions in httpOnly cookies.
import crypto from "node:crypto";
import { db, sqlTime } from "./db.ts";

export const SESSION_COOKIE = "velluto_session";
const SESSION_DAYS = 30;

export type User = { id: number; email: string; name: string; role: "user" | "admin"; autoplay_next: number; created_at: string };

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [alg, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const got = crypto.scryptSync(password, Buffer.from(salt, "base64"), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, got);
}

const tokenId = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export function validateEmail(email: string) { return /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(email); }
export function validatePassword(pw: string) { return typeof pw === "string" && pw.length >= 8 && pw.length <= 200; }

export function createUser(email: string, name: string, password: string, role: "user" | "admin" = "user"): number {
  const r = db().prepare("INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)").run(email.trim().toLowerCase(), name.trim(), hashPassword(password), role);
  return Number(r.lastInsertRowid);
}

export function findUserByCredentials(email: string, password: string): User | null {
  const row = db().prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase()) as (User & { password_hash: string }) | undefined;
  // constant-ish work even if the user does not exist
  if (!row) { verifyPassword(password, "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "=="); return null; }
  if (!verifyPassword(password, row.password_hash)) return null;
  const { password_hash: _ignored, ...user } = row; void _ignored;
  return user;
}

export function createSession(userId: number, userAgent: string | null): { token: string; expires: Date } {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  db().prepare("INSERT INTO sessions (id, user_id, user_agent, expires_at) VALUES (?, ?, ?, ?)").run(tokenId(token), userId, (userAgent || "").slice(0, 300), sqlTime(expires));
  return { token, expires };
}

export function userFromToken(token: string | undefined | null): User | null {
  if (!token) return null;
  const id = tokenId(token);
  const row = db().prepare(
    `SELECT u.id, u.email, u.name, u.role, u.autoplay_next, u.created_at FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > datetime('now')`).get(id) as User | undefined;
  if (row) db().prepare("UPDATE sessions SET last_seen = datetime('now') WHERE id = ? AND last_seen < datetime('now','-5 minutes')").run(id);
  return row || null;
}

export function deleteSession(token: string) { db().prepare("DELETE FROM sessions WHERE id = ?").run(tokenId(token)); }
export function currentSessionId(token: string) { return tokenId(token); }
export function listSessions(userId: number) {
  return db().prepare("SELECT id, user_agent, created_at, last_seen FROM sessions WHERE user_id = ? AND expires_at > datetime('now') ORDER BY last_seen DESC").all(userId) as { id: string; user_agent: string; created_at: string; last_seen: string }[];
}
export function revokeSession(userId: number, sessionId: string) { db().prepare("DELETE FROM sessions WHERE user_id = ? AND id = ?").run(userId, sessionId); }

// --- brute-force protection: sliding window of FAILED attempts per key (ip / email) ---
const failures = new Map<string, number[]>();
const recent = (key: string, windowMs: number) => (failures.get(key) || []).filter((x) => Date.now() - x < windowMs);
export function isBlocked(key: string, max: number, windowMs = 10 * 60_000): boolean { return recent(key, windowMs).length >= max; }
export function recordFailure(key: string, windowMs = 10 * 60_000) { const l = recent(key, windowMs); l.push(Date.now()); failures.set(key, l); }
export function clearFailures(key: string) { failures.delete(key); }
/** Generic sliding-window counter (every call counts), e.g. sign-ups per IP. */
export function rateLimited(key: string, max = 8, windowMs = 10 * 60_000): boolean { const l = recent(key, windowMs); l.push(Date.now()); failures.set(key, l); return l.length > max; }
