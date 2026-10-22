import { db } from "./db";
import { get_context } from "./request-context";
import { session_get, session_set, session_unset } from "./session";
import { make_rand_str, escape_html } from "./String_service";
import { AUTH_TOKEN_COOKIE } from "./config";

/**
 * Eterc_tokens — port of modules/eterc_tokens (controller + model).
 *
 * Tokens live in the `eterc_tokens` table and are looked up from (in the
 * same priority order as the PHP original):
 *   1. HTTP header `EtercToken`
 *   2. cookie `eterctoken`
 *   3. session value `eterctoken`
 */

interface TokenRow {
  id: number;
  token: string;
  user_id: number;
  expiry_date: number;
  code: string | null;
}

export interface EtercUserObj {
  eterc_user_code: string | null;
  user_level_id: number;
  user_level: string | null;
  token: string;
  eterc_user_id: number;
  expiry_date: number;
}

const DEFAULT_TOKEN_LIFESPAN = 86400; // 24 hours

export class Eterc_tokens {
  readonly moduleName = "eterc_tokens";

  /** Gather candidate tokens from header, cookie and session. */
  gather_user_tokens(): string[] {
    const ctx = get_context();
    const tokens: string[] = [];

    const header = ctx.headers.get("eterctoken");
    if (header) tokens.push(escape_html(header));

    const cookie = ctx.cookies[AUTH_TOKEN_COOKIE];
    if (cookie) tokens.push(escape_html(cookie));

    const session = session_get<string>("eterctoken");
    if (session) tokens.push(escape_html(session));

    return [...new Set(tokens)];
  }

  private buildTokenArray(token?: string | null): string[] {
    if (token !== undefined && token !== null) {
      return [token];
    }
    const ctx = get_context();
    const tokens: string[] = [];
    const cookie = ctx.cookies[AUTH_TOKEN_COOKIE];
    if (cookie) tokens.push(escape_html(cookie));
    const session = session_get<string>("eterctoken");
    if (session) tokens.push(escape_html(session));
    const header = ctx.headers.get("eterctoken");
    if (header) tokens.push(escape_html(header));
    return [...new Set(tokens)];
  }

  /** Validate tokens against a single user level. Returns token or false. */
  validate_token_single_level(userTokens: string[], userLevel: number): string | false {
    for (const token of userTokens) {
      const row = db.query_bind(
        `SELECT eterc_tokens.token AS token
           FROM eterc_tokens
           INNER JOIN eterc_users ON eterc_tokens.user_id = eterc_users.id
          WHERE eterc_tokens.token = :token
            AND eterc_users.user_level_id = :level
            AND expiry_date > :now`,
        { token, level: userLevel, now: Math.floor(Date.now() / 1000) }
      ) as Array<{ token: string }>;
      if (row.length > 0) return row[0].token;
    }
    return false;
  }

  /** Validate tokens against multiple user levels. */
  validate_token_multi_level(userTokens: string[], userLevels: number[]): string | false {
    for (const token of userTokens) {
      const levels = userLevels
        .map((level, index) => ({ name: `level_${index}`, level }))
        .reduce(
          (acc, { name, level }) => {
            acc.params[name] = level;
            acc.conditions.push(`eterc_users.user_level_id = :${name}`);
            return acc;
          },
          { params: {} as Record<string, number>, conditions: [] as string[] }
        );

      const row = db.query_bind(
        `SELECT eterc_tokens.token AS token
           FROM eterc_tokens
           INNER JOIN eterc_users ON eterc_tokens.user_id = eterc_users.id
          WHERE eterc_tokens.token = :token
            AND (${levels.conditions.join(" OR ")})
            AND expiry_date > :now`,
        { token, now: Math.floor(Date.now() / 1000), ...levels.params }
      ) as Array<{ token: string }>;
      if (row.length > 0) return row[0].token;
    }
    return false;
  }

  /** Validate tokens against any user level. */
  validate_token_any_level(userTokens: string[]): string | false {
    for (const token of userTokens) {
      const rows = db.query_bind(
        `SELECT token FROM eterc_tokens WHERE token = :token AND expiry_date > :now`,
        { token, now: Math.floor(Date.now() / 1000) }
      ) as Array<{ token: string }>;
      if (rows.length > 0) return rows[0].token;
    }
    return false;
  }

  /** Delete specific tokens. */
  delete_tokens(tokens: string[]): void {
    for (const token of tokens) {
      db.query_bind("DELETE FROM eterc_tokens WHERE token = :token", { token });
    }
  }

  /** Delete expired tokens (optionally also all tokens of one user). */
  delete_old_tokens(userId?: number | null): void {
    const now = Math.floor(Date.now() / 1000);
    if (userId === undefined || userId === null) {
      db.query_bind("DELETE FROM eterc_tokens WHERE expiry_date < :now", { now });
    } else {
      db.query_bind("DELETE FROM eterc_tokens WHERE expiry_date < :now OR user_id = :userId", {
        now,
        userId,
      });
    }
  }

  /** Eterc user id for a token (or the ambient token sources). */
  get_user_id(token?: string | null): number | false {
    const tokens = this.buildTokenArray(token);
    if (tokens.length === 0) return false;
    for (const value of tokens) {
      const rows = db.query_bind("SELECT user_id FROM eterc_tokens WHERE token = :token", {
        token: value,
      }) as Array<{ user_id: number }>;
      if (rows.length > 0) return Number(rows[0].user_id);
    }
    return false;
  }

  /** Full Eterc user object for a token (or the ambient token sources). */
  get_user_obj(token?: string | null): EtercUserObj | false {
    const tokens = this.buildTokenArray(token);
    if (tokens.length === 0) return false;

    for (const value of tokens) {
      const rows = db.query_bind(
        `SELECT
            u.code as eterc_user_code,
            u.user_level_id as user_level_id,
            ul.level_title as user_level,
            t.token as token,
            t.user_id as eterc_user_id,
            t.expiry_date as expiry_date
          FROM eterc_tokens t
          INNER JOIN eterc_users u ON t.user_id = u.id
          INNER JOIN eterc_user_levels ul ON u.user_level_id = ul.id
          WHERE t.token = :token`,
        { token: value }
      ) as EtercUserObj[];
      if (rows.length > 0) return rows[0];
    }
    return false;
  }

  /** Title of the user level associated with the token. */
  get_user_level(token?: string | null): string | false {
    if (!token) {
      const userObj = this.get_user_obj();
      if (userObj === false) return false;
      token = userObj.token;
    }
    const userObj = this.get_user_obj(token);
    return userObj !== false ? (userObj.user_level ?? false) : false;
  }

  /** Attempt to find a valid token, optionally filtered by user level(s). */
  attempt_get_valid_token(userLevels: number | number[] | null = null): string | false {
    const userTokens = this.gather_user_tokens();
    if (userTokens.length === 0) return false;

    if (Array.isArray(userLevels)) {
      return this.validate_token_multi_level(userTokens, userLevels);
    }
    if (typeof userLevels === "number") {
      return this.validate_token_single_level(userTokens, userLevels);
    }
    return this.validate_token_any_level(userTokens);
  }

  /**
   * Generate a token for a user.
   * data: { user_id, expiry_date?, set_cookie?, code? }
   */
  generate_token(data: {
    user_id: number;
    expiry_date?: number;
    set_cookie?: boolean;
    code?: string;
  }): string {
    const ctx = get_context();
    const token = make_rand_str(32);
    const expiryDate = data.expiry_date ?? Math.floor(Date.now() / 1000) + DEFAULT_TOKEN_LIFESPAN;

    const dbData: Record<string, unknown> = {
      user_id: data.user_id,
      expiry_date: expiryDate,
      token,
    };
    if (data.code !== undefined) {
      dbData.code = data.code;
    }
    db.insert(dbData, "eterc_tokens");

    if (data.set_cookie === true) {
      if (ctx.canSetCookies) {
        ctx.responseCookies.push({
          name: AUTH_TOKEN_COOKIE,
          value: token,
          options: {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            maxAge: expiryDate - Math.floor(Date.now() / 1000),
          },
        });
      }
    } else {
      session_set("eterctoken", token);
    }

    return token;
  }

  /** Regenerate (rotate) an existing token with a new expiry date. */
  regenerate_token(oldToken: string, expiryDate: number): string | false {
    const rows = db.query_bind("SELECT * FROM eterc_tokens WHERE token = :token LIMIT 1", {
      token: oldToken,
    }) as TokenRow[];
    if (rows.length === 0) return false;

    const newToken = make_rand_str(32);
    db.update(rows[0].id, { expiry_date: expiryDate, token: newToken }, "eterc_tokens");
    return newToken;
  }

  /** Destroy the ambient token(s): session + cookie + database rows. */
  destroy(): void {
    const ctx = get_context();
    const tokensToDelete: string[] = [];

    const sessionToken = session_get<string>("eterctoken");
    if (sessionToken) {
      tokensToDelete.push(sessionToken);
      session_unset("eterctoken");
    }

    const cookieToken = ctx.cookies[AUTH_TOKEN_COOKIE];
    if (cookieToken) {
      tokensToDelete.push(cookieToken);
      if (ctx.canSetCookies) {
        ctx.responseCookies.push({
          name: AUTH_TOKEN_COOKIE,
          value: "x",
          options: { path: "/", maxAge: 0 },
        });
      }
    }

    const headerToken = ctx.headers.get("eterctoken");
    if (headerToken) {
      tokensToDelete.push(escape_html(headerToken));
    }

    if (tokensToDelete.length > 0) {
      this.delete_tokens(tokensToDelete);
    }
    this.delete_old_tokens();
  }
}

export const eterc_tokens = new Eterc_tokens();
