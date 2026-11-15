import type {
  DatabaseDialect,
  IDatabaseAdapter,
} from "../contracts/database";

export interface Migration {
  id: string;
  up: (db: IDatabaseAdapter) => Promise<void>;
}

export interface MigrationResult {
  applied: string[];
  alreadyApplied: string[];
}

const MIGRATION_TABLE = "_eterc_migrations";

function quoteIdentifier(dialect: DatabaseDialect, identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid migration identifier: ${identifier}`);
  }
  return dialect === "mysql" ? `\`${identifier}\`` : `"${identifier}"`;
}

function migrationTableDdl(dialect: DatabaseDialect): string {
  const table = quoteIdentifier(dialect, MIGRATION_TABLE);
  if (dialect === "mysql") {
    return `CREATE TABLE IF NOT EXISTS ${table} (
      \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
      \`applied_at\` BIGINT NOT NULL
    )`;
  }
  if (dialect === "postgres") {
    return `CREATE TABLE IF NOT EXISTS ${table} (
      "id" TEXT NOT NULL PRIMARY KEY,
      "applied_at" BIGINT NOT NULL
    )`;
  }
  return `CREATE TABLE IF NOT EXISTS ${table} (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applied_at" INTEGER NOT NULL
  )`;
}

async function ensureMigrationTable(db: IDatabaseAdapter): Promise<void> {
  await db.execute(migrationTableDdl(db.dialect));
}

async function appliedIds(db: IDatabaseAdapter): Promise<Set<string>> {
  const table = quoteIdentifier(db.dialect, MIGRATION_TABLE);
  const id = quoteIdentifier(db.dialect, "id");
  const appliedAt = quoteIdentifier(db.dialect, "applied_at");
  const rows = await db.query<{ id: string }>(
    `SELECT ${id} FROM ${table} ORDER BY ${appliedAt} ASC`,
  );
  return new Set(rows.map((row) => row.id));
}

async function acquireMigrationLock(db: IDatabaseAdapter): Promise<void> {
  if (db.dialect === "postgres") {
    // Transaction-scoped advisory lock. Safe across multiple app instances.
    await db.query("SELECT pg_advisory_xact_lock(2147483000)");
  }
}

/**
 * Runs pending migrations in order. Each migration and its bookkeeping row run
 * in one transaction where the dialect supports transactional DDL.
 *
 * MySQL auto-commits DDL. A failed MySQL migration can leave a partial schema;
 * use a deployment-level lock and a reviewed forward fix for those cases.
 */
export async function runMigrations(
  db: IDatabaseAdapter,
  migrations: Migration[],
): Promise<MigrationResult> {
  const seen = new Set<string>();
  for (const migration of migrations) {
    if (!/^[A-Za-z0-9_-]+$/.test(migration.id)) {
      throw new Error(`Invalid migration id: ${migration.id}`);
    }
    if (seen.has(migration.id)) {
      throw new Error(`Duplicate migration id: ${migration.id}`);
    }
    seen.add(migration.id);
  }

  await ensureMigrationTable(db);
  const already = await appliedIds(db);
  const applied: string[] = [];
  const table = quoteIdentifier(db.dialect, MIGRATION_TABLE);
  const idColumn = quoteIdentifier(db.dialect, "id");
  const appliedColumn = quoteIdentifier(db.dialect, "applied_at");
  const placeholder = (index: number) =>
    db.dialect === "postgres" ? `$${index}` : "?";

  for (const migration of migrations) {
    if (already.has(migration.id)) continue;
    await db.transaction(async (trx) => {
      await acquireMigrationLock(trx);
      const current = await trx.query<{ id: string }>(
        `SELECT ${idColumn} FROM ${table} WHERE ${idColumn} = ${placeholder(1)}`,
        [migration.id],
      );
      if (current.length > 0) return;
      await migration.up(trx);
      await trx.execute(
        `INSERT INTO ${table} (${idColumn}, ${appliedColumn}) VALUES (${placeholder(1)}, ${placeholder(2)})`,
        [migration.id, Date.now()],
      );
    });
    applied.push(migration.id);
    already.add(migration.id);
  }

  return {
    applied,
    alreadyApplied: migrations
      .filter((migration) => !applied.includes(migration.id))
      .map((migration) => migration.id),
  };
}

export async function pendingMigrations(
  db: IDatabaseAdapter,
  migrations: Migration[],
): Promise<string[]> {
  await ensureMigrationTable(db);
  const applied = await appliedIds(db);
  return migrations
    .filter((migration) => !applied.has(migration.id))
    .map((migration) => migration.id);
}
