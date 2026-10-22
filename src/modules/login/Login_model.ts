import { Model } from "@/engine/model";
import type { Row } from "@/engine/db";
import { get_context } from "@/engine/request-context";
import { make_rand_str } from "@/engine/String_service";
import { Eterc_tokens } from "@/engine/Eterc_tokens";
import {
  LOGIN_CONFIG,
  type LoginConfig,
  type LoginUserLevel,
} from "@/engine/config";
import { compareSync, hashSync } from "bcryptjs";
import { send_email } from "@/modules/eterc_email";

/**
 * Login model — port of modules/login/Login_model.php.
 *
 * Handles authentication, rate limiting, token management and password resets
 * against configurable user tables (per user level). Configuration comes from
 * LOGIN_CONFIG (src/engine/config.ts), the ported config/login.php.
 */

export interface PasswordResetRow extends Row {
  id: number;
  target_table: string;
  identifier: string;
  token: string;
  expiry_date: number;
  used: number;
  created_at: number;
}

export class Login_model extends Model {
  // -----------------------------------------------------------------
  // Configuration
  // -----------------------------------------------------------------

  /** The ported configuration (PHP: APPPATH/config/login.php or module config). */
  load_config(): LoginConfig {
    return LOGIN_CONFIG;
  }

  /** Get the resolved configuration for a specific user level. */
  get_level_config(user_level_id: number): LoginUserLevel {
    const level_specific = LOGIN_CONFIG.user_levels[user_level_id];

    if (!level_specific) {
      throw new Error(`No login configuration found for user level: ${user_level_id}`);
    }

    return level_specific;
  }

  /** Get a global config value (PHP: get_global_config()). */
  get_global_config<K extends keyof LoginConfig>(key: K): LoginConfig[K] {
    return LOGIN_CONFIG[key];
  }

  /** List of all configured user level IDs. */
  get_configured_levels(): number[] {
    return Object.keys(LOGIN_CONFIG.user_levels).map((level) => Number(level));
  }

  /** All configured user level configs, keyed by level ID. */
  get_configured_level_configs(): Record<number, LoginUserLevel> {
    return LOGIN_CONFIG.user_levels;
  }

  /** URL slug for a user level (the secret word when configured, else the ID). */
  get_login_url(user_level_id: number): string {
    const config = LOGIN_CONFIG.user_levels[user_level_id];

    if (config && config.secret_login_word) {
      return config.secret_login_word;
    }

    return String(user_level_id);
  }

  // -----------------------------------------------------------------
  // Authentication
  // -----------------------------------------------------------------

  /**
   * Validate login credentials against the configured user table for a level.
   *
   * Uses the same timing-safe pattern as the PHP original: a bcrypt comparison
   * is always performed — even when the user does not exist — to prevent
   * username enumeration.
   */
  validate_credentials(
    identifier: string,
    password: string,
    user_level_id: number
  ): boolean {
    const config = this.get_level_config(user_level_id);
    const password_field = config.fields.password.column;

    const user = this.find_user(identifier, user_level_id);

    // Get a timing-safe hash.
    let hash_to_verify = this.get_timing_safe_hash(user_level_id);

    const stored_password =
      user !== false ? user[password_field] : undefined;

    if (user !== false && typeof stored_password === "string" && stored_password !== "") {
      hash_to_verify = stored_password;
    }

    const password_valid = safeCompare(password, hash_to_verify);

    return (
      user !== false &&
      typeof stored_password === "string" &&
      stored_password !== "" &&
      Number((user as Row).active ?? 1) === 1 &&
      password_valid
    );
  }

  /** Get the list of identifier columns for a given user level. */
  get_identifier_columns(user_level_id: number): string[] {
    const config = this.get_level_config(user_level_id);
    return Object.values(config.fields.identifiers).map((ident) => ident.column);
  }

  /** Combined, human-readable identifier label ('Username or Email'). */
  get_identifier_label(user_level_id: number): string {
    const config = this.get_level_config(user_level_id);
    const labels = Object.values(config.fields.identifiers).map((ident) => ident.label);
    return labels.join(" or ");
  }

  /**
   * Find a user record, trying each configured identifier column in order.
   * The submitted value can match any configured identifier (username OR email).
   */
  find_user(identifier: string, user_level_id: number): Row | false {
    const config = this.get_level_config(user_level_id);
    const table = config.target_table;

    for (const column of this.get_identifier_columns(user_level_id)) {
      const row = this.db.get_one_where(column, identifier, table);
      if (row !== false) {
        return row;
      }
    }

    return false;
  }

  /** Find a user by any configured identifier — used by the forgot-password flow. */
  find_user_lax(submitted: string, user_level_id: number): Row | false {
    return this.find_user(submitted, user_level_id);
  }

  /**
   * Timing-safe bcrypt hash: the first stored password hash in the table, or a
   * freshly generated dummy hash when the table has no hashes yet.
   */
  private get_timing_safe_hash(user_level_id: number): string {
    const config = this.get_level_config(user_level_id);
    const table = config.target_table;
    const pw_field = config.fields.password.column;
    const cost = LOGIN_CONFIG.password_hash_cost ?? 11;

    const rows = this.db.query_bind(
      `SELECT ${quote_id(pw_field)} FROM ${quote_id(table)}
        WHERE ${quote_id(pw_field)} IS NOT NULL
          AND ${quote_id(pw_field)} != '' LIMIT 1`,
      [],
      "object"
    ) as Row[];

    if (rows.length > 0) {
      const candidate = rows[0][pw_field];
      if (typeof candidate === "string" && candidate !== "") {
        return candidate;
      }
    }

    return hashSync("timing_protection_dummy", cost);
  }

  // -----------------------------------------------------------------
  // Rate Limiting
  // -----------------------------------------------------------------

  /** Whether a login attempt is allowed for the identifier / IP. */
  is_login_allowed(identifier: string, user_level_id: number): boolean {
    this.remove_expired_restrictions(user_level_id);

    const max_attempts = Number(LOGIN_CONFIG.max_failed_attempts ?? 3);
    const block_duration = Number(LOGIN_CONFIG.block_duration ?? 900);
    const block_time = now_seconds() - block_duration;

    // Check by identifier.
    if (
      this.count_recent_attempts(user_level_id, "identifier", identifier, block_time) >=
      max_attempts
    ) {
      return false;
    }

    // Check by IP.
    if (
      this.count_recent_attempts(user_level_id, "ip_address", this.ip_address(), block_time) >=
      max_attempts
    ) {
      return false;
    }

    return true;
  }

  /** Count recent failed attempts matching a field. */
  private count_recent_attempts(
    user_level_id: number,
    field: "identifier" | "ip_address",
    value: string,
    since_time: number
  ): number {
    const config = this.get_level_config(user_level_id);

    const rows = this.db.query_bind(
      `SELECT COUNT(*) as cnt FROM login_attempts
        WHERE target_table = :target_table
          AND ${quote_id(field)} = :value
          AND attempted_at > :since_time`,
      {
        target_table: config.target_table,
        value,
        since_time,
      },
      "object"
    ) as Array<{ cnt: number }>;

    return rows.length > 0 ? Number(rows[0].cnt) : 0;
  }

  /** Record a failed login attempt. */
  record_failed_attempt(identifier: string, user_level_id: number): void {
    const config = this.get_level_config(user_level_id);

    this.db.insert(
      {
        target_table: config.target_table,
        identifier,
        ip_address: this.ip_address(),
        attempted_at: now_seconds(),
      },
      "login_attempts"
    );
  }

  /** Remove expired restriction records for the level's target table. */
  remove_expired_restrictions(user_level_id: number): void {
    const config = this.get_level_config(user_level_id);
    const block_duration = Number(LOGIN_CONFIG.block_duration ?? 900);
    const cutoff = now_seconds() - block_duration;

    this.db.query_bind(
      `DELETE FROM login_attempts
        WHERE target_table = :target_table
          AND attempted_at < :cutoff`,
      {
        target_table: config.target_table,
        cutoff,
      }
    );
  }

  /** Clear all failed attempts for a given identifier. */
  clear_failed_attempts(identifier: string, user_level_id: number): void {
    const config = this.get_level_config(user_level_id);

    this.db.query_bind(
      `DELETE FROM login_attempts
        WHERE target_table = :target_table
          AND identifier = :identifier`,
      {
        target_table: config.target_table,
        identifier,
      }
    );
  }

  /** Unlock all users (dev mode only). */
  unlock_all(): void {
    // PHP: TRUNCATE TABLE login_attempts.
    this.db.attempt_truncate("login_attempts");
  }

  // -----------------------------------------------------------------
  // Login / Token Management
  // -----------------------------------------------------------------

  /**
   * Log a user in and create an authentication token.
   *
   * @param remember 0 for session storage, 1 for a persistent cookie.
   * @returns the token string, or false on failure.
   */
  log_user_in(
    identifier: string,
    user_level_id: number,
    remember = 0
  ): string | false {
    const config = this.get_level_config(user_level_id);
    const user = this.find_user(identifier, user_level_id);

    if (user === false) {
      return false;
    }

    const eterc_user_id = this.get_user_ref_id(user, config);

    if (eterc_user_id <= 0) {
      return false;
    }

    const tokens = new Eterc_tokens();
    let token: string;

    if (remember === 1 && config.allow_remember === 1) {
      const expiry_date = now_seconds() + 86400 * config.remember_days;
      token = tokens.generate_token({
        user_id: eterc_user_id,
        expiry_date,
        set_cookie: true,
      });
    } else {
      // generate_token() stores the token in the session when not persisting
      // a cookie — parity with $_SESSION['eterctoken'] = $token.
      token = tokens.generate_token({ user_id: eterc_user_id });
    }

    this.update_login_stats(config, user);
    return token;
  }

  /**
   * Update login statistics on the user's record.
   *
   * After a successful login, checks whether the target table has columns
   * named 'num_logins' and/or 'last_login'. If present, num_logins is
   * incremented and last_login is set to the current date/time. This is
   * purely opt-in: if the columns do not exist, nothing happens.
   */
  private update_login_stats(config: LoginUserLevel, user: Row): void {
    const table = config.target_table;
    const user_ref_field = config.user_ref_field;
    const user_id = this.get_user_ref_id(user, config);

    if (user_id <= 0 || user_ref_field === "") {
      return;
    }

    const columns = this.db.describe_table(table);

    if (columns === false || !Array.isArray(columns)) {
      return; // Table not found or error.
    }

    const set_clauses: string[] = [];
    const params: Row = { user_id };
    let has_last_login = false;

    for (const col of columns) {
      const col_name = String(col.name ?? "");

      if (col_name === "num_logins") {
        set_clauses.push("num_logins = num_logins + 1");
      }

      if (col_name === "last_login") {
        has_last_login = true;
        const type = String(col.type ?? "").toLowerCase();

        if (type.includes("int")) {
          // Integer column — store Unix timestamp.
          params.last_login = now_seconds();
        } else if (type.startsWith("date")) {
          // DATE column — store Y-m-d.
          params.last_login = date_ymd();
        } else if (type.startsWith("datetime") || type.startsWith("timestamp")) {
          // DATETIME or TIMESTAMP column.
          params.last_login = date_ymd_his();
        } else {
          // Unknown type — skip last_login update.
          has_last_login = false;
        }

        if (has_last_login) {
          set_clauses.push("last_login = :last_login");
        }
      }
    }

    if (set_clauses.length === 0) {
      return; // Neither column exists (or unknown type).
    }

    this.db.query_bind(
      `UPDATE ${quote_id(table)}
          SET ${set_clauses.join(", ")}
        WHERE ${quote_id(user_ref_field)} = :user_id`,
      params
    );
  }

  // -----------------------------------------------------------------
  // Password Reset
  // -----------------------------------------------------------------

  /** Generate a password reset token, or false when the user is not found. */
  generate_reset_token(
    identifier: string,
    user_level_id: number
  ): string | false {
    const user = this.find_user(identifier, user_level_id);

    if (user === false) {
      return false;
    }

    const config = this.get_level_config(user_level_id);
    const lifespan = Number(LOGIN_CONFIG.reset_token_lifespan ?? 3600);
    const token = make_rand_str(64);

    this.db.insert(
      {
        target_table: config.target_table,
        identifier,
        token,
        expiry_date: now_seconds() + lifespan,
        used: 0,
        created_at: now_seconds(),
      },
      "password_resets"
    );

    return token;
  }

  /** Validate a password reset token — returns the reset record or false. */
  validate_reset_token(token: string): PasswordResetRow | false {
    const rows = this.db.query_bind(
      `SELECT * FROM password_resets
        WHERE token = :token
          AND used = 0
          AND expiry_date > :now
        LIMIT 1`,
      {
        token,
        now: now_seconds(),
      },
      "object"
    ) as PasswordResetRow[];

    return rows.length > 0 ? rows[0] : false;
  }

  /** Update a user's password using a validated reset token. */
  reset_password(token: string, new_password: string): boolean {
    const reset = this.validate_reset_token(token);

    if (reset === false) {
      return false;
    }

    const cost = Number(LOGIN_CONFIG.password_hash_cost ?? 11);
    const hash = hashSync(new_password, cost);

    // Find the password field and first identifier column for this target table.
    const full = this.load_config();
    let pw_field = "password";
    let ident_field = "email_address";

    for (const level_config of Object.values(full.user_levels)) {
      if (level_config.target_table === reset.target_table) {
        pw_field = level_config.fields.password.column;

        const first_ident = Object.values(level_config.fields.identifiers)[0];
        if (first_ident) {
          ident_field = first_ident.column;
        }

        break;
      }
    }

    // Update password in target table.
    this.db.query_bind(
      `UPDATE ${quote_id(reset.target_table)}
          SET ${quote_id(pw_field)} = :hash
        WHERE ${quote_id(ident_field)} = :identifier`,
      {
        hash,
        identifier: reset.identifier,
      }
    );

    // Mark token as used.
    this.db.query_bind("UPDATE password_resets SET used = 1 WHERE token = :token", {
      token,
    });

    // Delete existing auth tokens for this user (force re-login).
    const level_id = this.get_level_id_for_table(reset.target_table);

    if (level_id > 0) {
      const level_config = this.get_level_config(level_id);
      const user = this.find_user(reset.identifier, level_id);

      if (user !== false) {
        const eterc_user_id = this.get_user_ref_id(user, level_config);

        if (eterc_user_id > 0) {
          new Eterc_tokens().delete_old_tokens(eterc_user_id);
        }
      }
    }

    return true;
  }

  /**
   * Send a password reset email.
   *
   * Builds the same plain-text message as the PHP original and delegates
   * delivery to the ported eterc_email module.
   */
  async send_reset_email(to_email: string, reset_link: string): Promise<boolean> {
    let body = "Hello,\n\n";
    body += "We received a request to reset your password.\n\n";
    body += "Click the link below to reset your password:\n";
    body += reset_link + "\n\n";
    body += "This link will expire in 1 hour.\n\n";
    body += "If you did not request a password reset, you can safely ignore this email.\n";

    // PHP: nl2br().
    const html_body = body.replace(/\n/g, "<br />\n");

    return send_email(to_email, "Password Reset Request", `<p>${html_body}</p>`);
  }

  // -----------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------

  /** Get the user level ID associated with a reset token (null when invalid). */
  get_level_id_for_token(token: string): number | null {
    const reset = this.validate_reset_token(token);

    if (reset === false) {
      return null;
    }

    return this.get_level_id_for_table(reset.target_table);
  }

  /** Find the user level ID for a given target table name (0 when not found). */
  private get_level_id_for_table(table_name: string): number {
    const full = this.load_config();

    for (const [level_id, level_config] of Object.entries(full.user_levels)) {
      if (level_config.target_table === table_name) {
        return Number(level_id);
      }
    }

    return 0;
  }

  /** Hash a password with bcrypt using the configured cost factor. */
  hash_password(password: string): string {
    const cost = Number(LOGIN_CONFIG.password_hash_cost ?? 11);
    return hashSync(password, cost);
  }

  /** The user's eterc_users.id, honouring the configured reference column. */
  private get_user_ref_id(user: Row, config: LoginUserLevel): number {
    const configured = user[config.user_ref_field];

    if (configured !== undefined && configured !== null) {
      const parsed = Number(configured);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return 0;
  }

  /** Best-effort client IP address for rate-limit tracking. */
  private ip_address(): string {
    const ctx = get_context();

    const forwarded = ctx.headers.get("x-forwarded-for");
    if (forwarded) {
      const first = forwarded.split(",")[0]?.trim();
      if (first) return first;
    }

    return ctx.headers.get("x-real-ip") ?? "127.0.0.1";
  }
}

// ---------------------------------------------------------------------------
// Module helpers
// ---------------------------------------------------------------------------

function now_seconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Safely quote a database identifier (PHP: quote_id()). */
function quote_id(identifier: string): string {
  const clean = identifier.replace(/[^a-zA-Z0-9_]/g, "");

  if (clean === "") {
    throw new Error("Invalid database identifier.");
  }

  return "`" + clean + "`";
}

/** bcrypt comparison that mirrors password_verify() on malformed hashes. */
function safeCompare(password: string, hash: string): boolean {
  try {
    return compareSync(password, hash);
  } catch {
    return false;
  }
}

function pad(number: number): string {
  return String(number).padStart(2, "0");
}

function date_ymd(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function date_ymd_his(): string {
  const now = new Date();
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  );
}

export default Login_model;
