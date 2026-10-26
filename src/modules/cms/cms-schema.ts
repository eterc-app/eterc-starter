import { sqlite, type Row } from "@/engine/db";
import {
  cms_field_interface,
  type CmsFieldType,
  type CmsFieldInterface,
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

const SYSTEM_TABLE_PREFIXES = ["eterc_", "cms_"];

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

function inferType(declared: string): CmsFieldType {
  const type = declared.toUpperCase();
  if (type.includes("INT")) return "integer";
  if (type.includes("REAL") || type.includes("FLOA") || type.includes("DOUB")) {
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
  if (type === "text" && /(body|content|description|notes?|summary|html|markdown)/i.test(name)) {
    return "textarea";
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

function sync_collections(): void {
  const now = nowSeconds();
  const insertCollection = sqlite().prepare(
    `INSERT INTO cms_collections
      (name, label, icon, note, primary_key, singleton, hidden, system, created_at, updated_at)
     VALUES (?, ?, 'table', '', 'id', 0, ?, ?, ?, ?)`
  );

  for (const name of table_names()) {
    if (is_internal_table(name)) continue;
    let collection = collection_row(name);
    if (!collection) {
      insertCollection.run(
        name,
        humanize(name),
        SYSTEM_TABLE_PREFIXES.some((prefix) => name.startsWith(prefix)) ? 1 : 0,
        SYSTEM_TABLE_PREFIXES.some((prefix) => name.startsWith(prefix)) ? 1 : 0,
        now,
        now
      );
      collection = collection_row(name);
    }
    if (!collection) continue;
    sync_fields(Number(collection.id), name);
  }
}

function sync_fields(collectionId: number, table: string): void {
  const columns = sqlite()
    .prepare(`PRAGMA table_info(${quote_identifier(table)})`)
    .all() as Array<{
    name: string;
    type: string;
    notnull: number;
    pk: number;
  }>;
  const existing = sqlite()
    .prepare("SELECT name FROM cms_fields WHERE collection_id = ?")
    .all(collectionId) as Array<{ name: string }>;
  const known = new Set(existing.map((row) => row.name));
  const now = nowSeconds();
  const insert = sqlite().prepare(
    `INSERT INTO cms_fields
      (collection_id, name, label, type, interface, options, required, "unique", hidden, readonly, sort, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, '{}', ?, 0, ?, ?, ?, ?, ?)`
  );

  let sort = 0;
  for (const column of columns) {
    if (known.has(column.name)) {
      sort += 1;
      continue;
    }
    const type = inferType(column.type);
    const primary = Number(column.pk) > 0;
    insert.run(
      collectionId,
      column.name,
      humanize(column.name),
      type,
      inferInterface(column.name, type),
      !primary && Number(column.notnull) === 1 ? 1 : 0,
      primary ? 1 : 0,
      primary ? 1 : 0,
      sort,
      now,
      now
    );
    sort += 1;
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
  return table_names().filter((name) => !INTERNAL_TABLES.has(name));
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
