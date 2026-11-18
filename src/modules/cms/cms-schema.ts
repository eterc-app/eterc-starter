import { activeDbAdapter } from "@/engine/active/db-adapter";
import { db, type Db, type Row } from "@/engine/db";
import { configuredDatabaseProvider } from "@/engine/db/gateway";
import { ensure_remote_schema, sync_postgres_sequence } from "@/engine/db/schema/remote";
import { ensure_flow_schema } from "@/modules/flows/flow-schema";
import {
  cms_field_interface,
  type CmsBootstrapReport,
  type CmsBootstrapTable,
  type CmsBootstrapTableStatus,
  type CmsFieldInterface,
  type CmsFieldType,
} from "./cms-types";

const INTERNAL_TABLES = new Set([
  "sqlite_sequence",
  "et_sessions",
  "login_attempts",
  "password_resets",
  "cms_collections",
  "cms_fields",
  "cms_migrations",
  "eterc_roles",
  "eterc_permissions",
  "eterc_api_keys",
  "eterc_identities",
]);

const SYSTEM_TABLE_PREFIXES = [
  "eterc_",
  "cms_",
  "sqlite_",
  "et_",
  "login_",
  "password_",
];

const CMS_DDL = `
CREATE TABLE IF NOT EXISTS "cms_migrations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "applied_at" INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "cms_collections" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "name" TEXT NOT NULL UNIQUE,
  "label" TEXT NOT NULL DEFAULT '',
  "icon" TEXT NOT NULL DEFAULT 'table',
  "color" TEXT NOT NULL DEFAULT '',
  "display_template" TEXT NOT NULL DEFAULT '',
  "ordering_mode" TEXT NOT NULL DEFAULT '',
  "default_order" TEXT NOT NULL DEFAULT '[]',
  "note" TEXT NOT NULL DEFAULT '',
  "primary_key" TEXT NOT NULL DEFAULT 'id',
  "singleton" INTEGER NOT NULL DEFAULT 0,
  "hidden" INTEGER NOT NULL DEFAULT 0,
  "system" INTEGER NOT NULL DEFAULT 0,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "cms_fields" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "collection_id" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "label" TEXT NOT NULL DEFAULT '',
  "type" TEXT NOT NULL DEFAULT 'string',
  "interface" TEXT NOT NULL DEFAULT 'input',
  "options" TEXT NOT NULL DEFAULT '{}',
  "required" INTEGER NOT NULL DEFAULT 0,
  "unique" INTEGER NOT NULL DEFAULT 0,
  "hidden" INTEGER NOT NULL DEFAULT 0,
  "readonly" INTEGER NOT NULL DEFAULT 0,
  "clear_hidden_value_on_save" INTEGER NOT NULL DEFAULT 0,
  "group" TEXT,
  "validation" TEXT NOT NULL DEFAULT '{"match":"all","conditions":[]}',
  "validation_message" TEXT NOT NULL DEFAULT '',
  "conditions" TEXT NOT NULL DEFAULT '[]',
  "display_options" TEXT NOT NULL DEFAULT '{}',
  "sort" INTEGER NOT NULL DEFAULT 0,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  UNIQUE("collection_id", "name")
);

CREATE TABLE IF NOT EXISTS "eterc_roles" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "user_level_id" INTEGER NOT NULL UNIQUE,
  "name" TEXT NOT NULL UNIQUE,
  "slug" TEXT NOT NULL UNIQUE,
  "description" TEXT NOT NULL DEFAULT '',
  "app_access" INTEGER NOT NULL DEFAULT 1,
  "api_access" INTEGER NOT NULL DEFAULT 1,
  "admin_access" INTEGER NOT NULL DEFAULT 0,
  "is_system" INTEGER NOT NULL DEFAULT 0,
  "parent_role_id" INTEGER,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "eterc_permissions" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "role_id" INTEGER NOT NULL,
  "collection" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "fields" TEXT NOT NULL DEFAULT '["*"]',
  "filter" TEXT NOT NULL DEFAULT '{"match":"all","conditions":[]}',
  "validation" TEXT NOT NULL DEFAULT '{"match":"all","conditions":[]}',
  "presets" TEXT NOT NULL DEFAULT '[]',
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  UNIQUE("role_id", "collection", "action")
);

CREATE TABLE IF NOT EXISTS "eterc_api_keys" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "name" TEXT NOT NULL,
  "key_prefix" TEXT NOT NULL UNIQUE,
  "key_hash" TEXT NOT NULL,
  "role_id" INTEGER NOT NULL,
  "user_id" INTEGER,
  "active" INTEGER NOT NULL DEFAULT 1,
  "expires_at" INTEGER,
  "last_used_at" INTEGER,
  "created_at" INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "eterc_identities" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "user_id" INTEGER NOT NULL,
  "provider" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "email" TEXT NOT NULL DEFAULT '',
  "name" TEXT NOT NULL DEFAULT '',
  "created_at" INTEGER NOT NULL,
  UNIQUE("provider", "subject")
);

CREATE TABLE IF NOT EXISTS "cms_media_assets" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "provider" TEXT NOT NULL,
  "bucket" TEXT,
  "object_key" TEXT NOT NULL,
  "original_name" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT '',
  "alt" TEXT NOT NULL DEFAULT '',
  "mime" TEXT NOT NULL,
  "extension" TEXT NOT NULL DEFAULT '',
  "size" INTEGER NOT NULL DEFAULT 0,
  "checksum" TEXT,
  "width" INTEGER,
  "height" INTEGER,
  "kind" TEXT NOT NULL,
  "folder" TEXT NOT NULL DEFAULT '',
  "visibility" TEXT NOT NULL DEFAULT 'public',
  "uploaded_by" INTEGER,
  "error" TEXT,
  "expires_at" INTEGER,
  "created_at" INTEGER NOT NULL,
  "updated_at" INTEGER NOT NULL,
  "deleted_at" INTEGER,
  UNIQUE("provider", "object_key")
);

CREATE TABLE IF NOT EXISTS "cms_media_variants" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "asset_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "object_key" TEXT NOT NULL,
  "mime" TEXT NOT NULL,
  "width" INTEGER,
  "height" INTEGER,
  "bytes" INTEGER NOT NULL DEFAULT 0,
  UNIQUE("asset_id", "name")
);

CREATE TABLE IF NOT EXISTS "cms_media_audit" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "asset_id" TEXT,
  "user_id" INTEGER,
  "action" TEXT NOT NULL,
  "ip" TEXT,
  "detail" TEXT,
  "created_at" INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS "cms_fields_collection_idx" ON "cms_fields"("collection_id");
CREATE INDEX IF NOT EXISTS "eterc_permissions_role_idx" ON "eterc_permissions"("role_id");
CREATE INDEX IF NOT EXISTS "eterc_api_keys_prefix_idx" ON "eterc_api_keys"("key_prefix");
CREATE INDEX IF NOT EXISTS "eterc_identities_user_idx" ON "eterc_identities"("user_id");
CREATE INDEX IF NOT EXISTS "cms_media_assets_status_idx" ON "cms_media_assets"("status", "created_at");
CREATE INDEX IF NOT EXISTS "cms_media_assets_folder_idx" ON "cms_media_assets"("folder", "status");
CREATE INDEX IF NOT EXISTS "cms_media_assets_checksum_idx" ON "cms_media_assets"("checksum");
CREATE INDEX IF NOT EXISTS "cms_media_assets_user_idx" ON "cms_media_assets"("uploaded_by");
CREATE INDEX IF NOT EXISTS "cms_media_variants_asset_idx" ON "cms_media_variants"("asset_id");
CREATE INDEX IF NOT EXISTS "cms_media_audit_asset_idx" ON "cms_media_audit"("asset_id");
`;

let schemaReady = false;

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Read rows through the async facade (or a transaction-scoped facade). */
async function query_rows<T = Row>(
  sql: string,
  params: unknown[] = [],
  client: Db = db
): Promise<T[]> {
  return (await client.query_bind(sql, params)) as T[];
}

/** Run a statement through the async facade and normalize mutation metadata. */
async function execute_statement(
  sql: string,
  params: unknown[] = [],
  client: Db = db
): Promise<{ changes: number; lastInsertRowid: number }> {
  const result = (await client.query_bind(sql, params)) as {
    affectedRows?: number;
    lastInsertId?: number;
  };
  return {
    changes: Number(result.affectedRows ?? 0),
    lastInsertRowid: Number(result.lastInsertId ?? 0),
  };
}

async function has_column(table: string, column: string): Promise<boolean> {
  const described = await db.describe_table(table, true);
  if (described === false) return false;
  return (described as Row[]).some((entry) => String(entry.name) === column);
}

async function ensure_column(
  table: string,
  column: string,
  definition: string
): Promise<void> {
  if (await has_column(table, column)) return;
  await execute_statement(
    `ALTER TABLE ${quote_identifier(table)} ADD COLUMN ${quote_identifier(column)} ${definition}`
  );
}

/**
 * Upgrade access-control tables created before row policies existed.
 *
 * An empty `fields` list used to mean "all fields". It now means "no fields"
 * so a policy can deny every client field, while `["*"]` means every field.
 * Existing rows are migrated once to preserve their original behavior.
 */
async function migrate_access_schema(): Promise<void> {
  await ensure_column("cms_collections", "color", "TEXT NOT NULL DEFAULT ''");
  await ensure_column("cms_collections", "display_template", "TEXT NOT NULL DEFAULT ''");
  await ensure_column("cms_collections", "ordering_mode", "TEXT NOT NULL DEFAULT ''");
  await ensure_column("cms_collections", "default_order", "TEXT NOT NULL DEFAULT '[]'");
  await ensure_column("cms_fields", "group", "TEXT");
  await ensure_column(
    "cms_fields",
    "clear_hidden_value_on_save",
    "INTEGER NOT NULL DEFAULT 0"
  );
  await ensure_column(
    "cms_fields",
    "validation",
    `TEXT NOT NULL DEFAULT '{"match":"all","conditions":[]}'`
  );
  await ensure_column("cms_fields", "validation_message", "TEXT NOT NULL DEFAULT ''");
  await ensure_column("cms_fields", "conditions", "TEXT NOT NULL DEFAULT '[]'");
  await ensure_column("cms_fields", "display_options", "TEXT NOT NULL DEFAULT '{}'");
  await ensure_column("eterc_roles", "parent_role_id", "INTEGER");
  await execute_statement(
    `CREATE INDEX IF NOT EXISTS "eterc_roles_parent_idx" ON "eterc_roles"("parent_role_id")`
  );
  await ensure_column("eterc_api_keys", "user_id", "INTEGER");
  await ensure_column(
    "eterc_permissions",
    "filter",
    `TEXT NOT NULL DEFAULT '{"match":"all","conditions":[]}'`
  );
  await ensure_column(
    "eterc_permissions",
    "validation",
    `TEXT NOT NULL DEFAULT '{"match":"all","conditions":[]}'`
  );
  await ensure_column("eterc_permissions", "presets", "TEXT NOT NULL DEFAULT '[]'");

  const marker = await query_rows<{ id: string }>(
    "SELECT id FROM cms_migrations WHERE id = ? LIMIT 1",
    ["access_fields_wildcard_v1"]
  );
  if (marker.length > 0) return;
  await execute_statement(
    `UPDATE eterc_permissions
     SET fields = '["*"]'
     WHERE fields IS NULL OR fields = '' OR fields = '[]'`
  );
  await execute_statement(
    "INSERT INTO cms_migrations (id, applied_at) VALUES (?, ?)",
    ["access_fields_wildcard_v1", nowSeconds()]
  );
}

function humanize(value: string): string {
  return value
    .replace(/^eterc_/, "")
    .replace(/^cms_/, "")
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function inferType(name: string, declared: string): CmsFieldType {
  const type = declared.toUpperCase();
  const timestampName = name === "created_at" || name === "updated_at";
  if (
    timestampName &&
    (type === "" ||
      type.includes("TEXT") ||
      type.includes("CHAR") ||
      type.includes("CLOB") ||
      type.includes("DATE") ||
      type.includes("TIME"))
  ) {
    return "datetime";
  }
  if (type.includes("INT")) return "integer";
  if (
    type.includes("REAL") ||
    type.includes("FLOA") ||
    type.includes("DOUB") ||
    type.includes("NUM") ||
    type.includes("DEC")
  ) {
    return "decimal";
  }
  if (type.includes("BOOL")) return "boolean";
  if (type.includes("DATE") || type.includes("TIME")) return "datetime";
  if (type.includes("JSON")) return "json";
  if (type.includes("TEXT") || type.includes("CLOB") || type.includes("CHAR")) {
    return "text";
  }
  return "string";
}

function inferInterface(name: string, type: CmsFieldType): CmsFieldInterface {
  if (type === "text") {
    if (/(body|content|description|notes?|summary|html|markdown|excerpt)/i.test(name)) {
      return "textarea";
    }
    return "input";
  }
  return cms_field_interface(type);
}

let schemaInitialization: Promise<void> | null = null;

export function ensure_cms_schema(): Promise<void> {
  if (schemaReady) return Promise.resolve();
  schemaInitialization ??= initialize_cms_schema().finally(() => {
    schemaInitialization = null;
  });
  return schemaInitialization;
}

async function initialize_cms_schema(): Promise<void> {
  if (configuredDatabaseProvider() === "sqlite") {
    await execute_statement(CMS_DDL);
    await ensure_flow_schema();
    await migrate_access_schema();
    await seed_roles();
    await sync_collections();
  } else {
    await ensure_remote_schema();
    await seed_roles();
    await sync_collections();
  }
  schemaReady = true;
}

/** Re-scan the database for tables created outside the content service. */
export async function refresh_cms_schema(): Promise<void> {
  schemaReady = false;
  await ensure_cms_schema();
  await bootstrap_database();
}

async function seed_roles(): Promise<void> {
  const now = nowSeconds();
  const adminLevel = await query_rows<{ id: number }>(
    "SELECT id FROM eterc_user_levels WHERE id = 1 LIMIT 1"
  );

  if (adminLevel.length === 0) {
    await execute_statement(
      "INSERT INTO eterc_user_levels (id, level_title) VALUES (1, 'admin')"
    );
  }
  await sync_postgres_sequence("eterc_user_levels");

  const admin = await query_rows<{ id: number }>(
    "SELECT id FROM eterc_roles WHERE user_level_id = 1 LIMIT 1"
  );

  if (admin.length === 0) {
    await execute_statement(
      `INSERT INTO eterc_roles
        (user_level_id, name, slug, description, app_access, api_access, admin_access, is_system, created_at, updated_at)
       VALUES (1, 'Admin', 'admin', 'Full access to the content service, access control and project settings.', 1, 1, 1, 1, ?, ?)`,
      [now, now]
    );
  }

  const memberLevel = await query_rows<{ id: number }>(
    "SELECT id FROM eterc_user_levels WHERE level_title = 'Member' LIMIT 1"
  );

  if (memberLevel.length === 0) {
    await execute_statement(
      "INSERT INTO eterc_user_levels (level_title) VALUES ('Member')"
    );
    const inserted = await query_rows<{ id: number }>(
      "SELECT id FROM eterc_user_levels WHERE level_title = 'Member' ORDER BY id ASC LIMIT 1"
    );
    const levelId = Number(inserted[0]?.id ?? 0);
    await execute_statement(
      `INSERT INTO eterc_roles
        (user_level_id, name, slug, description, app_access, api_access, admin_access, is_system, created_at, updated_at)
       VALUES (?, 'Member', 'member', 'Default application role. Grant collection permissions from Access.', 1, 1, 0, 0, ?, ?)`,
      [levelId, now, now]
    );
  }
}

async function table_names(): Promise<string[]> {
  return db.get_tables();
}

function is_internal_table(name: string): boolean {
  if (INTERNAL_TABLES.has(name)) return true;
  return SYSTEM_TABLE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

async function collection_row(name: string): Promise<Row | undefined> {
  const rows = await query_rows(
    "SELECT * FROM cms_collections WHERE name = ? LIMIT 1",
    [name]
  );
  return rows[0];
}

interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
  extra?: string;
}

interface PlannedField {
  name: string;
  label: string;
  type: CmsFieldType;
  interface: CmsFieldInterface;
  required: boolean;
  unique: boolean;
  hidden: boolean;
  readonly: boolean;
  primary: boolean;
}

interface TablePlan {
  name: string;
  label: string;
  status: CmsBootstrapTableStatus;
  reason: string | null;
  primary_key: string | null;
  collection: Row | undefined;
  fields: PlannedField[];
  added: string[];
  updated: string[];
  removed: string[];
}

function supportsSqliteIntrospection(): boolean {
  return (
    activeDbAdapter.dialect === "sqlite" || activeDbAdapter.dialect === "libsql"
  );
}

function is_rowid_alias_type(declared: string): boolean {
  return declared.replace(/\(.*\)/g, "").trim().toUpperCase() === "INTEGER";
}

async function table_is_without_rowid(table: string): Promise<boolean> {
  // WITHOUT ROWID is a SQLite-only table option.
  if (!supportsSqliteIntrospection()) return false;
  const rows = await query_rows<{ sql: string | null }>(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    [table]
  );
  return /WITHOUT\s+ROWID/i.test(rows[0]?.sql ?? "");
}

async function unique_columns(table: string): Promise<Set<string>> {
  const unique = new Set<string>();
  if (!supportsSqliteIntrospection()) {
    if (activeDbAdapter.dialect === "postgres") {
      const rows = await activeDbAdapter.query<{ name: string }>(
        `SELECT a.attname AS name
           FROM pg_index i
           JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
          WHERE i.indrelid = $1::regclass
            AND i.indisunique = true
            AND i.indisprimary = false
            AND i.indnatts = 1`,
        [table]
      );
      for (const row of rows) unique.add(row.name);
    } else if (activeDbAdapter.dialect === "mysql") {
      const rows = await activeDbAdapter.query<{ name: string }>(
        `SELECT column_name AS name
           FROM information_schema.statistics
          WHERE table_schema = DATABASE()
            AND table_name = ?
            AND non_unique = 0
          GROUP BY index_name, column_name
         HAVING COUNT(*) = 1`,
        [table]
      );
      for (const row of rows) unique.add(row.name);
    }
    return unique;
  }
  // PRAGMA statements are not classified as reads by the Db facade, so they
  // must go straight to the SQLite adapter.
  const indexes = await activeDbAdapter.query<{
    name: string;
    unique: number;
    partial: number;
  }>(`PRAGMA index_list(${quote_identifier(table)})`);
  for (const index of indexes) {
    if (!index.unique || index.partial) continue;
    const columns = await activeDbAdapter.query<{ name: string | null }>(
      `PRAGMA index_info(${quote_identifier(index.name)})`
    );
    if (columns.length === 1 && columns[0]?.name) {
      unique.add(columns[0].name);
    }
  }
  return unique;
}

/** Alias fields are CMS metadata only and never have a matching SQL column. */
function metadata_only_row(row: Row): boolean {
  return String(row.interface ?? "") === "alias" || String(row.type ?? "") === "alias";
}

/** Column metadata through the dialect-aware Db facade. */
async function describe_columns(table: string): Promise<ColumnInfo[]> {
  const described = await db.describe_table(table);
  if (described === false) return [];
  return (described as Row[]).map((column, index) => {
    const nullable =
      column.null === true || column.null === 1 || column.null === "YES";
    return {
      cid: index,
      name: String(column.name ?? ""),
      type: String(column.type ?? ""),
      notnull: nullable ? 0 : 1,
      dflt_value:
        column.default === null || column.default === undefined
          ? null
          : String(column.default),
      pk: String(column.key ?? "") === "PRI" ? 1 : 0,
      extra: String(column.extra ?? ""),
    };
  });
}

async function build_table_plan(
  name: string,
  reconcile: boolean
): Promise<TablePlan> {
  const collection = await collection_row(name);
  const columns = await describe_columns(name);
  const primaryColumns = columns.filter((column) => Number(column.pk) > 0);

  if (primaryColumns.length === 0) {
    return {
      name,
      label: String(collection?.label ?? humanize(name)),
      status: "skipped",
      reason: "Add a single-column primary key before this table can be exposed by the CMS API.",
      primary_key: null,
      collection,
      fields: [],
      added: [],
      updated: [],
      removed: [],
    };
  }

  if (primaryColumns.length > 1) {
    return {
      name,
      label: String(collection?.label ?? humanize(name)),
      status: "skipped",
      reason: "Composite primary keys are not supported by the CMS API yet.",
      primary_key: null,
      collection,
      fields: [],
      added: [],
      updated: [],
      removed: [],
    };
  }

  const primary = primaryColumns[0];
  // SQLite exposes auto-increment only through its INTEGER PRIMARY KEY rowid
  // alias; the Db facade labels every SQLite primary key with `extra`.
  const primaryAuto = supportsSqliteIntrospection()
    ? is_rowid_alias_type(primary.type) && !(await table_is_without_rowid(name))
    : /auto_increment/i.test(primary.extra ?? "");
  const unique = await unique_columns(name);
  const fields: PlannedField[] = columns.map((column) => {
    const isPrimary = column.name === primary.name;
    const hasDefault = column.dflt_value !== null;
    const autoIncrement =
      !supportsSqliteIntrospection() && /auto_increment/i.test(column.extra ?? "");
    const type = inferType(column.name, column.type);
    const required =
      !hasDefault &&
      !autoIncrement &&
      (isPrimary ? !primaryAuto : Number(column.notnull) === 1);
    const systemTimestamp =
      !required && (column.name === "created_at" || column.name === "updated_at");
    return {
      name: column.name,
      label: humanize(column.name),
      type,
      interface: inferInterface(column.name, type),
      required,
      unique: isPrimary || unique.has(column.name),
      hidden: (isPrimary && primaryAuto) || systemTimestamp,
      readonly: (isPrimary && primaryAuto) || systemTimestamp,
      primary: isPrimary,
    };
  });

  const existingRows = collection
    ? await query_rows(
        "SELECT * FROM cms_fields WHERE collection_id = ? ORDER BY sort ASC, id ASC",
        [Number(collection.id)]
      )
    : [];
  const existingByName = new Map(existingRows.map((row) => [String(row.name), row]));
  const added = fields
    .filter((field) => {
      const row = existingByName.get(field.name);
      return !row || metadata_only_row(row);
    })
    .map((field) => field.name);
  const removed = reconcile
    ? existingRows
        .filter((row) => !metadata_only_row(row))
        .map((row) => String(row.name))
        .filter((fieldName) => !fields.some((field) => field.name === fieldName))
    : [];
  const primaryChanged =
    collection !== undefined && String(collection.primary_key ?? "id") !== primary.name;
  const changed =
    !collection || added.length > 0 || removed.length > 0 || primaryChanged;

  return {
    name,
    label: String(collection?.label ?? humanize(name)),
    status: changed ? (collection ? "update" : "new") : "ready",
    reason: null,
    primary_key: primary.name,
    collection,
    fields,
    added,
    updated: [],
    removed,
  };
}

async function collect_plans(reconcile: boolean): Promise<TablePlan[]> {
  const names = (await table_names()).filter((name) => !is_internal_table(name));
  const plans: TablePlan[] = [];
  for (const name of names) {
    plans.push(await build_table_plan(name, reconcile));
  }
  return plans;
}

function report_from_plans(plans: TablePlan[], applied: boolean): CmsBootstrapReport {
  const tables: CmsBootstrapTable[] = plans.map((plan) => ({
    name: plan.name,
    label: plan.label,
    status: plan.status,
    reason: plan.reason,
    primary_key: plan.primary_key,
    field_count: plan.fields.length,
    added_fields: plan.added,
    updated_fields: plan.updated,
    removed_fields: plan.removed,
  }));
  return {
    applied,
    tables,
    summary: {
      scanned: tables.length,
      new: tables.filter((table) => table.status === "new").length,
      update: tables.filter((table) => table.status === "update").length,
      ready: tables.filter((table) => table.status === "ready").length,
      skipped: tables.filter((table) => table.status === "skipped").length,
    },
  };
}

async function apply_plan(plan: TablePlan): Promise<void> {
  if (plan.status === "skipped" || plan.status === "ready") return;
  const now = nowSeconds();
  await db.transaction(async (tx) => {
    let collectionId: number;
    if (!plan.collection) {
      collectionId = await tx.insert(
        {
          name: plan.name,
          label: plan.label,
          icon: "table",
          note: "",
          primary_key: plan.primary_key,
          singleton: 0,
          hidden: 0,
          system: 0,
          created_at: now,
          updated_at: now,
        },
        "cms_collections"
      );
    } else {
      collectionId = Number(plan.collection.id);
      if (String(plan.collection.primary_key ?? "id") !== plan.primary_key) {
        await execute_statement(
          "UPDATE cms_collections SET primary_key = ?, updated_at = ? WHERE id = ?",
          [plan.primary_key, now, collectionId],
          tx
        );
      }
    }

    const existingRows = await query_rows(
      "SELECT * FROM cms_fields WHERE collection_id = ? ORDER BY sort ASC, id ASC",
      [collectionId],
      tx
    );
    const existingByName = new Map(existingRows.map((row) => [String(row.name), row]));
    const maxSort = existingRows.reduce(
      (maximum, row) => Math.max(maximum, Number(row.sort ?? 0)),
      -1
    );
    let nextSort = maxSort + 1;
    for (const field of plan.fields) {
      const row = existingByName.get(field.name);
      if (row && metadata_only_row(row)) {
        await tx.update(
          Number(row.id),
          {
            label: field.label,
            type: field.type,
            interface: field.interface,
            required: field.required ? 1 : 0,
            unique: field.unique ? 1 : 0,
            hidden: field.hidden ? 1 : 0,
            readonly: field.readonly ? 1 : 0,
            updated_at: now,
          },
          "cms_fields"
        );
        continue;
      }
      if (row) continue;
      await tx.insert(
        {
          collection_id: collectionId,
          name: field.name,
          label: field.label,
          type: field.type,
          interface: field.interface,
          options: "{}",
          required: field.required ? 1 : 0,
          unique: field.unique ? 1 : 0,
          hidden: field.hidden ? 1 : 0,
          readonly: field.readonly ? 1 : 0,
          sort: nextSort,
          created_at: now,
          updated_at: now,
        },
        "cms_fields"
      );
      nextSort += 1;
    }

    for (const fieldName of plan.removed) {
      const row = existingByName.get(fieldName);
      if (!row) continue;
      await tx.delete(Number(row.id), "cms_fields");
      await remove_field_from_policies(plan.name, fieldName, tx);
    }

    if (plan.added.length > 0 || plan.updated.length > 0 || plan.removed.length > 0) {
      await execute_statement(
        "UPDATE cms_collections SET updated_at = ? WHERE id = ?",
        [now, collectionId],
        tx
      );
    }
  });
}

async function sync_collections(): Promise<void> {
  for (const plan of await collect_plans(false)) {
    await apply_plan(plan);
  }
}

/** Scan user tables without changing CMS metadata. */
export async function scan_database_schema(): Promise<CmsBootstrapReport> {
  await ensure_cms_schema();
  return report_from_plans(await collect_plans(true), false);
}

/**
 * Register or reconcile every user table that has a single-column primary key.
 *
 * The explicit bootstrap keeps existing labels, icons, interfaces, options and
 * policies while bringing field metadata back in sync with the SQLite schema.
 */
export async function bootstrap_database(): Promise<CmsBootstrapReport> {
  await ensure_cms_schema();
  const plans = await collect_plans(true);
  for (const plan of plans) await apply_plan(plan);
  return report_from_plans(plans, true);
}

function strip_field_from_group(value: unknown, fieldName: string): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const group = value as { match?: unknown; conditions?: unknown };
  if (!Array.isArray(group.conditions)) return value;
  return {
    ...group,
    conditions: group.conditions.filter((condition) => {
      if (!condition || typeof condition !== "object" || Array.isArray(condition)) {
        return false;
      }
      return String((condition as Record<string, unknown>).field ?? "") !== fieldName;
    }),
  };
}

/** Keep policies valid when a collection field is removed. */
export async function remove_field_from_policies(
  collectionName: string,
  fieldName: string,
  client: Db = db
): Promise<void> {
  const rows = await query_rows(
    `SELECT id, fields, filter, validation, presets
     FROM eterc_permissions WHERE collection = ?`,
    [collectionName],
    client
  );
  if (rows.length === 0) return;
  const now = nowSeconds();
  for (const row of rows) {
    let fields: unknown = [];
    let filter: unknown = null;
    let validation: unknown = null;
    let presets: unknown = [];
    try {
      fields = JSON.parse(String(row.fields ?? "[]")) as unknown;
    } catch {
      fields = [];
    }
    try {
      filter = JSON.parse(String(row.filter ?? "null")) as unknown;
    } catch {
      filter = null;
    }
    try {
      validation = JSON.parse(String(row.validation ?? "null")) as unknown;
    } catch {
      validation = null;
    }
    try {
      presets = JSON.parse(String(row.presets ?? "[]")) as unknown;
    } catch {
      presets = [];
    }
    const nextFields = Array.isArray(fields)
      ? fields.map(String).filter((name) => name === "*" || name !== fieldName)
      : [];
    const nextPresets = Array.isArray(presets)
      ? presets.filter((preset) => {
          if (!preset || typeof preset !== "object" || Array.isArray(preset)) {
            return false;
          }
          return String((preset as Record<string, unknown>).field ?? "") !== fieldName;
        })
      : [];
    await execute_statement(
      `UPDATE eterc_permissions
       SET fields = ?, filter = ?, validation = ?, presets = ?, updated_at = ?
       WHERE id = ?`,
      [
        JSON.stringify(nextFields),
        JSON.stringify(strip_field_from_group(filter, fieldName)),
        JSON.stringify(strip_field_from_group(validation, fieldName)),
        JSON.stringify(nextPresets),
        now,
        row.id,
      ],
      client
    );
  }
}

/**
 * Double quotes work for SQLite, PostgreSQL and MySQL (ANSI_QUOTES), while
 * backticks are SQLite/MySQL-only. CMS identifiers are validated before use.
 */
export function quote_identifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function is_safe_identifier(value: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value);
}

export function default_field_sql(
  field: {
    name: string;
    type: CmsFieldType;
    required?: boolean;
    unique?: boolean;
    options?: Record<string, unknown>;
  },
  includeUnique = true
): string {
  const type = field.type;
  const options = field.options ?? {};
  if (type === "alias") {
    throw new Error("Alias fields are CMS metadata only and do not create SQL columns.");
  }
  const dialect = activeDbAdapter.dialect;
  const numeric = type === "integer" || type === "boolean" || type === "relation";
  const decimal = type === "decimal";
  const textual = !numeric && !decimal;
  let sqlType = "TEXT";
  if (numeric) sqlType = "INTEGER";
  if (decimal) sqlType = "REAL";
  // MySQL does not accept literal defaults on TEXT columns. Use a bounded
  // VARCHAR for common string types and expression defaults for long text.
  if (dialect === "mysql" && textual) {
    sqlType = type === "text" || type === "json" ? "TEXT" : "VARCHAR(255)";
  }

  let sql = `${quote_identifier(field.name)} ${sqlType}`;
  const defaultExpression =
    dialect === "mysql" &&
    (sqlType === "TEXT" || sqlType === "BLOB" || sqlType === "JSON");
  if (type === "boolean") sql += " NOT NULL DEFAULT 0";
  else if (field.required) {
    const fallback =
      type === "integer" || type === "decimal" || type === "relation" ? "0" : "''";
    if (options.default !== undefined && options.default !== null && options.default !== "") {
      const raw = String(options.default).replace(/'/g, "''");
      sql +=
        type === "integer" || type === "decimal" || type === "relation"
          ? ` NOT NULL DEFAULT ${Number(raw) || 0}`
          : defaultExpression
            ? ` NOT NULL DEFAULT ('${raw}')`
            : ` NOT NULL DEFAULT '${raw}'`;
    } else {
      sql += ` NOT NULL DEFAULT ${defaultExpression && fallback === "''" ? "('')" : fallback}`;
    }
  }
  if (includeUnique && (field.unique === true || options.unique === true)) {
    sql += " UNIQUE";
  }
  return sql;
}

export async function collection_metadata_row(
  name: string
): Promise<Row | undefined> {
  return collection_row(name);
}

export async function list_known_tables(): Promise<string[]> {
  return (await table_names()).filter((name) => !is_internal_table(name));
}

export function is_system_table(name: string): boolean {
  return SYSTEM_TABLE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

export function humanize_name(name: string): string {
  return humanize(name);
}

export function make_slug(name: string): string {
  return slugify(name);
}
