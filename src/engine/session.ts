import { get_context, has_context } from "./request-context";
import { SESSION_COOKIE, SESSION_TTL } from "./config";
import { activeDbAdapter } from "./active/db-adapter";
import { quoteIdentifier } from "./db/sql";
import * as crypto from "node:crypto";

const g = globalThis as unknown as {
  __etTransientSessions?: Map<string, Record<string, unknown>>;
};

function transientSessions(): Map<string, Record<string, unknown>> {
  if (!g.__etTransientSessions) g.__etTransientSessions = new Map();
  return g.__etTransientSessions;
}

let schemaReady: Promise<void> | null = null;

async function ensureTable(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const db = activeDbAdapter;
      const expiresType = db.dialect === "postgres" ? "BIGINT" : "INTEGER";
      await db.execute(
        `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(db.dialect, "et_sessions")} (
           ${quoteIdentifier(db.dialect, "id")} TEXT PRIMARY KEY,
           ${quoteIdentifier(db.dialect, "data")} TEXT NOT NULL DEFAULT '{}',
           ${quoteIdentifier(db.dialect, "expires")} ${expiresType} NOT NULL
         )`,
      );
    })();
  }
  return schemaReady;
}

async function readSessionRow(
  id: string,
): Promise<Record<string, unknown> | null> {
  await ensureTable();
  const db = activeDbAdapter;
  const rows = await db.query<{ data: string; expires: number | string }>(
    `SELECT ${quoteIdentifier(db.dialect, "data")} AS data,
            ${quoteIdentifier(db.dialect, "expires")} AS expires
       FROM ${quoteIdentifier(db.dialect, "et_sessions")}
      WHERE ${quoteIdentifier(db.dialect, "id")} = ${
        db.dialect === "postgres" ? "$1" : "?"
      }`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  if (Number(row.expires) < Math.floor(Date.now() / 1000)) {
    await db.execute(
      `DELETE FROM ${quoteIdentifier(db.dialect, "et_sessions")} WHERE ${quoteIdentifier(
        db.dialect,
        "id",
      )} = ${db.dialect === "postgres" ? "$1" : "?"}`,
      [id],
    );
    return null;
  }
  try {
    return JSON.parse(row.data) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function writeSessionRow(
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  await ensureTable();
  const db = activeDbAdapter;
  const expires = Math.floor(Date.now() / 1000) + SESSION_TTL;
  const p1 = db.dialect === "postgres" ? "$1" : "?";
  const p2 = db.dialect === "postgres" ? "$2" : "?";
  const p3 = db.dialect === "postgres" ? "$3" : "?";
  const conflict =
    db.dialect === "mysql"
      ? "ON DUPLICATE KEY UPDATE data = VALUES(data), expires = VALUES(expires)"
      : `ON CONFLICT (${quoteIdentifier(db.dialect, "id")}) DO UPDATE SET data = excluded.data, expires = excluded.expires`;
  await db.execute(
    `INSERT INTO ${quoteIdentifier(db.dialect, "et_sessions")}
       (${quoteIdentifier(db.dialect, "id")}, ${quoteIdentifier(db.dialect, "data")}, ${quoteIdentifier(db.dialect, "expires")})
     VALUES (${p1}, ${p2}, ${p3})
     ${conflict}`,
    [id, JSON.stringify(data), expires],
  );
}

/** Current session id from cookies, or null. */
export function get_session_id(): string | null {
  const ctx = get_context();
  return ctx.cookies[SESSION_COOKIE] ?? null;
}

function newSessionId(): string {
  return crypto.randomBytes(24).toString("hex");
}

function sessionCookieOptions(): Record<string, unknown> {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
    secure: get_context().url.toLowerCase().startsWith("https://"),
  };
}

/**
 * Ensure a session exists, creating one when possible. During a GET render the
 * response cannot set cookies; callers that need persistence must run inside a
 * server action or route handler (canSetCookies === true).
 */
export function ensure_session_id(): string {
  const ctx = get_context();
  const existing = ctx.cookies[SESSION_COOKIE];
  if (existing) return existing;

  const id = newSessionId();
  transientSessions().set(id, {});
  if (ctx.canSetCookies) {
    ctx.responseCookies.push({
      name: SESSION_COOKIE,
      value: id,
      options: sessionCookieOptions(),
    });
  }
  return id;
}

/**
 * Rotate the session after a successful authentication.
 *
 * The old server-side record is deleted and the browser receives a new
 * HttpOnly session id. This prevents session fixation when a visitor arrives
 * with a pre-set session cookie. Call only where response cookies are allowed
 * (server actions and route handlers).
 */
export async function rotate_session_id(): Promise<string> {
  const ctx = get_context();
  if (!ctx.canSetCookies) return ensure_session_id();

  await ensureTable();
  const previous = ctx.cookies[SESSION_COOKIE];
  if (previous) {
    await activeDbAdapter.execute(
      `DELETE FROM ${quoteIdentifier(activeDbAdapter.dialect, "et_sessions")} WHERE ${quoteIdentifier(
        activeDbAdapter.dialect,
        "id",
      )} = ${activeDbAdapter.dialect === "postgres" ? "$1" : "?"}`,
      [previous],
    );
    transientSessions().delete(previous);
  }

  const id = newSessionId();
  transientSessions().set(id, {});
  ctx.cookies[SESSION_COOKIE] = id;
  ctx.responseCookies.push({
    name: SESSION_COOKIE,
    value: id,
    options: sessionCookieOptions(),
  });
  return id;
}

async function loadSession(): Promise<{
  id: string;
  data: Record<string, unknown>;
  transient: boolean;
}> {
  const id = ensure_session_id();
  const fromDb = await readSessionRow(id);
  if (fromDb !== null) return { id, data: fromDb, transient: false };

  const transient = transientSessions().get(id);
  if (transient) return { id, data: transient, transient: true };

  return { id, data: {}, transient: true };
}

async function persist(
  id: string,
  data: Record<string, unknown>,
  transient: boolean,
): Promise<void> {
  const ctx = get_context();
  if (transient) {
    transientSessions().set(id, data);
  }
  if (ctx.canSetCookies) {
    await writeSessionRow(id, data);
    transientSessions().set(id, data);
  }
}

export async function session_get<T = unknown>(key: string): Promise<T | undefined> {
  if (!has_context()) return undefined;
  const { data } = await loadSession();
  return data[key] as T | undefined;
}

export async function session_set(key: string, value: unknown): Promise<void> {
  const { id, data, transient } = await loadSession();
  if (value === undefined) {
    delete data[key];
  } else {
    data[key] = value;
  }
  await persist(id, data, transient);
}

export async function session_unset(key: string): Promise<void> {
  await session_set(key, undefined);
}

export async function session_clear(): Promise<void> {
  const { id } = await loadSession();
  await ensureTable();
  await activeDbAdapter.execute(
    `DELETE FROM ${quoteIdentifier(activeDbAdapter.dialect, "et_sessions")} WHERE ${quoteIdentifier(
      activeDbAdapter.dialect,
      "id",
    )} = ${activeDbAdapter.dialect === "postgres" ? "$1" : "?"}`,
    [id],
  );
  transientSessions().delete(id);
}

/** Housekeeping — remove expired sessions. */
export async function purge_expired_sessions(): Promise<void> {
  await ensureTable();
  await activeDbAdapter.execute(
    `DELETE FROM ${quoteIdentifier(activeDbAdapter.dialect, "et_sessions")} WHERE ${quoteIdentifier(
      activeDbAdapter.dialect,
      "expires",
    )} < ${activeDbAdapter.dialect === "postgres" ? "$1" : "?"}`,
    [Math.floor(Date.now() / 1000)],
  );
}
