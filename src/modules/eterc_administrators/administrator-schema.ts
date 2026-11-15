import { activeDbAdapter } from "@/engine/active/db-adapter";

/**
 * Account-profile columns added after the original administrator table.
 *
 * The starter ships an idempotent setup DDL, but existing project databases
 * already have the base table. Keep this migration small and run it lazily so
 * older projects gain the new columns without a manual database reset.
 */
const ADMIN_PROFILE_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ["first_name", "TEXT NOT NULL DEFAULT ''"],
  ["last_name", "TEXT NOT NULL DEFAULT ''"],
  ["title", "TEXT NOT NULL DEFAULT ''"],
];

function mysqlSafeDefinition(definition: string): string {
  if (activeDbAdapter.dialect !== "mysql") return definition;
  // MySQL cannot apply literal defaults to TEXT columns.
  return definition
    .replace(/^TEXT/i, "VARCHAR(255)")
    .replace(/DEFAULT ''/i, "DEFAULT ''");
}

let ready: Promise<void> | null = null;

export function ensure_administrator_schema(): Promise<void> {
  if (!ready) {
    ready = migrate().catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}

async function migrate(): Promise<void> {
  const dialect = activeDbAdapter.dialect;
  const sqliteLike = dialect === "sqlite" || dialect === "libsql";
  if (!sqliteLike) {
    const exists = await activeDbAdapter.query<{ name: string }>(
      dialect === "postgres"
        ? "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'eterc_administrators' LIMIT 1"
        : "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'eterc_administrators' LIMIT 1",
    );
    if (exists.length === 0) return;
  } else {
    const exists = await activeDbAdapter.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'eterc_administrators' LIMIT 1",
    );
    if (exists.length === 0) return;
  }

  const columns = await activeDbAdapter.query<{ name: string }>(
    sqliteLike
      ? "PRAGMA table_info('eterc_administrators')"
      : dialect === "postgres"
        ? "SELECT column_name AS name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'eterc_administrators'"
        : "SELECT column_name AS name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'eterc_administrators'",
  );
  const existing = new Set(columns.map((column) => column.name));

  for (const [name, definition] of ADMIN_PROFILE_COLUMNS) {
    if (existing.has(name)) continue;
    await activeDbAdapter.execute(
      `ALTER TABLE "eterc_administrators" ADD COLUMN "${name}" ${mysqlSafeDefinition(definition)}`,
    );
  }
}
