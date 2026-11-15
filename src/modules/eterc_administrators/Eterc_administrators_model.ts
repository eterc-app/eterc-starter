import { hashSync } from "bcryptjs";
import { type Db, type Row } from "@/engine/db";
import { configuredDatabaseProvider } from "@/engine/db/gateway";
import { eterc_tokens, hashAuthToken } from "@/engine/Eterc_tokens";
import { Model } from "@/engine/model";
import { post } from "@/engine/post";
import { session_set } from "@/engine/session";
import { make_rand_str } from "@/engine/String_service";
import { ensure_administrator_schema } from "./administrator-schema";

const ADMINISTRATOR_COLUMNS = [
  "username",
  "email",
  "first_name",
  "last_name",
  "title",
  "active",
] as const;

export class Eterc_administrators_model extends Model {
  private table_name = "eterc_administrators";

  constructor(moduleName?: string | null) {
    super(moduleName);
    if (configuredDatabaseProvider() === "sqlite") {
      void ensure_administrator_schema();
    }
  }

  private async find_one(column: string, value: unknown): Promise<Row | false> {
    return this.db.get_one_where(column, value, this.table_name);
  }

  /**
   * Get data from database for a specific record.
   * Returns false when the record does not exist.
   */
  async get_data_from_db(record_id: number): Promise<Row | false> {
    return this.find_one("id", record_id);
  }

  /** Get raw data from POST request (no conversions). */
  get_data_from_post(): Row {
    return {
      username: post("username", true),
      email: post("email", true),
      first_name: post("first_name", true),
      last_name: post("last_name", true),
      title: post("title", true),
      role_id: post("role_id", true),
      active: post("active", true),
    };
  }

  convert_posted_data_for_db(post_data: Row): Row {
    const data = { ...post_data };
    data.active = to_boolean(data.active) ? 1 : 0;
    if (typeof data.email === "string") {
      data.email = data.email.trim().toLowerCase();
    }
    delete data.role_id;
    delete data.password;
    delete data.confirm_password;
    return data;
  }

  /** Update a record in the database. */
  async update(update_id: number, data: Row): Promise<boolean> {
    return this.db.update(update_id, data, this.table_name);
  }

  /** Hash the provided plain-text password and update the record. */
  async update_password(
    update_id: number,
    new_password: string,
  ): Promise<boolean> {
    return this.db.update(
      update_id,
      this.password_patch(new_password),
      this.table_name,
    );
  }

  private password_patch(new_password: string): Row {
    return {
      password: this.hash_password(new_password),
      failed_login_attempts: 0,
      last_failed_attempt: 0,
      login_blocked_until: 0,
      failed_login_ip: "",
    };
  }

  private hash_password(password: string): string {
    return hashSync(password, 11);
  }

  /** Fetch a user record by ID. */
  async get_user_by_id(user_id: number): Promise<Row | false> {
    return this.find_one("id", user_id);
  }

  /** Fetch any active user record (used in dev mode to auto-login). */
  async get_any_active_user(): Promise<Row | false> {
    const sql = `SELECT * FROM ${this.table_name} WHERE active = 1 ORDER BY id ASC LIMIT 1`;
    const rows = (await this.db.query_bind(sql, [])) as Row[];
    return rows.length > 0 ? rows[0] : false;
  }

  /**
   * Log a user in by username and create an authentication token.
   *
   * @param username The username to log in
   * @param remember 0 for session-only, 1 for persistent cookie (30 days)
   * @returns The token string on success, false on failure
   */
  async log_user_in(username: string, remember: number): Promise<string | false> {
    const user_obj = await this.find_one("username", username);

    if (user_obj === false) {
      return false;
    }

    const now = Math.floor(Date.now() / 1000);
    const expiry_date = remember === 1 ? now + 86400 * 30 : now + 86400;

    const token = await eterc_tokens.generate_token({
      user_id: Number(user_obj.eterc_user_id ?? 0),
      expiry_date,
      set_cookie: remember === 1,
      code: "0",
    });

    await session_set("eterctoken", token);

    return token;
  }

  async get_user_by_token(token: string): Promise<Row | false> {
    const sql = `SELECT
                    ${this.table_name}.*
                  FROM
                    ${this.table_name}
                  INNER JOIN
                    eterc_tokens
                  ON
                    ${this.table_name}.eterc_user_id = eterc_tokens.user_id
                  WHERE
                    eterc_tokens.token = :token`;
    const rows = (await this.db.query_bind(sql, {
      token: hashAuthToken(token),
    })) as Row[];
    return rows.length > 0 ? rows[0] : false;
  }

  /** Retrieve a paginated set of records with their current role. */
  async get_all_paginated(limit: number, offset: number): Promise<Row[]> {
    const sql = `SELECT
                    a.id,
                    a.username,
                    a.email,
                    a.first_name,
                    a.last_name,
                    a.title,
                    a.active,
                    a.eterc_user_id,
                    u.user_level_id,
                    r.id AS role_id,
                    COALESCE(r.name, 'Unassigned') AS role_name,
                    COALESCE(r.slug, '') AS role_slug
                  FROM ${this.table_name} a
                  LEFT JOIN eterc_users u ON u.id = a.eterc_user_id
                  LEFT JOIN eterc_roles r ON r.user_level_id = u.user_level_id
                  ORDER BY a.id
                  LIMIT :limit OFFSET :offset`;
    return (await this.db.query_bind(sql, { limit, offset })) as Row[];
  }

  /** Prepare multiple records for display in list views. */
  prepare_records_for_display(rows: Row[]): Row[] {
    return rows.map((row) => this.prepare_for_display({ ...row }));
  }

  /**
   * Prepare a single record for display â€” adds derived, human-readable values
   * and removes credential / lockout internals before they reach a view.
   */
  prepare_for_display(data: Row): Row {
    delete data.password;
    delete data.failed_login_attempts;
    delete data.last_failed_attempt;
    delete data.login_blocked_until;
    delete data.failed_login_ip;

    const first = String(data.first_name ?? "").trim();
    const last = String(data.last_name ?? "").trim();
    const username = String(data.username ?? "").trim();
    const email = String(data.email ?? "").trim();

    data.display_name = [first, last].filter(Boolean).join(" ") || username || email;
    data.initials = (
      first && last
        ? `${first.charAt(0)}${last.charAt(0)}`
        : (username || email).slice(0, 2)
    ).toUpperCase();

    if ("active" in data) {
      data.active_formatted = Number(data.active) === 1 ? "Active" : "Suspended";
    }

    return data;
  }

  /** Count all records in the database table. */
  async count_all(): Promise<number> {
    return this.db.count(this.table_name);
  }

  /**
   * Check whether a username is available for use.
   *
   * update_id = 0 (create): available only when the username does not exist.
   * update_id > 0 (update): the username belonging to the same record passes.
   */
  async is_username_available(username: string, update_id = 0): Promise<boolean> {
    const params: Row = { username };
    let sql = `SELECT id FROM ${this.table_name} WHERE LOWER(username) = LOWER(:username)`;

    if (update_id > 0) {
      sql += " AND id != :update_id";
      params.update_id = update_id;
    }

    const rows = (await this.db.query_bind(sql, params)) as Row[];
    return rows.length === 0;
  }

  /** Check whether an email address is available for use. */
  async is_email_available(email: string, update_id = 0): Promise<boolean> {
    const params: Row = { email };
    let sql = `SELECT id FROM ${this.table_name} WHERE LOWER(email) = LOWER(:email)`;

    if (update_id > 0) {
      sql += " AND id != :update_id";
      params.update_id = update_id;
    }

    const rows = (await this.db.query_bind(sql, params)) as Row[];
    return rows.length === 0;
  }

  /** Return a role row by primary key. */
  async get_role_by_id(role_id: number): Promise<Row | false> {
    const rows = (await this.db.query_bind(
      "SELECT * FROM eterc_roles WHERE id = :role_id LIMIT 1",
      { role_id },
    )) as Row[];
    return rows.length > 0 ? rows[0] : false;
  }

  /** Return the role id assigned to an administrator record. */
  async get_role_id_for_admin(administrator_id: number): Promise<number> {
    const rows = (await this.db.query_bind(
      `SELECT r.id AS role_id
         FROM ${this.table_name} a
         LEFT JOIN eterc_users u ON u.id = a.eterc_user_id
         LEFT JOIN eterc_roles r ON r.user_level_id = u.user_level_id
        WHERE a.id = :administrator_id
        LIMIT 1`,
      { administrator_id },
    )) as Row[];
    const roleId = Number(rows[0]?.role_id ?? 0);
    return Number.isFinite(roleId) && roleId > 0 ? roleId : 0;
  }

  /** Count active accounts that can still open the admin area. */
  async count_active_admins(): Promise<number> {
    const rows = (await this.db.query_bind(
      `SELECT COUNT(*) AS num
         FROM ${this.table_name} a
         INNER JOIN eterc_users u ON u.id = a.eterc_user_id
         INNER JOIN eterc_roles r ON r.user_level_id = u.user_level_id
        WHERE a.active = 1 AND r.admin_access = 1`,
      [],
    )) as Row[];
    return Number(rows[0]?.num ?? 0);
  }

  /**
   * Create a new record with its associated user account (two-step creation:
   * first 'eterc_users', then the main table with the foreign key).
   */
  async create_new_record(
    data: Row,
    role_id: number,
    password: string,
  ): Promise<number> {
    const role = await this.get_role_by_id(role_id);
    if (role === false) {
      throw new Error("The selected role was not found.");
    }

    return this.db.transaction(async (trx: Db) => {
      const eterc_user_id = await trx.insert(
        {
          code: make_rand_str(32),
          user_level_id: Number(role.user_level_id ?? 0),
        },
        "eterc_users",
      );

      const record: Row = { ...data };
      delete record.role_id;
      delete record.password;
      delete record.confirm_password;
      record.eterc_user_id = eterc_user_id;
      record.active = record.active ?? 1;
      record.failed_login_attempts = 0;
      record.last_failed_attempt = 0;
      record.login_blocked_until = 0;
      record.failed_login_ip = "";
      record.password = this.hash_password(password);

      return trx.insert(record, this.table_name);
    });
  }

  /**
   * Update account details, the linked role, and optionally the password in one
   * transaction. The password hash never leaves this model.
   */
  async update_record(
    update_id: number,
    data: Row,
    role_id: number,
    password?: string,
    revoke_sessions = false,
  ): Promise<boolean> {
    const existing = await this.get_data_from_db(update_id);
    if (existing === false) return false;

    const role = await this.get_role_by_id(role_id);
    if (role === false) {
      throw new Error("The selected role was not found.");
    }

    return this.db.transaction(async (trx: Db) => {
      const record: Row = { ...data };
      for (const key of Object.keys(record)) {
        if (
          !ADMINISTRATOR_COLUMNS.includes(
            key as (typeof ADMINISTRATOR_COLUMNS)[number],
          )
        ) {
          delete record[key];
        }
      }

      await trx.update(update_id, record, this.table_name);

      let eterc_user_id = Number(existing.eterc_user_id ?? 0);
      if (eterc_user_id > 0) {
        await trx.update(
          eterc_user_id,
          { user_level_id: Number(role.user_level_id ?? 0) },
          "eterc_users",
        );
      } else {
        eterc_user_id = await trx.insert(
          {
            code: make_rand_str(32),
            user_level_id: Number(role.user_level_id ?? 0),
          },
          "eterc_users",
        );
        await trx.update(update_id, { eterc_user_id }, this.table_name);
      }

      if (password && password !== "") {
        await trx.update(
          update_id,
          this.password_patch(password),
          this.table_name,
        );
      }

      if (
        (password && password !== "" && revoke_sessions) ||
        Number(record.active ?? existing.active ?? 0) !== 1
      ) {
        await trx.query_bind(
          "DELETE FROM eterc_tokens WHERE user_id = :eterc_user_id",
          { eterc_user_id },
        );
      }

      return true;
    });
  }

  /** Remove all active sign-in tokens for one user account. */
  async revoke_user_sessions(eterc_user_id: number): Promise<void> {
    if (eterc_user_id <= 0) return;
    await this.db.query_bind(
      "DELETE FROM eterc_tokens WHERE user_id = :eterc_user_id",
      { eterc_user_id },
    );
  }

  /**
   * Delete a record and its associated user account, sessions, and API keys.
   */
  async delete_record(update_id: number): Promise<boolean> {
    const rows = (await this.db.query_bind(
      `SELECT eterc_user_id FROM ${this.table_name} WHERE id = :id`,
      { id: update_id },
    )) as Row[];

    if (rows.length === 0) {
      return false;
    }

    const eterc_user_id = Number(rows[0].eterc_user_id ?? 0);

    return this.db.transaction(async (trx: Db) => {
      await trx.delete(update_id, this.table_name);

      if (eterc_user_id > 0) {
        await trx.query_bind(
          "DELETE FROM eterc_tokens WHERE user_id = :eterc_user_id",
          { eterc_user_id },
        );
        if (await trx.table_exists("eterc_api_keys")) {
          await trx.query_bind(
            "DELETE FROM eterc_api_keys WHERE user_id = :eterc_user_id",
            { eterc_user_id },
          );
        }
        await trx.delete(eterc_user_id, "eterc_users");
      }

      return true;
    });
  }
}

/** Boolean cast semantics (only '' and '0' are falsy strings). */
function to_boolean(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (value === false || value === 0 || value === "") return false;
  if (value === "0") return false;
  return true;
}

