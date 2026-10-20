import { getContext, hasContext } from "./request-context";
import { SESSION_COOKIE, SESSION_TTL } from "./config";
import { sqlite } from "./db";
import * as crypto from "node:crypto";

/**
 * Session store — the port's replacement for PHP's $_SESSION.
 *
 * A signed, opaque session id lives in the `tg_session` cookie; the payload is
 * a JSON object persisted in the `tg_sessions` table. Values must be
 * JSON-serializable.
 */

const g = globalThis as unknown as { __tgTransientSessions?: Map<string, Record<string, unknown>> };

function transientSessions(): Map<string, Record<string, unknown>> {
  if (!g.__tgTransientSessions) g.__tgTransientSessions = new Map();
  return g.__tgTransientSessions;
}

function ensureTable(): void {
  sqlite().exec(
    `CREATE TABLE IF NOT EXISTS tg_sessions (
       id TEXT PRIMARY KEY,
       data TEXT NOT NULL DEFAULT '{}',
       expires INTEGER NOT NULL
     )`
  );
}

function readSessionRow(id: string): Record<string, unknown> | null {
  ensureTable();
  const row = sqlite()
    .prepare("SELECT data, expires FROM tg_sessions WHERE id = ?")
    .get(id) as { data: string; expires: number } | undefined;
  if (!row) return null;
  if (row.expires < Math.floor(Date.now() / 1000)) {
    sqlite().prepare("DELETE FROM tg_sessions WHERE id = ?").run(id);
    return null;
  }
  try {
    return JSON.parse(row.data) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writeSessionRow(id: string, data: Record<string, unknown>): void {
  ensureTable();
  const expires = Math.floor(Date.now() / 1000) + SESSION_TTL;
  sqlite()
    .prepare(
      `INSERT INTO tg_sessions (id, data, expires) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, expires = excluded.expires`
    )
    .run(id, JSON.stringify(data), expires);
}

/** Current session id from cookies, or null. */
export function getSessionId(): string | null {
  const ctx = getContext();
  return ctx.cookies[SESSION_COOKIE] ?? null;
}

/**
 * Ensure a session exists, creating one when possible. During a GET render the
 * response cannot set cookies; callers that need persistence must run inside a
 * server action or route handler (canSetCookies === true).
 */
export function ensureSessionId(): string {
  const ctx = getContext();
  const existing = ctx.cookies[SESSION_COOKIE];
  if (existing) return existing;

  const id = crypto.randomBytes(24).toString("hex");
  transientSessions().set(id, {});
  if (ctx.canSetCookies) {
    ctx.responseCookies.push({
      name: SESSION_COOKIE,
      value: id,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_TTL,
      },
    });
  }
  return id;
}

function loadSession(): { id: string; data: Record<string, unknown>; transient: boolean } {
  const ctx = getContext();
  const id = ensureSessionId();
  const fromDb = readSessionRow(id);
  if (fromDb !== null) return { id, data: fromDb, transient: false };

  const transient = transientSessions().get(id);
  if (transient) return { id, data: transient, transient: true };

  // Brand-new session (GET render without a session cookie).
  return { id, data: {}, transient: true };
}

function persist(id: string, data: Record<string, unknown>, transient: boolean): void {
  const ctx = getContext();
  if (transient) {
    transientSessions().set(id, data);
  }
  if (ctx.canSetCookies) {
    writeSessionRow(id, data);
    // Keep the transient copy in sync so rendering later in the same request works.
    transientSessions().set(id, data);
  }
}

export function sessionGet<T = unknown>(key: string): T | undefined {
  if (!hasContext()) return undefined;
  const { data } = loadSession();
  return data[key] as T | undefined;
}

export function sessionSet(key: string, value: unknown): void {
  const { id, data, transient } = loadSession();
  if (value === undefined) {
    delete data[key];
  } else {
    data[key] = value;
  }
  persist(id, data, transient);
}

export function sessionUnset(key: string): void {
  sessionSet(key, undefined);
}

export function sessionClear(): void {
  const { id } = loadSession();
  sqlite().prepare("DELETE FROM tg_sessions WHERE id = ?").run(id);
  transientSessions().delete(id);
}

/** Housekeeping — remove expired sessions. */
export function purgeExpiredSessions(): void {
  ensureTable();
  sqlite()
    .prepare("DELETE FROM tg_sessions WHERE expires < ?")
    .run(Math.floor(Date.now() / 1000));
}
