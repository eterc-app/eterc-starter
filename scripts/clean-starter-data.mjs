#!/usr/bin/env node
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { DEMO_TABLES } from "./check-starter-db.mjs";

const args = process.argv.slice(2);
let databasePath = null;
let confirmed = false;
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--db") {
    databasePath = args[index + 1] ?? null;
    index += 1;
    continue;
  }
  if (arg.startsWith("--db=")) {
    databasePath = arg.slice("--db=".length);
    continue;
  }
  if (arg === "--yes" || arg === "-y") confirmed = true;
}

const projectRoot = path.resolve(process.cwd());
const resolvedDatabase = path.resolve(
  databasePath ?? path.join(projectRoot, "prisma", "dev.db"),
);
const inferredRoot = path.resolve(path.dirname(resolvedDatabase), "..");
const targetProject = fs.existsSync(path.join(inferredRoot, "package.json"))
  ? inferredRoot
  : projectRoot;

if (!fs.existsSync(resolvedDatabase)) {
  console.error(`Database not found: ${resolvedDatabase}`);
  process.exit(1);
}

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

const db = new Database(resolvedDatabase);
const plans = [];
try {
  db.pragma("wal_checkpoint(TRUNCATE)");
  const tables = tableNames(db);
  const count = (table, where = "", params = []) => {
    if (!tables.includes(table)) return 0;
    try {
      return Number(
        db
          .prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)} ${where}`)
          .get(...params).count,
      );
    } catch {
      return 0;
    }
  };

  for (const table of [
    "et_sessions",
    "eterc_tokens",
    "eterc_api_keys",
    "eterc_identities",
    "login_attempts",
    "password_resets",
  ]) {
    const value = count(table);
    if (value > 0) plans.push(`${table}: ${value} row(s)`);
  }
  for (const table of DEMO_TABLES) {
    if (tables.includes(table)) plans.push(`drop demo table ${table}`);
  }
  const demoCollections = count(
    "cms_collections",
    `WHERE name IN (${DEMO_TABLES.map(() => "?").join(", ")})`,
    DEMO_TABLES,
  );
  if (demoCollections > 0) plans.push(`cms_collections: ${demoCollections} demo collection(s)`);
  const smokeAdmins = count(
    "eterc_administrators",
    "WHERE username LIKE 'smoke\\_%' ESCAPE '\\'",
  );
  if (smokeAdmins > 0) plans.push(`eterc_administrators: ${smokeAdmins} smoke account(s)`);

  if (plans.length === 0) {
    console.log(`No starter test data found in ${resolvedDatabase}`);
    process.exit(0);
  }

  console.log(`Starter data cleanup preview for ${resolvedDatabase}`);
  for (const plan of plans) console.log(`- ${plan}`);
  if (!confirmed) {
    console.log("No changes made. Re-run with --yes to back up and clean this database.");
    process.exit(0);
  }

  const backupDirectory = path.join(targetProject, ".eterc", "backups");
  fs.mkdirSync(backupDirectory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDirectory, `dev-${stamp}.db`);
  fs.copyFileSync(resolvedDatabase, backupPath);
  console.log(`Backup: ${backupPath}`);

  db.pragma("foreign_keys = OFF");
  db.transaction(() => {
    for (const table of [
      "et_sessions",
      "eterc_tokens",
      "eterc_api_keys",
      "eterc_identities",
      "login_attempts",
      "password_resets",
    ]) {
      if (tables.includes(table)) db.exec(`DELETE FROM ${quoteIdentifier(table)}`);
    }

    const placeholders = DEMO_TABLES.map(() => "?").join(", ");
    if (tables.includes("cms_fields")) {
      db.prepare(
        `DELETE FROM cms_fields WHERE collection_id IN (
          SELECT id FROM cms_collections WHERE name IN (${placeholders})
        )`,
      ).run(...DEMO_TABLES);
    }
    if (tables.includes("cms_collections")) {
      db.prepare(`DELETE FROM cms_collections WHERE name IN (${placeholders})`).run(
        ...DEMO_TABLES,
      );
    }
    for (const table of DEMO_TABLES) {
      if (tables.includes(table)) db.exec(`DROP TABLE IF EXISTS ${quoteIdentifier(table)}`);
    }

    if (tables.includes("eterc_administrators")) {
      const smokeIds = db
        .prepare(
          "SELECT eterc_user_id AS userId FROM eterc_administrators WHERE username LIKE 'smoke\\_%' ESCAPE '\\'",
        )
        .all()
        .map((row) => row.userId)
        .filter((value) => Number.isInteger(value));
      db.prepare(
        "DELETE FROM eterc_administrators WHERE username LIKE 'smoke\\_%' ESCAPE '\\'",
      ).run();
      if (tables.includes("eterc_users")) {
        // Only remove users attached to the removed smoke administrators.
        for (const userId of smokeIds) {
          db.prepare("DELETE FROM eterc_users WHERE id = ?").run(userId);
        }
      }
    }

    let localMedia = true;
    try {
      const stack = JSON.parse(
        fs.readFileSync(path.join(targetProject, "stack.json"), "utf8"),
      );
      localMedia = (stack.storage?.provider ?? "local") === "local";
    } catch {
      localMedia = true;
    }
    if (
      localMedia &&
      tables.includes("cms_media_assets") &&
      tables.includes("cms_media_variants") &&
      tables.includes("cms_media_audit")
    ) {
      const publicRoot = path.join(targetProject, "public", "uploads");
      const privateRoot = path.join(targetProject, "data", "private-uploads");
      const assets = db
        .prepare("SELECT id, object_key AS objectKey, visibility FROM cms_media_assets")
        .all();
      for (const asset of assets) {
        const root = asset.visibility === "private" ? privateRoot : publicRoot;
        const target = path.resolve(root, String(asset.objectKey ?? ""));
        if (target.startsWith(`${root}${path.sep}`) && fs.existsSync(target)) continue;
        db.prepare("DELETE FROM cms_media_variants WHERE asset_id = ?").run(asset.id);
        db.prepare("DELETE FROM cms_media_audit WHERE asset_id = ?").run(asset.id);
        db.prepare("DELETE FROM cms_media_assets WHERE id = ?").run(asset.id);
      }
    }
  })();
  db.pragma("foreign_keys = ON");
  db.exec("VACUUM");
} finally {
  db.close();
}

const remainingAdmin = (() => {
  const check = new Database(resolvedDatabase, { readonly: true });
  try {
    return (
      check
        .prepare(
          "SELECT username FROM eterc_administrators ORDER BY id ASC LIMIT 1",
        )
        .get()?.username ?? null
    );
  } catch {
    return null;
  } finally {
    check.close();
  }
})();

const settingsPath = path.join(targetProject, "data", "settings", "setup.json");
if (!remainingAdmin) {
  fs.rmSync(settingsPath, { force: true });
} else {
  try {
    const current = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    fs.writeFileSync(
      settingsPath,
      `${JSON.stringify({ ...current, admin_username: remainingAdmin }, null, 2)}\n`,
      "utf8",
    );
  } catch {
    // A missing or malformed marker is harmless; the setup screen uses the
    // administrator table as the source of truth.
  }
}

console.log("Starter data cleanup finished.");
