import type {
  DatabaseDialect,
  IDatabaseAdapter,
} from "../../contracts/database";
import { quoteIdentifier } from "../sql";

function quoteFor(dialect: DatabaseDialect, identifier: string): string {
  return quoteIdentifier(dialect, identifier);
}

function autoPk(dialect: DatabaseDialect): string {
  if (dialect === "postgres") return "BIGSERIAL PRIMARY KEY";
  if (dialect === "mysql") return "INT NOT NULL AUTO_INCREMENT PRIMARY KEY";
  return "INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT";
}

function integerType(dialect: DatabaseDialect): string {
  return dialect === "postgres" ? "BIGINT" : "INTEGER";
}

function realType(dialect: DatabaseDialect): string {
  return dialect === "postgres" ? "DOUBLE PRECISION" : "REAL";
}

interface TextColumnOptions {
  /** Long payloads keep TEXT on MySQL instead of a bounded VARCHAR. */
  long?: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  notNull?: boolean;
  defaultValue?: string;
}

/**
 * Text column DDL that works on all supported dialects.
 *
 * MySQL cannot index TEXT columns without a prefix, and cannot apply a literal
 * default to TEXT. Indexable text therefore uses VARCHAR(255), while long
 * payload columns use TEXT with an expression default.
 */
function textColumn(
  dialect: DatabaseDialect,
  options: TextColumnOptions = {},
): string {
  const long = options.long === true;
  const type = dialect === "mysql" && !long ? "VARCHAR(255)" : "TEXT";
  let sql = type;
  if (options.notNull) sql += " NOT NULL";
  if (options.primaryKey) sql += " PRIMARY KEY";
  if (options.unique) sql += " UNIQUE";
  if (options.defaultValue !== undefined) {
    const escaped = options.defaultValue.replace(/'/g, "''");
    sql +=
      dialect === "mysql" && type === "TEXT"
        ? ` DEFAULT ('${escaped}')`
        : ` DEFAULT '${escaped}'`;
  }
  return sql;
}

async function indexExistsMySQL(
  adapter: IDatabaseAdapter,
  name: string,
): Promise<boolean> {
  const rows = await adapter.query<{ name: string }>(
    "SELECT index_name AS name FROM information_schema.statistics WHERE table_schema = DATABASE() AND index_name = ? LIMIT 1",
    [name],
  );
  return rows.length > 0;
}

async function createIndex(
  adapter: IDatabaseAdapter,
  name: string,
  table: string,
  columns: string[],
  unique = false,
): Promise<void> {
  const dialect = adapter.dialect;
  if (dialect === "mysql" && (await indexExistsMySQL(adapter, name))) return;
  const prefix = unique ? "CREATE UNIQUE INDEX" : "CREATE INDEX";
  const exists = dialect === "mysql" ? "" : " IF NOT EXISTS";
  try {
    await adapter.execute(
      `${prefix}${exists} ${quoteFor(dialect, name)} ON ${quoteFor(
        dialect,
        table,
      )} (${columns.map((column) => quoteFor(dialect, column)).join(", ")})`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (dialect === "mysql" && /duplicate key name|already exists/i.test(message)) {
      return;
    }
    throw error;
  }
}

function baseTables(dialect: DatabaseDialect): string[] {
  const q = (identifier: string) => quoteFor(dialect, identifier);
  const int = integerType(dialect);
  const real = realType(dialect);
  const text = (options: TextColumnOptions = {}) => textColumn(dialect, options);
  return [
    `CREATE TABLE IF NOT EXISTS ${q("eterc_user_levels")} (
      ${q("id")} ${autoPk(dialect)},
      ${q("level_title")} ${text({ notNull: true, defaultValue: "" })}
    )`,
    `CREATE TABLE IF NOT EXISTS ${q("eterc_users")} (
      ${q("id")} ${autoPk(dialect)},
      ${q("code")} ${text()},
      ${q("user_level_id")} ${int} NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS ${q("eterc_administrators")} (
      ${q("id")} ${autoPk(dialect)},
      ${q("username")} ${text()},
      ${q("email")} ${text()},
      ${q("first_name")} ${text({ notNull: true, defaultValue: "" })},
      ${q("last_name")} ${text({ notNull: true, defaultValue: "" })},
      ${q("title")} ${text({ notNull: true, defaultValue: "" })},
      ${q("password")} ${text()},
      ${q("eterc_user_id")} ${int},
      ${q("active")} ${int} NOT NULL DEFAULT 0,
      ${q("failed_login_attempts")} ${int} NOT NULL DEFAULT 0,
      ${q("last_failed_attempt")} ${int} NOT NULL DEFAULT 0,
      ${q("login_blocked_until")} ${int} NOT NULL DEFAULT 0,
      ${q("failed_login_ip")} ${text({ notNull: true, defaultValue: "" })}
    )`,
    `CREATE TABLE IF NOT EXISTS ${q("eterc_tokens")} (
      ${q("id")} ${autoPk(dialect)},
      ${q("token")} ${text()},
      ${q("user_id")} ${int} NOT NULL DEFAULT 0,
      ${q("expiry_date")} ${int},
      ${q("code")} ${text({ defaultValue: "0" })}
    )`,
    `CREATE TABLE IF NOT EXISTS ${q("login_attempts")} (
      ${q("id")} ${autoPk(dialect)},
      ${q("target_table")} ${text({ notNull: true })},
      ${q("identifier")} ${text({ notNull: true })},
      ${q("ip_address")} ${text({ notNull: true, defaultValue: "" })},
      ${q("attempted_at")} ${int} NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS ${q("password_resets")} (
      ${q("id")} ${autoPk(dialect)},
      ${q("target_table")} ${text({ notNull: true })},
      ${q("identifier")} ${text({ notNull: true })},
      ${q("token")} ${text({ notNull: true })},
      ${q("expiry_date")} ${int} NOT NULL,
      ${q("used")} ${int} NOT NULL DEFAULT 0,
      ${q("created_at")} ${int} NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS ${q("cms_migrations")} (
      ${q("id")} ${text({ primaryKey: true, notNull: true })},
      ${q("applied_at")} ${int} NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS ${q("cms_collections")} (
      ${q("id")} ${autoPk(dialect)},
      ${q("name")} ${text({ notNull: true, unique: true })},
      ${q("label")} ${text({ notNull: true, defaultValue: "" })},
      ${q("icon")} ${text({ notNull: true, defaultValue: "table" })},
      ${q("color")} ${text({ notNull: true, defaultValue: "" })},
      ${q("display_template")} ${text({ long: true, notNull: true, defaultValue: "" })},
      ${q("ordering_mode")} ${text({ notNull: true, defaultValue: "" })},
      ${q("default_order")} ${text({ long: true, notNull: true, defaultValue: "[]" })},
      ${q("note")} ${text({ long: true, notNull: true, defaultValue: "" })},
      ${q("primary_key")} ${text({ notNull: true, defaultValue: "id" })},
      ${q("singleton")} ${int} NOT NULL DEFAULT 0,
      ${q("hidden")} ${int} NOT NULL DEFAULT 0,
      ${q("system")} ${int} NOT NULL DEFAULT 0,
      ${q("created_at")} ${int} NOT NULL,
      ${q("updated_at")} ${int} NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS ${q("cms_fields")} (
      ${q("id")} ${autoPk(dialect)},
      ${q("collection_id")} ${int} NOT NULL,
      ${q("name")} ${text({ notNull: true })},
      ${q("label")} ${text({ notNull: true, defaultValue: "" })},
      ${q("type")} ${text({ notNull: true, defaultValue: "string" })},
      ${q("interface")} ${text({ notNull: true, defaultValue: "input" })},
      ${q("options")} ${text({ long: true, notNull: true, defaultValue: "{}" })},
      ${q("required")} ${int} NOT NULL DEFAULT 0,
      ${q("unique")} ${int} NOT NULL DEFAULT 0,
      ${q("hidden")} ${int} NOT NULL DEFAULT 0,
      ${q("readonly")} ${int} NOT NULL DEFAULT 0,
      ${q("clear_hidden_value_on_save")} ${int} NOT NULL DEFAULT 0,
      ${q("group")} ${text()},
      ${q("validation")} ${text({
        long: true,
        notNull: true,
        defaultValue: '{"match":"all","conditions":[]}',
      })},
      ${q("validation_message")} ${text({ long: true, notNull: true, defaultValue: "" })},
      ${q("conditions")} ${text({ long: true, notNull: true, defaultValue: "[]" })},
      ${q("display_options")} ${text({ long: true, notNull: true, defaultValue: "{}" })},
      ${q("sort")} ${int} NOT NULL DEFAULT 0,
      ${q("created_at")} ${int} NOT NULL,
      ${q("updated_at")} ${int} NOT NULL,
      UNIQUE(${q("collection_id")}, ${q("name")})
    )`,
    `CREATE TABLE IF NOT EXISTS ${q("eterc_roles")} (
      ${q("id")} ${autoPk(dialect)},
      ${q("user_level_id")} ${int} NOT NULL UNIQUE,
      ${q("name")} ${text({ notNull: true, unique: true })},
      ${q("slug")} ${text({ notNull: true, unique: true })},
      ${q("description")} ${text({ long: true, notNull: true, defaultValue: "" })},
      ${q("app_access")} ${int} NOT NULL DEFAULT 1,
      ${q("api_access")} ${int} NOT NULL DEFAULT 1,
      ${q("admin_access")} ${int} NOT NULL DEFAULT 0,
      ${q("is_system")} ${int} NOT NULL DEFAULT 0,
      ${q("parent_role_id")} ${int},
      ${q("created_at")} ${int} NOT NULL,
      ${q("updated_at")} ${int} NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS ${q("eterc_permissions")} (
      ${q("id")} ${autoPk(dialect)},
      ${q("role_id")} ${int} NOT NULL,
      ${q("collection")} ${text({ notNull: true })},
      ${q("action")} ${text({ notNull: true })},
      ${q("fields")} ${text({ long: true, notNull: true, defaultValue: '["*"]' })},
      ${q("filter")} ${text({
        long: true,
        notNull: true,
        defaultValue: '{"match":"all","conditions":[]}',
      })},
      ${q("validation")} ${text({
        long: true,
        notNull: true,
        defaultValue: '{"match":"all","conditions":[]}',
      })},
      ${q("presets")} ${text({ long: true, notNull: true, defaultValue: "[]" })},
      ${q("created_at")} ${int} NOT NULL,
      ${q("updated_at")} ${int} NOT NULL,
      UNIQUE(${q("role_id")}, ${q("collection")}, ${q("action")})
    )`,
    `CREATE TABLE IF NOT EXISTS ${q("eterc_api_keys")} (
      ${q("id")} ${autoPk(dialect)},
      ${q("name")} ${text({ notNull: true })},
      ${q("key_prefix")} ${text({ notNull: true, unique: true })},
      ${q("key_hash")} ${text({ notNull: true })},
      ${q("role_id")} ${int} NOT NULL,
      ${q("user_id")} ${int},
      ${q("active")} ${int} NOT NULL DEFAULT 1,
      ${q("expires_at")} ${int},
      ${q("last_used_at")} ${int},
      ${q("created_at")} ${int} NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS ${q("eterc_identities")} (
      ${q("id")} ${autoPk(dialect)},
      ${q("user_id")} ${int} NOT NULL,
      ${q("provider")} ${text({ notNull: true })},
      ${q("subject")} ${text({ notNull: true })},
      ${q("email")} ${text({ notNull: true, defaultValue: "" })},
      ${q("name")} ${text({ notNull: true, defaultValue: "" })},
      ${q("created_at")} ${int} NOT NULL,
      UNIQUE(${q("provider")}, ${q("subject")})
    )`,
    `CREATE TABLE IF NOT EXISTS ${q("cms_flows")} (
      ${q("id")} ${text({ primaryKey: true, notNull: true })},
      ${q("name")} ${text({ notNull: true })},
      ${q("description")} ${text({ long: true, notNull: true, defaultValue: "" })},
      ${q("icon")} ${text({ notNull: true, defaultValue: "zap" })},
      ${q("color")} ${text({ notNull: true, defaultValue: "var(--foreground)" })},
      ${q("status")} ${text({ notNull: true, defaultValue: "inactive" })},
      ${q("trigger")} ${text({ notNull: true, defaultValue: "manual" })},
      ${q("options")} ${text({ long: true, notNull: true, defaultValue: "{}" })},
      ${q("accountability")} ${text({ long: true })},
      ${q("operation")} ${text()},
      ${q("revision")} ${int} NOT NULL DEFAULT 1,
      ${q("secret_hash")} ${text()},
      ${q("secret_prefix")} ${text()},
      ${q("next_run_at")} ${int},
      ${q("last_run_at")} ${int},
      ${q("created_at")} ${int} NOT NULL,
      ${q("updated_at")} ${int} NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS ${q("cms_flow_operations")} (
      ${q("id")} ${text({ primaryKey: true, notNull: true })},
      ${q("flow_id")} ${text({ notNull: true })},
      ${q("name")} ${text({ notNull: true })},
      ${q("key")} ${text({ notNull: true })},
      ${q("type")} ${text({ notNull: true })},
      ${q("options")} ${text({ long: true, notNull: true, defaultValue: "{}" })},
      ${q("position_x")} ${real} NOT NULL DEFAULT 0,
      ${q("position_y")} ${real} NOT NULL DEFAULT 0,
      ${q("resolve")} ${text({ long: true })},
      ${q("reject")} ${text({ long: true })},
      ${q("created_at")} ${int} NOT NULL,
      ${q("updated_at")} ${int} NOT NULL,
      UNIQUE(${q("flow_id")}, ${q("key")}),
      FOREIGN KEY (${q("flow_id")}) REFERENCES ${q("cms_flows")}(${q("id")}) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS ${q("cms_flow_runs")} (
      ${q("id")} ${text({ primaryKey: true, notNull: true })},
      ${q("flow_id")} ${text({ notNull: true })},
      ${q("trigger")} ${text({ notNull: true })},
      ${q("status")} ${text({ notNull: true, defaultValue: "running" })},
      ${q("started_at")} ${int} NOT NULL,
      ${q("finished_at")} ${int},
      ${q("duration_ms")} ${int},
      ${q("input")} ${text({ long: true, notNull: true, defaultValue: "null" })},
      ${q("output")} ${text({ long: true, notNull: true, defaultValue: "null" })},
      ${q("error")} ${text({ long: true })},
      ${q("principal")} ${text({ long: true, notNull: true, defaultValue: "{}" })},
      ${q("accountability")} ${text({ long: true })},
      ${q("parent_run_id")} ${text()},
      ${q("created_at")} ${int} NOT NULL,
      FOREIGN KEY (${q("flow_id")}) REFERENCES ${q("cms_flows")}(${q("id")}) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS ${q("cms_flow_run_steps")} (
      ${q("id")} ${text({ primaryKey: true, notNull: true })},
      ${q("run_id")} ${text({ notNull: true })},
      ${q("operation_id")} ${text()},
      ${q("key")} ${text({ notNull: true, defaultValue: "" })},
      ${q("type")} ${text({ notNull: true, defaultValue: "" })},
      ${q("path")} ${text({ notNull: true, defaultValue: "root" })},
      ${q("status")} ${text({ notNull: true, defaultValue: "success" })},
      ${q("started_at")} ${int} NOT NULL,
      ${q("finished_at")} ${int} NOT NULL,
      ${q("duration_ms")} ${int} NOT NULL DEFAULT 0,
      ${q("input")} ${text({ long: true, notNull: true, defaultValue: "null" })},
      ${q("output")} ${text({ long: true, notNull: true, defaultValue: "null" })},
      ${q("error")} ${text({ long: true })},
      ${q("sort")} ${int} NOT NULL DEFAULT 0,
      FOREIGN KEY (${q("run_id")}) REFERENCES ${q("cms_flow_runs")}(${q("id")}) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS ${q("cms_flow_jobs")} (
      ${q("id")} ${text({ primaryKey: true, notNull: true })},
      ${q("flow_id")} ${text({ notNull: true })},
      ${q("trigger")} ${text({ notNull: true })},
      ${q("payload")} ${text({ long: true, notNull: true, defaultValue: "{}" })},
      ${q("status")} ${text({ notNull: true, defaultValue: "pending" })},
      ${q("attempts")} ${int} NOT NULL DEFAULT 0,
      ${q("max_attempts")} ${int} NOT NULL DEFAULT 3,
      ${q("run_at")} ${int} NOT NULL,
      ${q("locked_at")} ${int},
      ${q("locked_by")} ${text()},
      ${q("error")} ${text({ long: true })},
      ${q("created_at")} ${int} NOT NULL,
      ${q("updated_at")} ${int} NOT NULL,
      FOREIGN KEY (${q("flow_id")}) REFERENCES ${q("cms_flows")}(${q("id")}) ON DELETE CASCADE
    )`,
  ];
}

async function indexes(adapter: IDatabaseAdapter): Promise<void> {
  await createIndex(adapter, "eterc_tokens_token_idx", "eterc_tokens", ["token"]);
  await createIndex(adapter, "login_attempts_target_table_idx", "login_attempts", ["target_table"]);
  await createIndex(adapter, "login_attempts_identifier_idx", "login_attempts", ["identifier"]);
  await createIndex(adapter, "password_resets_token_idx", "password_resets", ["token"]);
  await createIndex(adapter, "cms_fields_collection_idx", "cms_fields", ["collection_id"]);
  await createIndex(adapter, "eterc_permissions_role_idx", "eterc_permissions", ["role_id"]);
  await createIndex(adapter, "eterc_api_keys_prefix_idx", "eterc_api_keys", ["key_prefix"]);
  await createIndex(adapter, "eterc_identities_user_idx", "eterc_identities", ["user_id"]);
  await createIndex(adapter, "eterc_roles_parent_idx", "eterc_roles", ["parent_role_id"]);
  await createIndex(adapter, "cms_flows_status_trigger_idx", "cms_flows", ["status", "trigger"]);
  await createIndex(adapter, "cms_flows_next_run_idx", "cms_flows", ["status", "next_run_at"]);
  await createIndex(adapter, "cms_flow_operations_flow_idx", "cms_flow_operations", ["flow_id"]);
  await createIndex(adapter, "cms_flow_runs_flow_started_idx", "cms_flow_runs", ["flow_id", "started_at"]);
  await createIndex(adapter, "cms_flow_runs_status_idx", "cms_flow_runs", ["status"]);
  await createIndex(adapter, "cms_flow_run_steps_run_idx", "cms_flow_run_steps", ["run_id", "sort"]);
  await createIndex(adapter, "cms_flow_jobs_claim_idx", "cms_flow_jobs", ["status", "run_at"]);
}

export function remoteSchemaStatements(dialect: DatabaseDialect): string[] {
  return baseTables(dialect);
}

export async function applyRemoteSchema(
  adapter: IDatabaseAdapter,
): Promise<void> {
  for (const statement of baseTables(adapter.dialect)) {
    await adapter.execute(statement);
  }
  await indexes(adapter);
}

