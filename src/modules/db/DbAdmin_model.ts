import { escapeIdentifier, sqlite, type Row } from "@/engine/db";

export type { Row };
import { Model } from "@/engine/model";
import { post } from "@/engine/post";

/**
 * Db admin model — the data layer of the port's admin database tool.
 *
 * The PHP original (modules/db/Db.php) is the framework's *database engine*
 * class; it is ported as `src/engine/db.ts`. This module is the admin tool the
 * port exposes over that engine: table list, record browser, "forger" (record
 * editor) and a SQL console.
 *
 * The engine already performs every MySQL → SQLite dialect adaptation this
 * tool relies upon:
 *   SHOW TABLES                 → sqlite_master            (Db::get_tables)
 *   SHOW TABLES LIKE :t         → sqlite_master lookup     (Db::table_exists)
 *   DESCRIBE `t`                → PRAGMA table_info(`t`)   (Db::describe_table)
 *   TRUNCATE TABLE `t`          → DELETE FROM `t` plus a
 *                                 sqlite_sequence reset    (Db::attempt_truncate)
 *   ALTER TABLE ... AUTO_INCREMENT → sqlite_sequence reset (Db::attempt_truncate)
 *
 * Behavioural note (reported to the orchestrator): PHP's attempt_truncate()
 * only truncates a table when it contains no rows; the ported engine drops the
 * row-count guard and always deletes. The admin tool therefore exposes it as
 * an explicit, confirmation-guarded "Truncate" action.
 */

/** Identifier guard — identical to the engine's table/column validation. */
const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** SQLite type affinity (https://sqlite.org/datatype3.html#affinity). */
export type ColumnAffinity = "integer" | "real" | "numeric" | "text" | "blob";

export interface ColumnInfo {
  name: string;
  type: string;
  affinity: ColumnAffinity;
  nullable: boolean;
  is_primary_key: boolean;
  auto_increment: boolean;
  has_default: boolean;
  default_value: string | null;
}

export interface FormField {
  name: string;
  label: string;
  type: string;
  affinity: ColumnAffinity;
  input_type: "text" | "number" | "textarea";
  step: string;
  value: string;
  placeholder: string;
  required: boolean;
  nullable: boolean;
  has_default: boolean;
  is_primary_key: boolean;
  auto_increment: boolean;
  /** false → rendered read-only and never submitted (primary keys). */
  submit: boolean;
}

export interface TableSummary {
  name: string;
  num_rows: number;
  num_columns: number;
  primary_key: string;
}

export interface SqlResult {
  ok: boolean;
  message: string;
  columns: string[];
  rows: Row[];
  affected_rows: number;
  last_insert_id: number;
  statement: string;
}

/** Column names that usually hold long, multi-line content. */
const MULTILINE_HINT = /(description|content|body|notes?|message|summary|address|json|html|css|sql)/i;

export class DbAdminModel extends Model {
  // -------------------------------------------------------------------------
  // Schema introspection
  // -------------------------------------------------------------------------

  /** Table list with row/column counts and the primary key column name. */
  get_tables_with_counts(): TableSummary[] {
    return this.db.get_tables().map((name) => {
      const columns = this.describe_columns(name);
      return {
        name,
        num_rows: this.db.count(name),
        num_columns: columns.length,
        primary_key: columns.find((column) => column.is_primary_key)?.name ?? "",
      };
    });
  }

  /** True when `table` is a valid identifier for an existing table. */
  table_exists(table: string): boolean {
    return IDENTIFIER.test(table) && this.db.table_exists(table);
  }

  /** Normalized column metadata (port of the engine's describe_table()). */
  describe_columns(table: string): ColumnInfo[] {
    if (!this.table_exists(table)) return [];

    const rows = this.db.describe_table(table);
    if (rows === false) return [];

    return (rows as Row[]).map((row) => this.to_column_info(row));
  }

  private to_column_info(row: Row): ColumnInfo {
    const type = String(row.type ?? "");
    const affinity = sqlite_affinity(type);
    const is_primary_key = String(row.key ?? "") === "PRI";
    const default_value =
      row.default === undefined || row.default === null ? null : String(row.default);

    return {
      name: String(row.name ?? ""),
      type,
      affinity,
      nullable: row["null"] === true,
      is_primary_key,
      // In SQLite an INTEGER PRIMARY KEY is the rowid alias (auto-assigned).
      auto_increment: is_primary_key && affinity === "integer",
      has_default: default_value !== null,
      default_value,
    };
  }

  // -------------------------------------------------------------------------
  // Record browser
  // -------------------------------------------------------------------------

  count_rows(table: string): number {
    this.validate_table(table);
    return this.db.count(table);
  }

  /** Order-by column for browsing: the primary key when one exists. */
  default_order_by(columns: ColumnInfo[]): string {
    const primary_key = columns.find((column) => column.is_primary_key);
    if (primary_key) return primary_key.name;
    return columns.length > 0 ? columns[0].name : "rowid";
  }

  /** One page of records. `LIMIT/OFFSET` — the SQLite stand-in for the
   * MySQL `LIMIT n OFFSET m` used by the PHP-era browser. */
  get_page_rows(
    table: string,
    order_by: string,
    order_direction: string,
    limit: number,
    offset: number
  ): Row[] {
    this.validate_table(table);
    this.validate_identifier(order_by, "column");

    const direction = order_direction.toUpperCase() === "DESC" ? "DESC" : "ASC";
    const sql =
      `SELECT * FROM ${escapeIdentifier(table)}` +
      ` ORDER BY ${escapeIdentifier(order_by)} ${direction}` +
      ` LIMIT @limit OFFSET @offset`;

    const rows = this.db.query_bind(sql, {
      limit: Math.max(0, limit),
      offset: Math.max(0, offset),
    }) as Row[];

    return to_display_rows(rows);
  }

  /** A single record (display-safe values), or false when missing. */
  get_record(table: string, id: number): Row | false {
    this.validate_table(table);
    const row = this.db.get_where(id, table);
    if (row === false) return false;
    return to_display_rows([row])[0] ?? false;
  }

  // -------------------------------------------------------------------------
  // The forger (record editor)
  // -------------------------------------------------------------------------

  /**
   * Build the dynamic form fields for a table. Auto-increment primary keys are
   * omitted (SQLite assigns them); a non-auto primary key is shown read-only.
   */
  build_form_fields(columns: ColumnInfo[], record: Row | false = false): FormField[] {
    return columns
      .filter((column) => !column.auto_increment)
      .map((column) => {
        const value = record === false ? "" : input_value(record[column.name]);
        const numeric =
          column.affinity === "integer" ||
          column.affinity === "real" ||
          column.affinity === "numeric";
        const input_type: FormField["input_type"] = column.is_primary_key
          ? "text"
          : numeric
            ? "number"
            : prefers_textarea(column, value)
              ? "textarea"
              : "text";
        const label = format_label(column.name);

        return {
          name: column.name,
          label,
          type: column.type,
          affinity: column.affinity,
          input_type,
          step: column.affinity === "integer" ? "1" : numeric ? "any" : "",
          value,
          placeholder: `Enter ${label.toLowerCase()}`,
          required: !column.nullable && !column.has_default,
          nullable: column.nullable,
          has_default: column.has_default,
          is_primary_key: column.is_primary_key,
          auto_increment: column.auto_increment,
          submit: !column.is_primary_key,
        };
      });
  }

  /** Raw posted values keyed by column name (used to re-render after errors). */
  posted_record(columns: ColumnInfo[]): Row {
    const data: Row = {};
    for (const column of columns) {
      if (column.auto_increment) continue;
      const raw = post(column.name);
      data[column.name] = raw === null || raw === undefined ? "" : String(raw);
    }
    return data;
  }

  /**
   * Convert posted form values into database-ready values.
   *
   * Empty values: NULL for nullable columns; skipped when the column has a
   * DEFAULT (SQLite then applies it on INSERT, and on UPDATE the existing
   * value is kept); '' / 0 as a last resort for NOT NULL columns.
   */
  collect_posted_data(fields: FormField[]): Row {
    const data: Row = {};

    for (const field of fields) {
      if (!field.submit) continue;

      const raw = post(field.name);
      const value =
        field.input_type === "textarea"
          ? String(raw ?? "")
          : String(raw ?? "").trim();

      if (value === "") {
        if (field.nullable) {
          data[field.name] = null;
        } else if (!field.has_default) {
          data[field.name] = is_numeric_affinity(field.affinity) ? 0 : "";
        }
        continue;
      }

      if (field.affinity === "integer") {
        const parsed = Number(value);
        data[field.name] = Number.isFinite(parsed) ? Math.trunc(parsed) : value;
      } else if (field.affinity === "real" || field.affinity === "numeric") {
        const parsed = Number(value);
        // Numeric-affinity columns can legitimately hold non-numbers
        // (BOOLEAN / DATE / DATETIME declared types), so keep the raw string.
        data[field.name] = Number.isFinite(parsed) ? parsed : value;
      } else {
        data[field.name] = value;
      }
    }

    return data;
  }

  insert_record(table: string, data: Row): number {
    this.validate_table(table);
    return this.db.insert(data, table);
  }

  /** INSERT INTO `t` DEFAULT VALUES — tables whose only column is the rowid. */
  insert_empty_row(table: string): number {
    this.validate_table(table);
    const result = this.db.query_bind(
      `INSERT INTO ${escapeIdentifier(table)} DEFAULT VALUES`,
      []
    ) as { lastInsertId?: number } | true;
    return typeof result === "object" && result !== null && "lastInsertId" in result
      ? Number(result.lastInsertId ?? 0)
      : 0;
  }

  update_record(table: string, id: number, data: Row): boolean {
    this.validate_table(table);
    return this.db.update(id, data, table);
  }

  delete_record(table: string, id: number): boolean {
    this.validate_table(table);
    return this.db.delete(id, table);
  }

  /** Port engine: DELETE FROM + sqlite_sequence reset (TRUNCATE stand-in). */
  truncate_table(table: string): boolean {
    this.validate_table(table);
    return this.db.attempt_truncate(table);
  }

  /** Renumber the `id` column starting at 1 (port of Db::resequence_ids()). */
  resequence_ids(table: string): boolean {
    this.validate_table(table);
    return this.db.resequence_ids(table);
  }

  // -------------------------------------------------------------------------
  // SQL console
  // -------------------------------------------------------------------------

  run_sql(sql: string): SqlResult {
    const statement = sql.trim();
    const empty: SqlResult = {
      ok: false,
      message: "",
      columns: [],
      rows: [],
      affected_rows: 0,
      last_insert_id: 0,
      statement,
    };

    if (statement === "") {
      return { ...empty, message: "No SQL statement was submitted." };
    }

    try {
      const result = this.db.query_bind(statement, [], "array");

      if (Array.isArray(result)) {
        const rows = to_display_rows(result as Row[]);
        return {
          ...empty,
          ok: true,
          message: `Query returned ${rows.length} row(s).`,
          columns: rows.length > 0 ? Object.keys(rows[0]) : this.column_names(statement),
          rows,
          affected_rows: rows.length,
        };
      }

      if (result === true) {
        return { ...empty, ok: true, message: "SQL script executed." };
      }

      const details = result as { affectedRows?: number; lastInsertId?: number };
      const affected = Number(details?.affectedRows ?? 0);
      return {
        ...empty,
        ok: true,
        message: `${affected} row(s) affected.`,
        affected_rows: affected,
        last_insert_id: Number(details?.lastInsertId ?? 0),
      };
    } catch (error) {
      return {
        ...empty,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** Column names for an empty result set (better-sqlite3 stmt.columns()). */
  private column_names(sql: string): string[] {
    try {
      return sqlite()
        .prepare(sql)
        .columns()
        .map((column) => column.name);
    } catch {
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private validate_table(table: string): void {
    this.validate_identifier(table, "table name");
  }

  private validate_identifier(value: string, label: string): void {
    if (!IDENTIFIER.test(value)) {
      throw new Error(`Invalid ${label}: '${value}'`);
    }
  }
}

/** SQLite type affinity — mirrors the rules from the SQLite documentation. */
function sqlite_affinity(declared_type: string): ColumnAffinity {
  const type = declared_type.toUpperCase();
  if (type.includes("INT")) return "integer";
  if (type.includes("CHAR") || type.includes("CLOB") || type.includes("TEXT")) return "text";
  if (type.includes("BLOB") || type === "") return "blob";
  if (type.includes("REAL") || type.includes("FLOA") || type.includes("DOUB")) return "real";
  return "numeric";
}

function is_numeric_affinity(affinity: ColumnAffinity): boolean {
  return affinity === "integer" || affinity === "real" || affinity === "numeric";
}

/** column_name → "Column Name" (labels used by validation messages). */
function format_label(name: string): string {
  return name
    .split("_")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function prefers_textarea(column: ColumnInfo, value: string): boolean {
  if (column.affinity !== "text") return false;
  if (MULTILINE_HINT.test(column.name)) return true;
  return value.length > 120 || value.includes("\n");
}

/** Value → form input string (NULL becomes ''). */
function input_value(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value)) return value.toString("hex");
  return String(value);
}

/**
 * Make database rows safe for React rendering and JSON responses: SQLite
 * BLOBs arrive as Buffers (rendered as 0x… hex) and integers can exceed the
 * safe JS range (rendered as strings).
 */
export function to_display_rows(rows: Row[]): Row[] {
  return rows.map((row) => {
    const mapped: Row = {};
    for (const [key, value] of Object.entries(row)) {
      mapped[key] = to_display_value(value);
    }
    return mapped;
  });
}

function to_display_value(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value)) return `0x${value.toString("hex")}`;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return value;
}
