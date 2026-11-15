import { activeDbAdapter } from "@/engine/active/db-adapter";
import { configuredDatabaseProvider } from "@/engine/db/gateway";
import { ensure_remote_schema } from "@/engine/db/schema/remote";
import { quoteIdentifier } from "@/engine/db/sql";

/**
 * Idempotent schema for the flow engine.
 *
 * All tables use the `cms_` prefix so the Data Studio schema scanner treats
 * them as internal tables instead of user collections.
 */
const FLOW_DDL = `
CREATE TABLE IF NOT EXISTS "cms_migrations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "applied_at" INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "cms_flows" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "icon" TEXT NOT NULL DEFAULT 'zap',
  "color" TEXT NOT NULL DEFAULT 'var(--foreground)',
  "status" TEXT NOT NULL DEFAULT 'inactive',
  "trigger" TEXT NOT NULL DEFAULT 'manual',
  "options" TEXT NOT NULL DEFAULT '{}',
  "accountability" TEXT,
  "operation" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "secret_hash" TEXT,
  "secret_prefix" TEXT,
  "next_run_at" INTEGER,
  "last_run_at" INTEGER,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "cms_flow_operations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "flow_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "options" TEXT NOT NULL DEFAULT '{}',
  "position_x" REAL NOT NULL DEFAULT 0,
  "position_y" REAL NOT NULL DEFAULT 0,
  "resolve" TEXT,
  "reject" TEXT,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  UNIQUE("flow_id", "key"),
  FOREIGN KEY("flow_id") REFERENCES "cms_flows"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "cms_flow_runs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "flow_id" TEXT NOT NULL,
  "trigger" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'running',
  "started_at" INTEGER NOT NULL,
  "finished_at" INTEGER,
  "duration_ms" INTEGER,
  "input" TEXT NOT NULL DEFAULT 'null',
  "output" TEXT NOT NULL DEFAULT 'null',
  "error" TEXT,
  "principal" TEXT NOT NULL DEFAULT '{}',
  "accountability" TEXT,
  "parent_run_id" TEXT,
  "created_at" INTEGER NOT NULL,
  FOREIGN KEY("flow_id") REFERENCES "cms_flows"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "cms_flow_run_steps" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "run_id" TEXT NOT NULL,
  "operation_id" TEXT,
  "key" TEXT NOT NULL DEFAULT '',
  "type" TEXT NOT NULL DEFAULT '',
  "path" TEXT NOT NULL DEFAULT 'root',
  "status" TEXT NOT NULL DEFAULT 'success',
  "started_at" INTEGER NOT NULL,
  "finished_at" INTEGER NOT NULL,
  "duration_ms" INTEGER NOT NULL DEFAULT 0,
  "input" TEXT NOT NULL DEFAULT 'null',
  "output" TEXT NOT NULL DEFAULT 'null',
  "error" TEXT,
  "sort" INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY("run_id") REFERENCES "cms_flow_runs"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "cms_flow_jobs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "flow_id" TEXT NOT NULL,
  "trigger" TEXT NOT NULL,
  "payload" TEXT NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 3,
  "run_at" INTEGER NOT NULL,
  "locked_at" INTEGER,
  "locked_by" TEXT,
  "error" TEXT,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  FOREIGN KEY("flow_id") REFERENCES "cms_flows"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "cms_flows_status_trigger_idx"
  ON "cms_flows"("status", "trigger");
CREATE INDEX IF NOT EXISTS "cms_flows_next_run_idx"
  ON "cms_flows"("status", "next_run_at");
CREATE INDEX IF NOT EXISTS "cms_flow_operations_flow_idx"
  ON "cms_flow_operations"("flow_id");
CREATE INDEX IF NOT EXISTS "cms_flow_runs_flow_started_idx"
  ON "cms_flow_runs"("flow_id", "started_at");
CREATE INDEX IF NOT EXISTS "cms_flow_runs_status_idx"
  ON "cms_flow_runs"("status");
CREATE INDEX IF NOT EXISTS "cms_flow_run_steps_run_idx"
  ON "cms_flow_run_steps"("run_id", "sort");
CREATE INDEX IF NOT EXISTS "cms_flow_jobs_claim_idx"
  ON "cms_flow_jobs"("status", "run_at");
`;

const FLOW_STATEMENTS = FLOW_DDL.split(/;\s*(?=(?:[^'"]|'[^']*'|"[^"]*")*$)/)
  .map((statement) => statement.trim())
  .filter(Boolean);

function has_column(table: string, column: string): Promise<boolean> {
  // PRAGMA and ALTER TABLE below are SQLite-only. `build_flow_schema` never
  // reaches this helper for a remote provider.
  return activeDbAdapter
    .query<{ name: string }>(
      `PRAGMA table_info(${quoteIdentifier(activeDbAdapter.dialect, table)})`
    )
    .then((rows) => rows.some((row) => row.name === column));
}

async function ensure_column(
  table: string,
  column: string,
  definition: string
): Promise<void> {
  if (await has_column(table, column)) return;
  await activeDbAdapter.execute(
    `ALTER TABLE ${quoteIdentifier(activeDbAdapter.dialect, table)} ADD COLUMN ${quoteIdentifier(
      activeDbAdapter.dialect,
      column
    )} ${definition}`
  );
}

async function build_flow_schema(): Promise<void> {
  if (
    configuredDatabaseProvider() !== "sqlite" ||
    activeDbAdapter.dialect !== "sqlite"
  ) {
    await ensure_remote_schema();
    return;
  }

  for (const statement of FLOW_STATEMENTS) {
    await activeDbAdapter.execute(statement);
  }

  await ensure_column("cms_flows", "revision", "INTEGER NOT NULL DEFAULT 1");
  await ensure_column("cms_flows", "secret_hash", "TEXT");
  await ensure_column("cms_flows", "secret_prefix", "TEXT");
  await ensure_column("cms_flows", "next_run_at", "INTEGER");
  await ensure_column("cms_flows", "last_run_at", "INTEGER");
  await ensure_column("cms_flows", "accountability", "TEXT");
  await ensure_column("cms_flow_jobs", "locked_by", "TEXT");
  await ensure_column("cms_flow_jobs", "max_attempts", "INTEGER NOT NULL DEFAULT 3");

  const marker = await activeDbAdapter.query<{ id: string }>(
    "SELECT id FROM cms_migrations WHERE id = ? LIMIT 1",
    ["flows:001"]
  );
  if (marker.length === 0) {
    await activeDbAdapter.execute(
      "INSERT INTO cms_migrations (id, applied_at) VALUES (?, ?)",
      ["flows:001", Math.floor(Date.now() / 1000)]
    );
  }
}

let ready: Promise<void> | null = null;

/** Create and upgrade flow tables. Safe to call on every request. */
export function ensure_flow_schema(): Promise<void> {
  if (!ready) {
    ready = build_flow_schema().catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}

/** Force the next `ensure_flow_schema()` call to re-run migrations. */
export function reset_flow_schema_cache(): void {
  ready = null;
}
