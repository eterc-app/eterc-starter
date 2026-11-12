import { sqlite } from "@/engine/db";

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
  "color" TEXT NOT NULL DEFAULT '#6366f1',
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

let ready = false;

function has_column(table: string, column: string): boolean {
  const rows = sqlite()
    .prepare(`PRAGMA table_info("${table.replace(/"/g, '""')}")`)
    .all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

function ensure_column(table: string, column: string, definition: string): void {
  if (has_column(table, column)) return;
  sqlite().exec(
    `ALTER TABLE "${table.replace(/"/g, '""')}" ADD COLUMN "${column.replace(
      /"/g,
      '""'
    )}" ${definition}`
  );
}

/** Create and upgrade flow tables. Safe to call on every request. */
export function ensure_flow_schema(): void {
  if (ready) return;
  sqlite().exec(FLOW_DDL);
  ensure_column("cms_flows", "revision", "INTEGER NOT NULL DEFAULT 1");
  ensure_column("cms_flows", "secret_hash", "TEXT");
  ensure_column("cms_flows", "secret_prefix", "TEXT");
  ensure_column("cms_flows", "next_run_at", "INTEGER");
  ensure_column("cms_flows", "last_run_at", "INTEGER");
  ensure_column("cms_flows", "accountability", "TEXT");
  ensure_column("cms_flow_jobs", "locked_by", "TEXT");
  ensure_column("cms_flow_jobs", "max_attempts", "INTEGER NOT NULL DEFAULT 3");

  const marker = sqlite()
    .prepare("SELECT id FROM cms_migrations WHERE id = ? LIMIT 1")
    .get("flows:001") as { id: string } | undefined;
  if (!marker) {
    sqlite()
      .prepare("INSERT INTO cms_migrations (id, applied_at) VALUES (?, ?)")
      .run("flows:001", Math.floor(Date.now() / 1000));
  }
  ready = true;
}

/** Force the next `ensure_flow_schema()` call to re-run migrations. */
export function reset_flow_schema_cache(): void {
  ready = false;
}
