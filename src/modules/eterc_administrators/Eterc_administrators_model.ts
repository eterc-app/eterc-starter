import { hashSync } from "bcryptjs";
import type { Row } from "@/engine/db";
import { Model } from "@/engine/model";
import { post } from "@/engine/post";
import { session_set } from "@/engine/session";
import { make_rand_str } from "@/engine/String_service";
import { eterc_tokens } from "@/engine/Eterc_tokens";

/**
 * Eterc administrators model — port of
 * modules/eterc_administrators/Eterc_administrators_model.php.
 *
 * PHP method names are preserved. Port notes:
 *  - passwords are hashed with bcryptjs (PHP: password_hash(PASSWORD_BCRYPT,
 *    ['cost' => 11]));
 *  - log_user_in() creates the token through the ported tokens service and
 *    additionally mirrors PHP by storing it in the session.
 */
export class Eterc_administrators_model extends Model {
  private table_name = "eterc_administrators";

  /** PHP: private find_one($column, $value) */
  private find_one(column: string, value: unknown): Row | false {
    const sql = `SELECT * FROM ${this.table_name} WHERE ${column} = :${column} LIMIT 1`;
    const rows = this.db.query_bind(sql, { [column]: value }) as Row[];
    return rows.length > 0 ? rows[0] : false;
  }

  /**
   * Get data from database for a specific record.
   * Returns false when the record does not exist.
   */
  get_data_from_db(record_id: number): Row | false {
    return this.find_one("id", record_id);
  }

  /** Get raw data from POST request (no conversions). */
  get_data_from_post(): Row {
    return {
      username: post("username", true),
      active: post("active", true),
    };
  }

  /**
   * Convert posted administrator data for database storage — handles the
   * active checkbox conversion from PHP boolean to integer (0/1):
   * PHP: $data['active'] = (int) (bool) $data['active'];
   */
  convert_posted_data_for_db(post_data: Row): Row {
    const data = { ...post_data };
    data.active = php_bool(data.active) ? 1 : 0;
    return data;
  }

  /** Update a record in the database. */
  update(update_id: number, data: Row): boolean {
    return this.db.update(update_id, data, this.table_name);
  }

  /** Hash the provided plain-text password and update the record. */
  update_password(update_id: number, new_password: string): boolean {
    const data: Row = { password: this.hash_password(new_password) };
    return this.db.update(update_id, data, this.table_name);
  }

  /** PHP: password_hash($password, PASSWORD_BCRYPT, ['cost' => 11]) */
  private hash_password(password: string): string {
    return hashSync(password, 11);
  }

  /** Fetch a user record by ID. */
  get_user_by_id(user_id: number): Row | false {
    return this.find_one("id", user_id);
  }

  /** Fetch any active user record (used in dev mode to auto-login). */
  get_any_active_user(): Row | false {
    const sql = `SELECT * FROM ${this.table_name} WHERE active = 1 ORDER BY id ASC LIMIT 1`;
    const rows = this.db.query_bind(sql, []) as Row[];
    return rows.length > 0 ? rows[0] : false;
  }

  /**
   * Log a user in by username and create an authentication token.
   *
   * @param username The username to log in
   * @param remember 0 for session-only, 1 for persistent cookie (30 days)
   * @returns The token string on success, false on failure
   */
  log_user_in(username: string, remember: number): string | false {
    const user_obj = this.find_one("username", username);

    if (user_obj === false) {
      return false;
    }

    const now = Math.floor(Date.now() / 1000);
    const expiry_date = remember === 1 ? now + 86400 * 30 : now + 86400;

    const token = eterc_tokens.generate_token({
      user_id: Number(user_obj.eterc_user_id ?? 0),
      expiry_date,
      set_cookie: remember === 1,
      code: "0",
    });

    // Store the token in the session too (PHP always sets $_SESSION).
    session_set("eterctoken", token);

    return token;
  }

  /** Fetch a user record by authentication token (PHP INNER JOIN). */
  get_user_by_token(token: string): Row | false {
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
    const rows = this.db.query_bind(sql, { token }) as Row[];
    return rows.length > 0 ? rows[0] : false;
  }

  /** Retrieve a paginated set of records (ordered by id). */
  get_all_paginated(limit: number, offset: number): Row[] {
    const sql = `SELECT * FROM ${this.table_name} ORDER BY id LIMIT :limit OFFSET :offset`;
    return this.db.query_bind(sql, { limit, offset }) as Row[];
  }

  /** Prepare multiple records for display in list views. */
  prepare_records_for_display(rows: Row[]): Row[] {
    return rows.map((row) => this.prepare_for_display({ ...row }));
  }

  /**
   * Prepare a single record for display — adds derived, human-readable values
   * without mutating raw data.
   */
  prepare_for_display(data: Row): Row {
    if ("active" in data) {
      data.active_formatted = Number(data.active) === 1 ? "Active" : "Not Active";
    }

    return data;
  }

  /** Count all records in the database table. */
  count_all(): number {
    return this.db.count(this.table_name);
  }

  /**
   * Check whether a username is available for use.
   *
   * update_id = 0 (create): available only when the username does not exist.
   * update_id > 0 (update): the username belonging to the same record passes.
   */
  is_username_available(username: string, update_id = 0): boolean {
    const params: Row = { username };
    let sql = `SELECT id FROM ${this.table_name} WHERE username = :username`;

    if (update_id > 0) {
      sql += " AND id != :update_id";
      params.update_id = update_id;
    }

    const rows = this.db.query_bind(sql, params) as Row[];
    return rows.length === 0;
  }

  /**
   * Create a new record with its associated user account (two-step creation:
   * first 'eterc_users', then the main table with the foreign key).
   */
  create_new_record(data: Row): number {
    const eterc_user_data: Row = {
      code: make_rand_str(32),
      user_level_id: 1,
    };

    data.eterc_user_id = this.db.insert(eterc_user_data, "eterc_users");

    // Set defaults.
    data.active = data.active ?? 1;
    data.failed_login_attempts = data.failed_login_attempts ?? 0;
    data.last_failed_attempt = data.last_failed_attempt ?? 0;
    data.login_blocked_until = data.login_blocked_until ?? 0;
    data.failed_login_ip = data.failed_login_ip ?? "";

    // PHP generates a random password for new records.
    data.password = this.hash_password(make_rand_str(16));

    return this.db.insert(data, this.table_name);
  }

  /**
   * Delete a record and its associated user account (delete from the main
   * table, then from 'eterc_users').
   */
  delete_record(update_id: number): boolean {
    const sql = `SELECT eterc_user_id FROM ${this.table_name} WHERE id = :id`;
    const rows = this.db.query_bind(sql, { id: update_id }) as Row[];

    if (rows.length === 0) {
      return false;
    }

    this.db.delete(update_id, this.table_name);

    const eterc_user_id = Number(rows[0].eterc_user_id ?? 0);
    if (eterc_user_id > 0) {
      this.db.delete(eterc_user_id, "eterc_users");
    }

    return true;
  }
}

/** PHP (bool) cast semantics (only '' and '0' are falsy strings). */
function php_bool(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (value === false || value === 0 || value === "") return false;
  if (value === "0") return false;
  return true;
}
