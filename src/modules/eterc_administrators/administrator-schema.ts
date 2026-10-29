import { sqlite } from "@/engine/db";

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

let ready = false;

export function ensure_administrator_schema(): void {
  if (ready) return;

  const table = sqlite()
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'eterc_administrators' LIMIT 1"
    )
    .get() as { name: string } | undefined;

  if (!table) return;

  const columns = sqlite()
    .prepare("PRAGMA table_info('eterc_administrators')")
    .all() as Array<{ name: string }>;
  const existing = new Set(columns.map((column) => column.name));

  for (const [name, definition] of ADMIN_PROFILE_COLUMNS) {
    if (existing.has(name)) continue;
    sqlite().exec(
      `ALTER TABLE "eterc_administrators" ADD COLUMN "${name}" ${definition}`
    );
  }

  ready = true;
}
