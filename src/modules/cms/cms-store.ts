import { sqlite, type Row } from "@/engine/db";
import { EtHttpError } from "@/engine/signals";
import {
  CMS_FIELD_TYPES,
  cms_field_interface,
  type CmsCollection,
  type CmsCollectionInput,
  type CmsCollectionWithFields,
  type CmsField,
  type CmsFieldInput,
  type CmsFieldType,
  type CmsRecordListOptions,
  type CmsRecordListResult,
} from "./cms-types";
import {
  default_field_sql,
  ensure_cms_schema,
  humanize_name,
  is_safe_identifier,
  is_system_table,
  make_slug,
  quote_identifier,
  remove_field_from_policies,
} from "./cms-schema";
import { get_runtime_config } from "./cms-runtime";

const RESERVED_PREFIXES = ["eterc_", "cms_", "sqlite_", "et_", "login_", "password_"];
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function bool(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

function fieldFromRow(row: Row): CmsField {
  return {
    id: Number(row.id),
    collection_id: Number(row.collection_id),
    name: String(row.name),
    label: String(row.label ?? ""),
    type: String(row.type ?? "string") as CmsFieldType,
    interface: String(row.interface ?? "input") as CmsField["interface"],
    options: parse_json_object(row.options),
    required: bool(row.required),
    unique: bool(row.unique),
    hidden: bool(row.hidden),
    readonly: bool(row.readonly),
    sort: Number(row.sort ?? 0),
    created_at: Number(row.created_at ?? 0),
    updated_at: Number(row.updated_at ?? 0),
  };
}

function collectionFromRow(row: Row): CmsCollection {
  return {
    id: Number(row.id),
    name: String(row.name),
    label: String(row.label ?? ""),
    icon: String(row.icon ?? "table"),
    note: String(row.note ?? ""),
    primary_key: String(row.primary_key ?? "id"),
    singleton: bool(row.singleton),
    hidden: bool(row.hidden),
    system: bool(row.system),
    created_at: Number(row.created_at ?? 0),
    updated_at: Number(row.updated_at ?? 0),
  };
}

function parse_json_object(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || value.trim() === "") return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function assert_identifier(value: string, label: string): void {
  if (!is_safe_identifier(value)) {
    throw new EtHttpError(400, `${label} must start with a letter or underscore and contain only letters, numbers and underscores.`);
  }
}

function assert_collection_name(name: string): void {
  assert_identifier(name, "Collection name");
  if (RESERVED_PREFIXES.some((prefix) => name.startsWith(prefix))) {
    throw new EtHttpError(400, "That collection name is reserved by the platform.");
  }
}

function unique_index_name(collectionName: string, fieldName: string): string {
  return `cms_uq_${collectionName}_${fieldName}`;
}

function create_unique_index(collectionName: string, fieldName: string): void {
  sqlite().exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS ${quote_identifier(
      unique_index_name(collectionName, fieldName)
    )} ON ${quote_identifier(collectionName)} (${quote_identifier(fieldName)})`
  );
}

function drop_unique_index(collectionName: string, fieldName: string): void {
  sqlite().exec(
    `DROP INDEX IF EXISTS ${quote_identifier(unique_index_name(collectionName, fieldName))}`
  );
}

function table_exists(name: string): boolean {
  const row = sqlite()
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name) as { name: string } | undefined;
  return row !== undefined;
}

function collection_row(name: string): Row | undefined {
  return sqlite()
    .prepare("SELECT * FROM cms_collections WHERE name = ? LIMIT 1")
    .get(name) as Row | undefined;
}

function field_rows(collectionId: number): CmsField[] {
  return (
    sqlite()
      .prepare("SELECT * FROM cms_fields WHERE collection_id = ? ORDER BY sort ASC, id ASC")
      .all(collectionId) as Row[]
  ).map(fieldFromRow);
}

function require_collection(name: string): { collection: CmsCollection; fields: CmsField[] } {
  ensure_cms_schema();
  if (!is_safe_identifier(name)) {
    throw new EtHttpError(400, "Invalid collection name.");
  }
  const row = collection_row(name);
  if (!row) {
    throw new EtHttpError(404, `Collection '${name}' was not found.`);
  }
  return { collection: collectionFromRow(row), fields: field_rows(Number(row.id)) };
}

function count_rows(table: string): number {
  try {
    const row = sqlite()
      .prepare(`SELECT COUNT(*) AS count FROM ${quote_identifier(table)}`)
      .get() as { count: number };
    return Number(row.count);
  } catch {
    return 0;
  }
}

export function list_collections(options: { include_hidden?: boolean } = {}): CmsCollectionWithFields[] {
  ensure_cms_schema();
  const rows = sqlite()
    .prepare(
      `SELECT * FROM cms_collections
       ${options.include_hidden ? "" : "WHERE hidden = 0"}
       ORDER BY system ASC, label ASC`
    )
    .all() as Row[];
  return rows.map((row) => {
    const collection = collectionFromRow(row);
    return {
      ...collection,
      fields: field_rows(collection.id),
      item_count: count_rows(collection.name),
    };
  });
}

export function get_collection(name: string): CmsCollectionWithFields {
  const { collection, fields } = require_collection(name);
  return {
    ...collection,
    fields,
    item_count: count_rows(collection.name),
  };
}

export function create_collection(input: CmsCollectionInput): CmsCollectionWithFields {
  ensure_cms_schema();
  const name = String(input.name ?? "").trim();
  assert_collection_name(name);
  if (table_exists(name)) {
    throw new EtHttpError(409, `A table named '${name}' already exists.`);
  }

  const requested = (input.fields ?? [])
    .map((field) => ({ ...field, name: String(field.name ?? "").trim() }))
    .filter((field) => field.name !== "id");
  const names = new Set<string>();
  for (const field of requested) {
    assert_identifier(field.name, "Field name");
    if (names.has(field.name)) {
      throw new EtHttpError(400, `Field '${field.name}' is listed more than once.`);
    }
    names.add(field.name);
    if (RESERVED_PREFIXES.some((prefix) => field.name.startsWith(prefix))) {
      throw new EtHttpError(400, `Field '${field.name}' uses a reserved prefix.`);
    }
  }

  const hasCreated = names.has("created_at");
  const hasUpdated = names.has("updated_at");
  const normalizedFields = requested.map(normalize_field);
  const columns: string[] = ["`id` INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT"];
  for (const field of normalizedFields) {
    columns.push(default_field_sql(field, false));
  }
  if (!hasCreated) {
    columns.push("`created_at` TEXT NOT NULL DEFAULT (datetime('now'))");
  }
  if (!hasUpdated) {
    columns.push("`updated_at` TEXT NOT NULL DEFAULT (datetime('now'))");
  }

  const now = nowSeconds();
  const createSql = `CREATE TABLE ${quote_identifier(name)} (${columns.join(", ")})`;
  const create = sqlite().transaction(() => {
  sqlite().exec(createSql);
  for (const field of normalizedFields) {
    if (field.unique) create_unique_index(name, field.name);
  }

  const result = sqlite()
    .prepare(
      `INSERT INTO cms_collections
        (name, label, icon, note, primary_key, singleton, hidden, system, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'id', ?, 0, 0, ?, ?)`
    )
    .run(
      name,
      String(input.label ?? humanize_name(name)),
      String(input.icon ?? "table"),
      String(input.note ?? ""),
      input.singleton ? 1 : 0,
      now,
      now
    );
  const collectionId = Number(result.lastInsertRowid);

  const insertField = sqlite().prepare(
    `INSERT INTO cms_fields
      (collection_id, name, label, type, interface, options, required, "unique", hidden, readonly, sort, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  insertField.run(
    collectionId,
    "id",
    "ID",
    "integer",
    "number",
    "{}",
    1,
    1,
    1,
    1,
    0,
    now,
    now
  );

  let sort = 1;
  for (const field of requested) {
    const normalized = normalize_field(field);
    insertField.run(
      collectionId,
      normalized.name,
      normalized.label,
      normalized.type,
      normalized.interface,
      JSON.stringify(normalized.options),
      normalized.required ? 1 : 0,
      normalized.unique ? 1 : 0,
      normalized.hidden ? 1 : 0,
      normalized.readonly ? 1 : 0,
      sort,
      now,
      now
    );
    sort += 1;
  }

  if (!hasCreated) {
    insertField.run(
      collectionId,
      "created_at",
      "Created At",
      "datetime",
      "datetime",
      "{}",
      0,
      0,
      1,
      1,
      sort++,
      now,
      now
    );
  }
  if (!hasUpdated) {
    insertField.run(
      collectionId,
      "updated_at",
      "Updated At",
      "datetime",
      "datetime",
      "{}",
      0,
      0,
      1,
      1,
      sort++,
      now,
      now
    );
  }

  return get_collection(name);
  });
  return create();
}

export function update_collection(
  name: string,
  patch: Partial<Pick<CmsCollection, "label" | "icon" | "note" | "singleton" | "hidden">>
): CmsCollectionWithFields {
  const { collection } = require_collection(name);
  if (collection.system) {
    throw new EtHttpError(403, "System collections cannot be changed.");
  }
  const current = collection_row(name);
  if (!current) throw new EtHttpError(404, "Collection not found.");
  sqlite()
    .prepare(
      `UPDATE cms_collections
       SET label = ?, icon = ?, note = ?, singleton = ?, hidden = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(
      patch.label ?? collection.label,
      patch.icon ?? collection.icon,
      patch.note ?? collection.note,
      (patch.singleton ?? collection.singleton) ? 1 : 0,
      (patch.hidden ?? collection.hidden) ? 1 : 0,
      nowSeconds(),
      collection.id
    );
  return get_collection(name);
}

export function delete_collection(name: string): void {
  const { collection } = require_collection(name);
  if (collection.system || is_system_table(name)) {
    throw new EtHttpError(403, "System collections cannot be deleted.");
  }
  sqlite().exec(`DROP TABLE IF EXISTS ${quote_identifier(name)}`);
  sqlite().prepare("DELETE FROM cms_fields WHERE collection_id = ?").run(collection.id);
  sqlite().prepare("DELETE FROM cms_collections WHERE id = ?").run(collection.id);
  sqlite().prepare("DELETE FROM eterc_permissions WHERE collection = ?").run(name);
}

export function add_field(collectionName: string, input: CmsFieldInput): CmsField {
  const { collection, fields } = require_collection(collectionName);
  if (collection.system) {
    throw new EtHttpError(403, "System collections cannot be changed.");
  }
  const name = String(input.name ?? "").trim();
  assert_identifier(name, "Field name");
  if (fields.some((field) => field.name === name)) {
    throw new EtHttpError(409, `Field '${name}' already exists in '${collectionName}'.`);
  }
  if (RESERVED_PREFIXES.some((prefix) => name.startsWith(prefix))) {
    throw new EtHttpError(400, "That field name is reserved by the platform.");
  }

  const field = normalize_field({ ...input, name });
  const ddl = default_field_sql(field, false);
  const apply = sqlite().transaction(() => {
    sqlite().exec(
      `ALTER TABLE ${quote_identifier(collectionName)} ADD COLUMN ${ddl}`
    );
    if (field.unique) create_unique_index(collectionName, field.name);
    const now = nowSeconds();
    const sort = fields.reduce((max, item) => Math.max(max, item.sort), 0) + 1;
    const result = sqlite()
      .prepare(
        `INSERT INTO cms_fields
          (collection_id, name, label, type, interface, options, required, "unique", hidden, readonly, sort, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        collection.id,
        field.name,
        field.label,
        field.type,
        field.interface,
        JSON.stringify(field.options),
        field.required ? 1 : 0,
        field.unique ? 1 : 0,
        field.hidden ? 1 : 0,
        field.readonly ? 1 : 0,
        sort,
        now,
        now
      );
    return fieldFromRow(
      sqlite().prepare("SELECT * FROM cms_fields WHERE id = ?").get(result.lastInsertRowid) as Row
    );
  });
  try {
    return apply();
  } catch (error) {
    if (error instanceof EtHttpError) throw error;
    throw new EtHttpError(
      409,
      `The field '${field.name}' could not be added. ${
        error instanceof Error ? error.message : ""
      }`.trim()
    );
  }
}

export function update_field(
  collectionName: string,
  fieldName: string,
  patch: Partial<Pick<CmsField, "label" | "type" | "interface" | "options" | "required" | "unique" | "hidden" | "readonly">>
): CmsField {
  const { collection, fields } = require_collection(collectionName);
  if (collection.system) {
    throw new EtHttpError(403, "System collections cannot be changed.");
  }
  const field = fields.find((item) => item.name === fieldName);
  if (!field) throw new EtHttpError(404, `Field '${fieldName}' was not found.`);
  if (field.name === "id") {
    throw new EtHttpError(403, "The primary key field cannot be changed.");
  }

  const nextType = patch.type && CMS_FIELD_TYPES.includes(patch.type) ? patch.type : field.type;
  const nextUnique = patch.unique ?? field.unique;
  const apply = sqlite().transaction(() => {
    if (nextUnique && !field.unique) create_unique_index(collectionName, field.name);
    if (!nextUnique && field.unique) drop_unique_index(collectionName, field.name);
    sqlite()
      .prepare(
        `UPDATE cms_fields
         SET label = ?, type = ?, interface = ?, options = ?, required = ?, "unique" = ?, hidden = ?, readonly = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        patch.label ?? field.label,
        nextType,
        patch.interface ?? (patch.type ? cms_field_interface(nextType) : field.interface),
        JSON.stringify(patch.options ?? field.options),
        (patch.required ?? field.required) ? 1 : 0,
        nextUnique ? 1 : 0,
        (patch.hidden ?? field.hidden) ? 1 : 0,
        (patch.readonly ?? field.readonly) ? 1 : 0,
        nowSeconds(),
        field.id
      );
    return fieldFromRow(
      sqlite().prepare("SELECT * FROM cms_fields WHERE id = ?").get(field.id) as Row
    );
  });
  try {
    return apply();
  } catch (error) {
    if (error instanceof EtHttpError) throw error;
    throw new EtHttpError(
      409,
      `The field '${field.name}' could not be updated. ${
        error instanceof Error ? error.message : ""
      }`.trim()
    );
  }
}

export function delete_field(collectionName: string, fieldName: string): void {
  const { collection, fields } = require_collection(collectionName);
  if (collection.system) {
    throw new EtHttpError(403, "System collections cannot be changed.");
  }
  const field = fields.find((item) => item.name === fieldName);
  if (!field) throw new EtHttpError(404, `Field '${fieldName}' was not found.`);
  if (field.name === "id") {
    throw new EtHttpError(403, "The primary key field cannot be deleted.");
  }
  const apply = sqlite().transaction(() => {
    drop_unique_index(collectionName, field.name);
    sqlite().exec(
      `ALTER TABLE ${quote_identifier(collectionName)} DROP COLUMN ${quote_identifier(field.name)}`
    );
    sqlite().prepare("DELETE FROM cms_fields WHERE id = ?").run(field.id);
    remove_field_from_policies(collectionName, field.name);
  });
  try {
    apply();
  } catch (error) {
    throw new EtHttpError(
      409,
      `The database could not drop '${field.name}'. It may be used by an index or trigger. ${
        error instanceof Error ? error.message : ""
      }`.trim()
    );
  }
}

function normalize_field(input: CmsFieldInput): Required<CmsFieldInput> {
  const type = input.type && CMS_FIELD_TYPES.includes(input.type) ? input.type : "string";
  return {
    name: String(input.name ?? "").trim(),
    label: String(input.label ?? humanize_name(String(input.name ?? ""))),
    type,
    interface: input.interface ?? cms_field_interface(type),
    options: input.options ?? {},
    required: Boolean(input.required),
    unique: Boolean(input.unique),
    hidden: Boolean(input.hidden),
    readonly: Boolean(input.readonly),
  };
}

function visible_fields(fields: CmsField[], includeHidden = true): CmsField[] {
  return includeHidden ? fields : fields.filter((field) => !field.hidden);
}

function order_field(
  fields: CmsField[],
  sort?: string,
  primaryKey = "id"
): CmsField {
  const requested = sort ? fields.find((field) => field.name === sort) : undefined;
  if (requested) return requested;
  return (
    fields.find((field) => field.name === primaryKey) ??
    fields.find((field) => field.name === "id") ??
    fields[0]
  );
}

function build_filter_clauses(
  fields: CmsField[],
  filter: Record<string, unknown>,
  byName: Map<string, CmsField>
): { clauses: string[]; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  for (const [key, value] of Object.entries(filter)) {
    if (key === "_and" || key === "_or") {
      if (!Array.isArray(value)) {
        throw new EtHttpError(400, `Filter '${key}' must be an array.`);
      }
      const groups = value
        .filter((entry): entry is Record<string, unknown> =>
          Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
        )
        .map((entry) => build_filter_clauses(fields, entry, byName));
      if (groups.length === 0) {
        if (key === "_or") clauses.push("1 = 0");
        continue;
      }
      const joined = groups
        .map((group) =>
          group.clauses.length > 0 ? `(${group.clauses.join(" AND ")})` : "1 = 1"
        )
        .join(key === "_and" ? " AND " : " OR ");
      clauses.push(`(${joined})`);
      for (const group of groups) params.push(...group.params);
      continue;
    }

    const field = byName.get(key);
    if (!field) {
      throw new EtHttpError(400, `Unknown filter field '${key}'.`);
    }
    const column = quote_identifier(field.name);

    if (value === null) {
      clauses.push(`${column} IS NULL`);
      continue;
    }
    if (typeof value === "object" && !Array.isArray(value)) {
      for (const [operator, operand] of Object.entries(value as Record<string, unknown>)) {
        switch (operator) {
          case "_eq":
            if (operand === null) {
              clauses.push(`${column} IS NULL`);
            } else {
              clauses.push(`${column} = ?`);
              params.push(operand);
            }
            break;
          case "_neq":
            if (operand === null) {
              clauses.push(`${column} IS NOT NULL`);
            } else {
              clauses.push(`(${column} IS NULL OR ${column} != ?)`);
              params.push(operand);
            }
            break;
          case "_contains":
            clauses.push(`${column} LIKE ?`);
            params.push(`%${String(operand)}%`);
            break;
          case "_not_contains":
            clauses.push(`(${column} IS NULL OR ${column} NOT LIKE ?)`);
            params.push(`%${String(operand)}%`);
            break;
          case "_starts_with":
            clauses.push(`${column} LIKE ?`);
            params.push(`${String(operand)}%`);
            break;
          case "_ends_with":
            clauses.push(`${column} LIKE ?`);
            params.push(`%${String(operand)}`);
            break;
          case "_gt":
            clauses.push(`${column} > ?`);
            params.push(operand);
            break;
          case "_gte":
            clauses.push(`${column} >= ?`);
            params.push(operand);
            break;
          case "_lt":
            clauses.push(`${column} < ?`);
            params.push(operand);
            break;
          case "_lte":
            clauses.push(`${column} <= ?`);
            params.push(operand);
            break;
          case "_null":
            clauses.push(operand ? `${column} IS NULL` : `${column} IS NOT NULL`);
            break;
          case "_in": {
            const values = Array.isArray(operand) ? operand : [operand];
            if (values.length === 0) {
              clauses.push("1 = 0");
              break;
            }
            const nonNull = values.filter((value) => value !== null);
            const parts: string[] = [];
            if (nonNull.length !== values.length) parts.push(`${column} IS NULL`);
            if (nonNull.length > 0) {
              parts.push(`${column} IN (${nonNull.map(() => "?").join(", ")})`);
              params.push(...nonNull);
            }
            clauses.push(parts.length === 1 ? parts[0] : `(${parts.join(" OR ")})`);
            break;
          }
          default:
            throw new EtHttpError(400, `Unsupported filter operator '${operator}'.`);
        }
      }
      continue;
    }
    if (Array.isArray(value)) {
      throw new EtHttpError(400, `Use the _in operator for array values on '${key}'.`);
    }
    clauses.push(`${column} = ?`);
    params.push(value);
  }

  return { clauses, params };
}

function build_where(
  fields: CmsField[],
  search: string | undefined,
  filter: Record<string, unknown> | undefined
): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const byName = new Map(fields.map((field) => [field.name, field]));

  if (search && search.trim() !== "") {
    const textFields = fields.filter(
      (field) => !field.hidden && (field.type === "string" || field.type === "text" || field.type === "select")
    );
    if (textFields.length > 0) {
      clauses.push(
        `(${textFields
          .map((field) => `${quote_identifier(field.name)} LIKE ?`)
          .join(" OR ")})`
      );
      for (let index = 0; index < textFields.length; index += 1) {
        params.push(`%${search.trim()}%`);
      }
    }
  }

  if (filter && typeof filter === "object") {
    const built = build_filter_clauses(fields, filter, byName);
    clauses.push(...built.clauses);
    params.push(...built.params);
  }

  return {
    sql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

export function list_records(
  collectionName: string,
  options: CmsRecordListOptions = {}
): CmsRecordListResult {
  const { collection, fields } = require_collection(collectionName);
  const page = Math.max(1, Number(options.page ?? 1) || 1);
  const configuredMax = Math.min(
    500,
    Math.max(1, Number(get_runtime_config().cms.max_page_size) || MAX_LIMIT)
  );
  const limit = Math.min(
    configuredMax,
    Math.max(1, Number(options.limit ?? DEFAULT_LIMIT) || DEFAULT_LIMIT)
  );
  const order = order_field(fields, options.sort, collection.primary_key);
  const direction = String(options.direction ?? "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
  const filter = options.access_filter
    ? options.filter
      ? { _and: [options.filter, options.access_filter] }
      : options.access_filter
    : options.filter;
  const where = build_where(fields, options.search, filter);
  const offset = (page - 1) * limit;

  const totalRow = sqlite()
    .prepare(
      `SELECT COUNT(*) AS count FROM ${quote_identifier(collectionName)} ${where.sql}`
    )
    .get(...where.params) as { count: number };
  const total = Number(totalRow.count);

  const rows = sqlite()
    .prepare(
      `SELECT * FROM ${quote_identifier(collectionName)}
       ${where.sql}
       ORDER BY ${quote_identifier(order.name)} ${direction}
       LIMIT ? OFFSET ?`
    )
    .all(...where.params, limit, offset) as Row[];

  return {
    rows: rows.map(sanitize_row),
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}

export function get_record(
  collectionName: string,
  id: string | number
): Record<string, unknown> {
  const { collection } = require_collection(collectionName);
  const row = sqlite()
    .prepare(
      `SELECT * FROM ${quote_identifier(collectionName)} WHERE ${quote_identifier(
        collection.primary_key
      )} = ? LIMIT 1`
    )
    .get(id) as Row | undefined;
  if (!row) throw new EtHttpError(404, "Record not found.");
  return sanitize_row(row);
}

export function create_record(
  collectionName: string,
  input: Record<string, unknown>
): Record<string, unknown> {
  const { collection, fields } = require_collection(collectionName);
  const values = prepare_write_values(fields, input, false, collection.primary_key);
  const columns = Object.keys(values);
  const sql =
    columns.length === 0
      ? `INSERT INTO ${quote_identifier(collectionName)} DEFAULT VALUES`
      : `INSERT INTO ${quote_identifier(collectionName)}
        (${columns.map(quote_identifier).join(", ")})
        VALUES (${columns.map(() => "?").join(", ")})`;
  try {
    const row = sqlite()
      .prepare(`${sql} RETURNING *`)
      .get(...columns.map((column) => values[column])) as Row | undefined;
    if (!row) {
      throw new EtHttpError(500, "The record was created but could not be read back.");
    }
    return sanitize_row(row);
  } catch (error) {
    throw database_error(error);
  }
}

export function update_record(
  collectionName: string,
  id: string | number,
  input: Record<string, unknown>
): Record<string, unknown> {
  const { collection, fields } = require_collection(collectionName);
  const values = prepare_write_values(fields, input, true, collection.primary_key);
  if (Object.keys(values).length === 0) {
    return get_record(collectionName, id);
  }
  if (fields.some((field) => field.name === "updated_at")) {
    values.updated_at = new Date().toISOString();
  }
  const columns = Object.keys(values);
  const sql = `UPDATE ${quote_identifier(collectionName)}
    SET ${columns.map((column) => `${quote_identifier(column)} = ?`).join(", ")}
    WHERE ${quote_identifier(collection.primary_key)} = ?`;
  try {
    const result = sqlite()
      .prepare(sql)
      .run(...columns.map((column) => values[column]), id);
    if (result.changes === 0) {
      throw new EtHttpError(404, "Record not found.");
    }
    return get_record(collectionName, id);
  } catch (error) {
    throw database_error(error);
  }
}

function database_error(error: unknown): EtHttpError {
  if (error instanceof EtHttpError) return error;
  const message = error instanceof Error ? error.message : "";
  if (/UNIQUE constraint failed/i.test(message)) {
    return new EtHttpError(409, "A record with that unique value already exists.");
  }
  if (/NOT NULL constraint failed/i.test(message)) {
    return new EtHttpError(422, "A required field is missing.");
  }
  if (/FOREIGN KEY constraint failed/i.test(message)) {
    return new EtHttpError(409, "This record is still referenced by another record.");
  }
  return new EtHttpError(
    500,
    message ? `The database rejected the record: ${message}` : "The record could not be saved."
  );
}

export function delete_record(collectionName: string, id: string | number): void {
  const { collection } = require_collection(collectionName);
  const result = sqlite()
    .prepare(
      `DELETE FROM ${quote_identifier(collectionName)}
       WHERE ${quote_identifier(collection.primary_key)} = ?`
    )
    .run(id);
  if (result.changes === 0) {
    throw new EtHttpError(404, "Record not found.");
  }
}

function prepare_write_values(
  fields: CmsField[],
  input: Record<string, unknown>,
  updating: boolean,
  primaryKey = "id"
): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new EtHttpError(400, "A JSON object is required.");
  }
  const byName = new Map(fields.map((field) => [field.name, field]));
  const values: Record<string, unknown> = {};

  for (const [key, raw] of Object.entries(input)) {
    const field = byName.get(key);
    if (!field) {
      throw new EtHttpError(400, `Unknown field '${key}'.`);
    }
    if (field.readonly || (updating && field.name === primaryKey)) {
      if (!updating && field.readonly && raw !== undefined) {
        throw new EtHttpError(400, `Field '${key}' is read-only.`);
      }
      continue;
    }
    if (raw === undefined) continue;
    if (raw === null || raw === "") {
      if (raw === "" && !updating && !field.required) continue;
      if (field.required && !updating) {
        throw new EtHttpError(422, `Field '${field.label || field.name}' is required.`);
      }
      values[field.name] = null;
      continue;
    }
    values[field.name] = coerce_value(field, raw);
  }

  if (!updating) {
    for (const field of fields) {
      if (field.readonly || !field.required) continue;
      if (values[field.name] === undefined || values[field.name] === null) {
        throw new EtHttpError(422, `Field '${field.label || field.name}' is required.`);
      }
    }
  }

  return values;
}

function coerce_value(field: CmsField, raw: unknown): unknown {
  switch (field.type) {
    case "integer":
    case "relation": {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        throw new EtHttpError(422, `Field '${field.label || field.name}' must be an integer.`);
      }
      return Math.trunc(parsed);
    }
    case "decimal": {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        throw new EtHttpError(422, `Field '${field.label || field.name}' must be a number.`);
      }
      return parsed;
    }
    case "boolean":
      return bool(raw) ? 1 : 0;
    case "json":
      return typeof raw === "string" ? raw : JSON.stringify(raw);
    case "datetime":
      return typeof raw === "string" ? raw : new Date(String(raw)).toISOString();
    default:
      return String(raw);
  }
}

function sanitize_row(row: Row): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === "bigint") result[key] = value.toString();
    else if (Buffer.isBuffer(value)) result[key] = `0x${value.toString("hex")}`;
    else result[key] = value ?? null;
  }
  return result;
}

export function format_record_for_api(
  row: Record<string, unknown>,
  fields: CmsField[]
): Record<string, unknown> {
  const byName = new Map(fields.map((field) => [field.name, field]));
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const field = byName.get(key);
    if (!field) {
      result[key] = value;
      continue;
    }
    if (field.type === "json" && typeof value === "string" && value !== "") {
      try {
        result[key] = JSON.parse(value) as unknown;
        continue;
      } catch {
        // Keep malformed JSON visible instead of hiding it.
      }
    }
    result[key] = field.type === "boolean" ? bool(value) : value;
  }
  return result;
}

export function collection_fields(collectionName: string): CmsField[] {
  return require_collection(collectionName).fields;
}

export function collection_exists(name: string): boolean {
  ensure_cms_schema();
  return collection_row(name) !== undefined;
}

export function create_starter_collection(): CmsCollectionWithFields {
  if (collection_exists("posts")) {
    return get_collection("posts");
  }
  return create_collection({
    name: "posts",
    label: "Posts",
    icon: "file-text",
    note: "A starter collection for articles, notes or announcements.",
    fields: [
      { name: "title", label: "Title", type: "string", required: true },
      { name: "slug", label: "Slug", type: "string", unique: true },
      { name: "excerpt", label: "Excerpt", type: "text" },
      { name: "body", label: "Body", type: "text" },
      {
        name: "status",
        label: "Status",
        type: "select",
        options: { choices: ["draft", "published", "archived"], default: "draft" },
      },
      { name: "published_at", label: "Published At", type: "datetime" },
      { name: "cover_image", label: "Cover Image", type: "image" },
      { name: "featured", label: "Featured", type: "boolean" },
    ],
  });
}

export function collection_slug(name: string): string {
  return make_slug(name);
}

export function collection_display_name(name: string): string {
  return humanize_name(name);
}

export { DEFAULT_LIMIT, MAX_LIMIT, visible_fields };
