import { sqlite, type Row } from "@/engine/db";
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

CREATE INDEX IF NOT EXISTS "cms_fields_collection_idx" ON "cms_fields"("collection_id");
CREATE INDEX IF NOT EXISTS "eterc_permissions_role_idx" ON "eterc_permissions"("role_id");
CREATE INDEX IF NOT EXISTS "eterc_api_keys_prefix_idx" ON "eterc_api_keys"("key_prefix");
CREATE INDEX IF NOT EXISTS "eterc_identities_user_idx" ON "eterc_identities"("user_id");
`;

let schemaReady = false;

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function has_column(table: string, column: string): boolean {
  const columns = sqlite()
    .prepare(`PRAGMA table_info(${quote_identifier(table)})`)
    .all() as Array<{ name: string }>;
  return columns.some((entry) => entry.name === column);
}

function ensure_column(table: string, column: string, definition: string): void {
  if (has_column(table, column)) return;
  sqlite().exec(
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
function migrate_access_schema(): void {
  ensure_column("eterc_roles", "parent_role_id", "INTEGER");
  sqlite().exec(
    `CREATE INDEX IF NOT EXISTS "eterc_roles_parent_idx" ON "eterc_roles"("parent_role_id")`
  );
  ensure_column("eterc_api_keys", "user_id", "INTEGER");
  ensure_column(
    "eterc_permissions",
    "filter",
    `TEXT NOT NULL DEFAULT '{"match":"all","conditions":[]}'`
  );
  ensure_column(
    "eterc_permissions",
    "validation",
    `TEXT NOT NULL DEFAULT '{"match":"all","conditions":[]}'`
  );
  ensure_column("eterc_permissions", "presets", "TEXT NOT NULL DEFAULT '[]'");

  const marker = sqlite()
    .prepare("SELECT id FROM cms_migrations WHERE id = ? LIMIT 1")
    .get("access_fields_wildcard_v1") as { id: string } | undefined;
  if (marker) return;
  sqlite()
    .prepare(
      `UPDATE eterc_permissions
       SET fields = '["*"]'
       WHERE fields IS NULL OR fields = '' OR fields = '[]'`
    )
    .run();
  sqlite()
    .prepare("INSERT INTO cms_migrations (id, applied_at) VALUES (?, ?)")
    .run("access_fields_wildcard_v1", nowSeconds());
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

export function ensure_cms_schema(): void {
  if (schemaReady) return;
  sqlite().exec(CMS_DDL);
  migrate_access_schema();
  seed_roles();
  sync_collections();
  schemaReady = true;
}

/** Re-scan the database for tables created outside the content service. */
export function refresh_cms_schema(): void {
  schemaReady = false;
  ensure_cms_schema();
  bootstrap_database();
}

function seed_roles(): void {
  const now = nowSeconds();
  const adminLevel = sqlite()
    .prepare("SELECT id FROM eterc_user_levels WHERE id = 1 LIMIT 1")
    .get() as { id: number } | undefined;

  if (!adminLevel) {
    sqlite()
      .prepare("INSERT INTO eterc_user_levels (id, level_title) VALUES (1, 'admin')")
      .run();
  }

  const admin = sqlite()
    .prepare("SELECT id FROM eterc_roles WHERE user_level_id = 1 LIMIT 1")
    .get() as { id: number } | undefined;

  if (!admin) {
    sqlite()
      .prepare(
        `INSERT INTO eterc_roles
          (user_level_id, name, slug, description, app_access, api_access, admin_access, is_system, created_at, updated_at)
         VALUES (1, 'Admin', 'admin', 'Full access to the content service, access control and project settings.', 1, 1, 1, 1, ?, ?)`
      )
      .run(now, now);
  }

  const memberLevel = sqlite()
    .prepare("SELECT id FROM eterc_user_levels WHERE level_title = 'Member' LIMIT 1")
    .get() as { id: number } | undefined;

  if (!memberLevel) {
    const result = sqlite()
      .prepare("INSERT INTO eterc_user_levels (level_title) VALUES ('Member')")
      .run();
    const levelId = Number(result.lastInsertRowid);
    sqlite()
      .prepare(
        `INSERT INTO eterc_roles
          (user_level_id, name, slug, description, app_access, api_access, admin_access, is_system, created_at, updated_at)
         VALUES (?, 'Member', 'member', 'Default application role. Grant collection permissions from Access.', 1, 1, 0, 0, ?, ?)`
      )
      .run(levelId, now, now);
  }
}

function table_names(): string[] {
  const rows = sqlite()
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all() as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

function is_internal_table(name: string): boolean {
  if (INTERNAL_TABLES.has(name)) return true;
  return SYSTEM_TABLE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function collection_row(name: string): Row | undefined {
  return sqlite()
    .prepare("SELECT * FROM cms_collections WHERE name = ? LIMIT 1")
    .get(name) as Row | undefined;
}

interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
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

function is_rowid_alias_type(declared: string): boolean {
  return declared.replace(/\(.*\)/g, "").trim().toUpperCase() === "INTEGER";
}

function table_is_without_rowid(table: string): boolean {
  const row = sqlite()
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(table) as { sql: string | null } | undefined;
  return /WITHOUT\s+ROWID/i.test(row?.sql ?? "");
}

function unique_columns(table: string): Set<string> {
  const unique = new Set<string>();
  const indexes = sqlite()
    .prepare(`PRAGMA index_list(${quote_identifier(table)})`)
    .all() as Array<{ name: string; unique: number; partial: number }>;
  for (const index of indexes) {
    if (!index.unique || index.partial) continue;
    const columns = sqlite()
      .prepare(`PRAGMA index_info(${quote_identifier(index.name)})`)
      .all() as Array<{ name: string | null }>;
    if (columns.length === 1 && columns[0]?.name) {
      unique.add(columns[0].name);
    }
  }
  return unique;
}

function build_table_plan(name: string, reconcile: boolean): TablePlan {
  const collection = collection_row(name);
  const columns = sqlite()
    .prepare(`PRAGMA table_info(${quote_identifier(name)})`)
    .all() as ColumnInfo[];
  const primaryColumns = columns
    .filter((column) => Number(column.pk) > 0)
    .sort((left, right) => Number(left.pk) - Number(right.pk));

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
  const primaryAuto = is_rowid_alias_type(primary.type) && !table_is_without_rowid(name);
  const unique = unique_columns(name);
  const fields: PlannedField[] = columns.map((column) => {
    const isPrimary = column.name === primary.name;
    const hasDefault = column.dflt_value !== null;
    const type = inferType(column.name, column.type);
    const required = !hasDefault && (isPrimary ? !primaryAuto : Number(column.notnull) === 1);
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
    ? (sqlite()
        .prepare("SELECT * FROM cms_fields WHERE collection_id = ? ORDER BY sort ASC, id ASC")
        .all(Number(collection.id)) as Row[])
    : [];
  const existingByName = new Map(existingRows.map((row) => [String(row.name), row]));
  const added = fields
    .filter((field) => !existingByName.has(field.name))
    .map((field) => field.name);
  const removed = reconcile
    ? existingRows
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

function collect_plans(reconcile: boolean): TablePlan[] {
  return table_names()
    .filter((name) => !is_internal_table(name))
    .map((name) => build_table_plan(name, reconcile));
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

function apply_plan(plan: TablePlan): void {
  if (plan.status === "skipped" || plan.status === "ready") return;
  const now = nowSeconds();
  const apply = sqlite().transaction(() => {
    let collectionId: number;
    if (!plan.collection) {
      const result = sqlite()
        .prepare(
          `INSERT INTO cms_collections
            (name, label, icon, note, primary_key, singleton, hidden, system, created_at, updated_at)
           VALUES (?, ?, 'table', '', ?, 0, 0, 0, ?, ?)`
        )
        .run(plan.name, plan.label, plan.primary_key, now, now);
      collectionId = Number(result.lastInsertRowid);
    } else {
      collectionId = Number(plan.collection.id);
      if (String(plan.collection.primary_key ?? "id") !== plan.primary_key) {
        sqlite()
          .prepare("UPDATE cms_collections SET primary_key = ?, updated_at = ? WHERE id = ?")
          .run(plan.primary_key, now, collectionId);
      }
    }

    const existingRows = sqlite()
      .prepare("SELECT * FROM cms_fields WHERE collection_id = ? ORDER BY sort ASC, id ASC")
      .all(collectionId) as Row[];
    const existingByName = new Map(existingRows.map((row) => [String(row.name), row]));
    const maxSort = existingRows.reduce(
      (maximum, row) => Math.max(maximum, Number(row.sort ?? 0)),
      -1
    );
    let nextSort = maxSort + 1;
    const insertField = sqlite().prepare(
      `INSERT INTO cms_fields
        (collection_id, name, label, type, interface, options, required, "unique", hidden, readonly, sort, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, '{}', ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const field of plan.fields) {
      const row = existingByName.get(field.name);
      if (row) continue;
      insertField.run(
        collectionId,
        field.name,
        field.label,
        field.type,
        field.interface,
        field.required ? 1 : 0,
        field.unique ? 1 : 0,
        field.hidden ? 1 : 0,
        field.readonly ? 1 : 0,
        nextSort,
        now,
        now
      );
      nextSort += 1;
    }

    for (const fieldName of plan.removed) {
      const row = existingByName.get(fieldName);
      if (!row) continue;
      sqlite().prepare("DELETE FROM cms_fields WHERE id = ?").run(Number(row.id));
      remove_field_from_policies(plan.name, fieldName);
    }

    if (plan.added.length > 0 || plan.updated.length > 0 || plan.removed.length > 0) {
      sqlite()
        .prepare("UPDATE cms_collections SET updated_at = ? WHERE id = ?")
        .run(now, collectionId);
    }
  });
  apply();
}

function sync_collections(): void {
  for (const plan of collect_plans(false)) {
    apply_plan(plan);
  }
}

/** Scan user tables without changing CMS metadata. */
export function scan_database_schema(): CmsBootstrapReport {
  ensure_cms_schema();
  return report_from_plans(collect_plans(true), false);
}

/**
 * Register or reconcile every user table that has a single-column primary key.
 *
 * The explicit bootstrap keeps existing labels, icons, interfaces, options and
 * policies while bringing field metadata back in sync with the SQLite schema.
 */
export function bootstrap_database(): CmsBootstrapReport {
  ensure_cms_schema();
  const plans = collect_plans(true);
  for (const plan of plans) apply_plan(plan);
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
export function remove_field_from_policies(
  collectionName: string,
  fieldName: string
): void {
  const rows = sqlite()
    .prepare(
      `SELECT id, fields, filter, validation, presets
       FROM eterc_permissions WHERE collection = ?`
    )
    .all(collectionName) as Row[];
  if (rows.length === 0) return;
  const update = sqlite().prepare(
    `UPDATE eterc_permissions
     SET fields = ?, filter = ?, validation = ?, presets = ?, updated_at = ?
     WHERE id = ?`
  );
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
    update.run(
      JSON.stringify(nextFields),
      JSON.stringify(strip_field_from_group(filter, fieldName)),
      JSON.stringify(strip_field_from_group(validation, fieldName)),
      JSON.stringify(nextPresets),
      now,
      row.id
    );
  }
}

export function quote_identifier(value: string): string {
  return "`" + value.replace(/`/g, "``") + "`";
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
  let sqlType = "TEXT";
  if (type === "integer" || type === "boolean" || type === "relation") sqlType = "INTEGER";
  if (type === "decimal") sqlType = "REAL";

  let sql = `${quote_identifier(field.name)} ${sqlType}`;
  if (type === "boolean") sql += " NOT NULL DEFAULT 0";
  else if (field.required) {
    const fallback =
      type === "integer" || type === "decimal" || type === "relation" ? "0" : "''";
    if (options.default !== undefined && options.default !== null && options.default !== "") {
      const raw = String(options.default).replace(/'/g, "''");
      sql +=
        type === "integer" || type === "decimal" || type === "relation"
          ? ` NOT NULL DEFAULT ${Number(raw) || 0}`
          : ` NOT NULL DEFAULT '${raw}'`;
    } else {
      sql += ` NOT NULL DEFAULT ${fallback}`;
    }
  }
  if (includeUnique && (field.unique === true || options.unique === true)) {
    sql += " UNIQUE";
  }
  return sql;
}

export function collection_metadata_row(name: string): Row | undefined {
  return collection_row(name);
}

export function list_known_tables(): string[] {
  return table_names().filter((name) => !is_internal_table(name));
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
