#!/usr/bin/env node
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Base schema shipped by the starter. Dynamic CMS collection tables and any
 * developer/test tables are intentionally not part of this list.
 */
export const BASE_TABLES = [
  "cms_collections",
  "cms_fields",
  "cms_flow_jobs",
  "cms_flow_operations",
  "cms_flow_run_steps",
  "cms_flow_runs",
  "cms_flows",
  "cms_media_assets",
  "cms_media_audit",
  "cms_media_variants",
  "cms_migrations",
  "et_sessions",
  "eterc_administrators",
  "eterc_api_keys",
  "eterc_identities",
  "eterc_permissions",
  "eterc_roles",
  "eterc_tokens",
  "eterc_user_levels",
  "eterc_users",
  "login_attempts",
  "password_resets",
];

const BASE_TABLE_SET = new Set(BASE_TABLES);

/** These tables legitimately carry built-in seed rows. */
const ALLOWED_NON_EMPTY = new Set([
  "cms_migrations",
  "eterc_roles",
  "eterc_user_levels",
]);

/** Known tables created by the smoke/development app. */
export const DEMO_TABLES = [
  "animalsnew",
  "dddd",
  "ggeeedddd",
  "gggghhhh",
  "hhh",
  "posts",
  "product1",
];

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function tableNames(db) {
  return db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((row) => String(row.name));
}

function rowCount(db, table) {
  try {
    return Number(db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`).get().count);
  } catch {
    return null;
  }
}

export function checkStarterDatabase(databasePath) {
  const resolved = path.resolve(databasePath);
  const errors = [];
  if (!fs.existsSync(resolved)) {
    return {
      ok: false,
      path: resolved,
      tables: [],
      counts: {},
      extraTables: [],
      missingTables: [...BASE_TABLES],
      errors: [`Database not found: ${resolved}`],
    };
  }

  const db = new Database(resolved, { readonly: true, fileMustExist: true });
  try {
    const tables = tableNames(db);
    const counts = Object.fromEntries(tables.map((table) => [table, rowCount(db, table)]));
    const extraTables = tables.filter((table) => !BASE_TABLE_SET.has(table));
    const missingTables = BASE_TABLES.filter((table) => !tables.includes(table));

    if (extraTables.length > 0) {
      errors.push(`Unexpected starter tables: ${extraTables.join(", ")}`);
    }
    if (missingTables.length > 0) {
      errors.push(`Missing starter tables: ${missingTables.join(", ")}`);
    }
    for (const table of tables) {
      if (ALLOWED_NON_EMPTY.has(table)) continue;
      const count = counts[table];
      if (count === null) {
        errors.push(`Could not count rows in ${table}.`);
      } else if (count > 0) {
        errors.push(`${table} must be empty in the starter template (found ${count}).`);
      }
    }

    const adminCount = counts.eterc_administrators ?? 0;
    if (adminCount > 0) {
      errors.push("The starter template must not contain administrator accounts.");
    }
    const sessionCount = counts.et_sessions ?? 0;
    if (sessionCount > 0) {
      errors.push("The starter template must not contain sessions.");
    }

    const roleCount = counts.eterc_roles ?? 0;
    const levelCount = counts.eterc_user_levels ?? 0;
    if (roleCount < 2) {
      errors.push(`The starter template must seed at least two roles (found ${roleCount}).`);
    }
    if (levelCount < 2) {
      errors.push(
        `The starter template must seed at least two user levels (found ${levelCount}).`,
      );
    }
    const migrationCount = counts.cms_migrations ?? 0;
    if (migrationCount < 1) {
      errors.push("The starter template must keep the applied CMS migration markers.");
    }

    return {
      ok: errors.length === 0,
      path: resolved,
      tables,
      counts,
      extraTables,
      missingTables,
      errors,
    };
  } finally {
    db.close();
  }
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  return path.basename(entry) === "check-starter-db.mjs";
}

if (invokedDirectly()) {
  const target =
    process.argv[2] ??
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "prisma", "template.db");
  const report = checkStarterDatabase(target);
  if (!report.ok) {
    console.error(`Starter database check failed: ${report.path}`);
    for (const error of report.errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`Starter database check passed: ${report.path}`);
  console.log(`Tables: ${report.tables.length}`);
  console.log(
    `Rows: ${Object.entries(report.counts)
      .filter(([, count]) => count > 0)
      .map(([table, count]) => `${table}=${count}`)
      .join(", ")}`,
  );
}
