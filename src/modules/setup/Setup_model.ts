import { Model } from "@/engine/model";
import { sqlite } from "@/engine/db";
import { make_rand_str } from "@/engine/String_service";
import { ensure_dir } from "@/engine/paths";
import { ensure_cms_schema } from "@/modules/cms/cms-schema";
import { hashSync } from "bcryptjs";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Installer DDL for the SQLite schema.
 *
 * Mirrors prisma/schema.prisma so both Prisma and the framework Db layer can
 * use the same file. All statements are idempotent.
 */
const SETUP_SQL = `
CREATE TABLE IF NOT EXISTS "eterc_user_levels" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "level_title" TEXT DEFAULT ''
);
INSERT OR IGNORE INTO "eterc_user_levels" ("id", "level_title") VALUES (1, 'admin');

CREATE TABLE IF NOT EXISTS "eterc_users" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "code" TEXT,
  "user_level_id" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "eterc_administrators" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "username" TEXT,
  "email" TEXT,
  "password" TEXT,
  "eterc_user_id" INTEGER,
  "active" INTEGER NOT NULL DEFAULT 0,
  "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
  "last_failed_attempt" INTEGER NOT NULL DEFAULT 0,
  "login_blocked_until" INTEGER NOT NULL DEFAULT 0,
  "failed_login_ip" TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS "eterc_tokens" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "token" TEXT,
  "user_id" INTEGER NOT NULL DEFAULT 0,
  "expiry_date" INTEGER,
  "code" TEXT DEFAULT '0'
);
CREATE INDEX IF NOT EXISTS "eterc_tokens_token_idx" ON "eterc_tokens"("token");

CREATE TABLE IF NOT EXISTS "login_attempts" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "target_table" TEXT NOT NULL,
  "identifier" TEXT NOT NULL,
  "ip_address" TEXT NOT NULL DEFAULT '',
  "attempted_at" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "login_attempts_target_table_idx" ON "login_attempts"("target_table");
CREATE INDEX IF NOT EXISTS "login_attempts_identifier_idx" ON "login_attempts"("identifier");

CREATE TABLE IF NOT EXISTS "password_resets" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "target_table" TEXT NOT NULL,
  "identifier" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expiry_date" INTEGER NOT NULL,
  "used" INTEGER NOT NULL DEFAULT 0,
  "created_at" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "password_resets_token_idx" ON "password_resets"("token");
`;
export class Setup_model extends Model {
  /** True when an administrator account exists. */
  is_installed(): boolean {
    try {
      return this.db.count("eterc_administrators") > 0;
    } catch {
      return false;
    }
  }

  /**
   * Ensure the SQLite schema exists. Runs the idempotent DDL directly against
   * the SQLite file.
   */
  initialize_database(): { ok: boolean; message?: string } {
    try {
      sqlite().exec(SETUP_SQL);
      ensure_cms_schema();
      return { ok: true };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Database initialization failed.";
      return { ok: false, message };
    }
  }

  /** Create the initial admin account (users + levels + administrator rows). */
  create_admin_account(data: {
    username: string;
    email: string;
    password: string;
  }): { ok: boolean; errors?: Record<string, string[]>; message?: string } {
    const username = data.username.trim();
    const email = data.email.trim();

    if (this.db.get_one_where("username", username, "eterc_administrators")) {
      return { ok: false, errors: { username: ["That username is already taken."] } };
    }
    if (this.db.get_one_where("email", email, "eterc_administrators")) {
      return { ok: false, errors: { email: ["That email address is already registered."] } };
    }

    // Ensure the 'admin' user level exists (level 1).
    if (!this.db.get_where(1, "eterc_user_levels")) {
      this.db.insert({ id: 1, level_title: "admin" }, "eterc_user_levels");
    }

    const userCode = make_rand_str(32);
    const userId = this.db.insert(
      { code: userCode, user_level_id: 1 },
      "eterc_users"
    );

    const passwordHash = hashSync(data.password, 11);
    this.db.insert(
      {
        username,
        email,
        password: passwordHash,
        eterc_user_id: userId,
        active: 1,
      },
      "eterc_administrators"
    );

    return { ok: true };
  }

  /** Persist the "installed" marker. */
  finalize(adminUsername: string): { ok: boolean; message?: string } {
    try {
      const settingsDir = path.join(process.cwd(), "data", "settings");
      ensure_dir(settingsDir);
      fs.writeFileSync(
        path.join(settingsDir, "setup.json"),
        JSON.stringify(
          {
            installed_at: Math.floor(Date.now() / 1000),
            admin_username: adminUsername,
            database: "sqlite",
          },
          null,
          2
        ),
        "utf8"
      );
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to finalize setup.",
      };
    }
  }

  /** Path of the SQLite database file (shown in the wizard). */
  get_db_file(): string {
    return path.resolve(process.cwd(), "prisma", "dev.db");
  }
}
