import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { SqliteGateway } from "../src/engine/db/sqlite-gateway.ts";
import {
  pendingMigrations,
  runMigrations,
} from "../src/engine/db/migrations.ts";
import { PostgresGateway } from "../src/engine/db/postgres-gateway.ts";
import { LibsqlGateway } from "../src/engine/db/libsql-gateway.ts";
import {
  applyRemoteSchema,
  remoteSchemaStatements,
} from "../src/engine/db/schema/remote-ddl.ts";
import { assertLegacySqliteAccess } from "../src/engine/db/gateway.ts";

function quote(dialect, identifier) {
  return dialect === "mysql" ? `\`${identifier}\`` : `"${identifier}"`;
}

function migrationsForTable(table) {
  return [
    {
      id: `check_${table}_create`,
      up: async (db) => {
        if (db.dialect === "postgres") {
          await db.execute(
            `CREATE TABLE IF NOT EXISTS ${quote(db.dialect, table)} (
              "id" BIGSERIAL PRIMARY KEY,
              "name" TEXT NOT NULL,
              "created_at" BIGINT NOT NULL
            )`,
          );
        } else {
          await db.execute(
            `CREATE TABLE IF NOT EXISTS ${quote(db.dialect, table)} (
              "id" INTEGER PRIMARY KEY AUTOINCREMENT,
              "name" TEXT NOT NULL,
              "created_at" INTEGER NOT NULL
            )`,
          );
        }
      },
    },
    {
      id: `check_${table}_seed`,
      up: async (db) => {
        const p1 = db.dialect === "postgres" ? "$1" : "?";
        const p2 = db.dialect === "postgres" ? "$2" : "?";
        await db.execute(
          `INSERT INTO ${quote(db.dialect, table)} ("name", "created_at") VALUES (${p1}, ${p2})`,
          ["gateway-check", Date.now()],
        );
      },
    },
  ];
}

async function checkRemoteSchema() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eterc-remote-schema-"));
  const file = path.join(root, "libsql.db");
  const db = new LibsqlGateway({ url: `file:${file}` });
  try {
    await applyRemoteSchema(db);
    await applyRemoteSchema(db);
    const tables = await db.query(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    );
    const names = new Set(tables.map((row) => row.name));
    for (const required of [
      "eterc_users",
      "eterc_tokens",
      "cms_collections",
      "cms_fields",
      "eterc_roles",
      "eterc_permissions",
      "eterc_api_keys",
      "eterc_identities",
      "cms_flows",
      "cms_flow_runs",
      "cms_flow_jobs",
    ]) {
      assert.equal(names.has(required), true, `missing remote table ${required}`);
    }

    const insert = await db.execute(
      `INSERT INTO "eterc_tokens" ("token", "user_id", "expiry_date") VALUES (?, ?, ?)`,
      ["schema-check-token", 7, Math.floor(Date.now() / 1000) + 60],
    );
    assert.equal(insert.changes, 1);
    const tokens = await db.query(
      `SELECT "id", "token" FROM "eterc_tokens" WHERE "token" = ?`,
      ["schema-check-token"],
    );
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].token, "schema-check-token");

    const mysql = remoteSchemaStatements("mysql").join("\n");
    assert.doesNotMatch(mysql, /AUTOINCREMENT|BIGSERIAL/);
    assert.match(mysql, /"cms_flows" \([\s\S]*"id" VARCHAR\(255\) NOT NULL PRIMARY KEY/);
    assert.match(mysql, /"input" TEXT NOT NULL DEFAULT \('null'\)/);
    assert.doesNotMatch(mysql, /"name" TEXT NOT NULL UNIQUE/);

    const postgres = remoteSchemaStatements("postgres").join("\n");
    assert.match(postgres, /BIGSERIAL PRIMARY KEY/);
    assert.match(postgres, /"id" TEXT NOT NULL PRIMARY KEY/);
    assert.doesNotMatch(postgres, /VARCHAR\(255\)/);

    console.log("PASS remote schema bootstrap on libsql and dialect DDL checks");
  } finally {
    await db.close();
    try {
      fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // Windows can keep the libSQL file handle briefly; the temp folder is safe.
    }
  }
}

async function checkSqlite() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eterc-db-gateway-"));
  const file = path.join(root, "check.db");
  const connection = new Database(file);
  const db = new SqliteGateway(connection);
  try {
    const migrations = migrationsForTable("check_widgets");
    assert.deepEqual(await pendingMigrations(db, migrations), migrations.map((m) => m.id));
    const first = await runMigrations(db, migrations);
    assert.equal(first.applied.length, 2);
    assert.deepEqual(await pendingMigrations(db, migrations), []);

    const second = await runMigrations(db, migrations);
    assert.equal(second.applied.length, 0);
    assert.equal(second.alreadyApplied.length, 2);

    const rows = await db.query("SELECT * FROM check_widgets");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, "gateway-check");

    await assert.rejects(
      db.transaction(async (trx) => {
        await trx.execute(
          'INSERT INTO check_widgets ("name", "created_at") VALUES (?, ?)',
          ["rollback", Date.now()],
        );
        throw new Error("rollback probe");
      }),
      /rollback probe/,
    );
    const afterRollback = await db.query("SELECT * FROM check_widgets");
    assert.equal(afterRollback.length, 1);

    const previous = process.env.ET_DATABASE_PROVIDER;
    process.env.ET_DATABASE_PROVIDER = "postgres";
    assert.throws(() => assertLegacySqliteAccess(), /legacy synchronous database facade/i);
    if (previous === undefined) delete process.env.ET_DATABASE_PROVIDER;
    else process.env.ET_DATABASE_PROVIDER = previous;

    console.log("PASS sqlite gateway, migrations, transaction rollback and legacy guard");
  } finally {
    connection.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function checkPostgres() {
  const connectionString = process.env.ETER_TEST_POSTGRES_URL?.trim();
  if (!connectionString) {
    console.log("SKIP postgres gateway (ETER_TEST_POSTGRES_URL is not set)");
    return;
  }
  const table = `check_widgets_${Date.now()}`;
  const db = new PostgresGateway({ connectionString, maxConnections: 2 });
  try {
    assert.equal(await db.ping(), true);
    const migrations = migrationsForTable(table);
    const result = await runMigrations(db, migrations);
    assert.equal(result.applied.length, 2);
    const rows = await db.query(`SELECT * FROM ${quote("postgres", table)}`);
    assert.equal(rows.length, 1);
    await db.execute(`DELETE FROM "_eterc_migrations" WHERE "id" LIKE $1`, [
      `check_${table}_%`,
    ]);
    await db.execute(`DROP TABLE IF EXISTS ${quote("postgres", table)}`);
    console.log("PASS postgres gateway and migrations");
  } finally {
    await db.close();
  }
}

await checkSqlite();
await checkRemoteSchema();
await checkPostgres();
