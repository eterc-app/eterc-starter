#!/usr/bin/env node
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BASE_TABLES,
  checkStarterDatabase,
  DEMO_TABLES,
} from "./check-starter-db.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const starterRoot = path.resolve(scriptDir, "..");
const sourceDatabase = path.resolve(
  process.argv[2] ?? path.join(starterRoot, "prisma", "dev.db"),
);
const targetPath = path.resolve(
  process.argv[3] ?? path.join(starterRoot, "prisma", "template.db"),
);

if (!fs.existsSync(sourceDatabase)) {
  console.error(`Source database not found: ${sourceDatabase}`);
  process.exit(1);
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function copyDatabaseFiles(source, destinationDirectory) {
  const base = path.basename(source);
  const destination = path.join(destinationDirectory, base);
  fs.copyFileSync(source, destination);
  for (const suffix of ["-wal", "-shm"]) {
    const from = `${source}${suffix}`;
    if (fs.existsSync(from)) {
      fs.copyFileSync(from, `${destination}${suffix}`);
    }
  }
  return destination;
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "eterc-template-db-"));
const workingDatabase = copyDatabaseFiles(sourceDatabase, tempRoot);
const db = new Database(workingDatabase);

try {
  db.pragma("journal_mode = DELETE");
  db.pragma("wal_checkpoint(TRUNCATE)");
  db.pragma("foreign_keys = OFF");

  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((row) => String(row.name));
  const base = new Set(BASE_TABLES);

  db.transaction(() => {
    for (const table of tables) {
      if (!base.has(table)) {
        db.exec(`DROP TABLE IF EXISTS ${quoteIdentifier(table)}`);
      }
    }

    for (const table of BASE_TABLES) {
      if (!tables.includes(table)) continue;
      if (
        table === "cms_migrations" ||
        table === "eterc_roles" ||
        table === "eterc_user_levels"
      ) {
        continue;
      }
      db.exec(`DELETE FROM ${quoteIdentifier(table)}`);
    }

    const hasSequence = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'")
      .get();
    if (hasSequence) {
      for (const table of tables) {
        if (base.has(table)) {
          db.prepare("DELETE FROM sqlite_sequence WHERE name = ?").run(table);
        }
      }
    }
  })();

  db.pragma("foreign_keys = ON");
  db.exec("VACUUM");
  db.pragma("journal_mode = DELETE");
} finally {
  db.close();
}

for (const suffix of ["-wal", "-shm"]) {
  fs.rmSync(`${workingDatabase}${suffix}`, { force: true });
}
fs.mkdirSync(path.dirname(targetPath), { recursive: true });
fs.copyFileSync(workingDatabase, targetPath);
fs.rmSync(tempRoot, { recursive: true, force: true });

const report = checkStarterDatabase(targetPath);
if (!report.ok) {
  for (const error of report.errors) console.error(`- ${error}`);
  fs.rmSync(targetPath, { force: true });
  process.exit(1);
}

console.log(`Clean starter database written: ${targetPath}`);
console.log(`Source: ${sourceDatabase}`);
console.log(`Tables: ${report.tables.join(", ")}`);
console.log(
  `Retained rows: ${Object.entries(report.counts)
    .filter(([, count]) => count > 0)
    .map(([table, count]) => `${table}=${count}`)
    .join(", ")}`,
);
console.log(`Removed demo tables: ${DEMO_TABLES.join(", ")}`);
