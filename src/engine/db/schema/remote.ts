import { activeDbAdapter } from "@/engine/active/db-adapter";
import type { IDatabaseAdapter } from "@/engine/contracts/database";
import { quoteIdentifier } from "@/engine/db/sql";
import { applyRemoteSchema } from "./remote-ddl";

let ready: Promise<void> | null = null;

/**
 * Dialect-aware bootstrap for every fixed table used by the CMS, auth and flow
 * runtime. Dynamic collection tables are created by the collection service.
 */
export function ensure_remote_schema(
  adapter: IDatabaseAdapter = activeDbAdapter,
): Promise<void> {
  if (!ready) {
    ready = applyRemoteSchema(adapter).catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}

export function reset_remote_schema_cache(): void {
  ready = null;
}

/**
 * BIGSERIAL sequences do not advance when a row is inserted with an explicit
 * id. Keep the sequence above the current maximum after seeding fixed ids.
 */
export async function sync_postgres_sequence(
  table: string,
  adapter: IDatabaseAdapter = activeDbAdapter,
  column = "id",
): Promise<void> {
  if (adapter.dialect !== "postgres") return;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) {
    throw new Error(`Invalid table identifier: ${table}`);
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(column)) {
    throw new Error(`Invalid column identifier: ${column}`);
  }
  const columnName = quoteIdentifier("postgres", column);
  const escapedTable = table.replace(/'/g, "''");
  const escapedColumn = column.replace(/'/g, "''");
  await adapter.execute(
    `SELECT setval(
       pg_get_serial_sequence('${escapedTable}', '${escapedColumn}'),
       GREATEST((SELECT COALESCE(MAX(${columnName}), 1) FROM ${quoteIdentifier("postgres", table)}), 1),
       true
     )`,
  );
}
