import Database from "better-sqlite3";
import * as fs from "node:fs";
import { DB_FILE } from "./paths";

/**
 * Db â€” the port of modules/db/Db.php over SQLite (better-sqlite3).
 *
 * The API deliberately mirrors the PHP class so ported module code reads
 * almost identically:
 *
 *   const rows  = db.get("id", "eterc_user_levels");          // ordered rows
 *   const row   = db.get_where(15, "users");                     // row by id | false
 *   const one   = db.get_one_where("email", "a@b.c", "users");   // row by column | false
 *   const id    = db.insert({ name: "Demo" }, "demo_table");     // last insert id
 *   db.update(id, { name: "New" }, "demo_table");
 *   db.delete(id, "demo_table");
 */

let _sqlite: Database.Database | null = null;

function openSqlite(): Database.Database {
  if (!fs.existsSync(DB_FILE)) {
    fs.mkdirSync(DB_FILE.replace(/[\\/][^\\/]+$/, ""), { recursive: true });
  }
  const connection = new Database(DB_FILE);
  connection.pragma("journal_mode = WAL");
  connection.pragma("foreign_keys = ON");
  return connection;
}

/** Raw shared SQLite connection (framework internals). */
export function sqlite(): Database.Database {
  const g = globalThis as unknown as { __etSqlite?: Database.Database };
  if (!g.__etSqlite) {
    g.__etSqlite = openSqlite();
  }
  _sqlite = g.__etSqlite;
  return _sqlite;
}

const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export type Row = Record<string, unknown>;
export type ReturnType = "object" | "array" | null;

function toRows(rows: unknown[]): Row[] {
  return rows as Row[];
}

export class Db {
  /** Module that created this Db instance (mirrors PHP constructor). */
  readonly moduleName: string | null;
  readonly dbGroup: string | null;

  constructor(moduleName: string | null = null, dbGroup: string | null = null) {
    this.moduleName = moduleName;
    this.dbGroup = dbGroup;
  }

  private validateTableName(table: string): void {
    if (!IDENTIFIER.test(table)) {
      throw new Error(`Invalid table name: '${table}'`);
    }
  }

  private validateColumnName(column: string): void {
    if (!IDENTIFIER.test(column)) {
      throw new Error(`Invalid column name: '${column}'`);
    }
  }

  validate_table_exists(table: string): void {
    if (!this.table_exists(table)) {
      throw new Error(`Table does not exist: '${table}'`);
    }
  }

  // -------------------------------------------------------------------------
  // Write operations
  // -------------------------------------------------------------------------

  insert(data: Row, table: string): number {
    this.validateTableName(table);
    const columns = Object.keys(data);
    if (columns.length === 0) {
      throw new Error(`Cannot insert into '${table}': no data supplied`);
    }
    columns.forEach((c) => this.validateColumnName(c));

    const columnList = columns.map((c) => `\`${c}\``).join(", ");
    const placeholderList = columns.map((c) => `@${c}`).join(", ");
    const sql = `INSERT INTO \`${table}\` (${columnList}) VALUES (${placeholderList})`;

    const result = sqlite().prepare(sql).run(data);
    return Number(result.lastInsertRowid);
  }

  update(id: number, data: Row, table: string): boolean {
    this.validateTableName(table);
    const columns = Object.keys(data);
    if (columns.length === 0) return false;
    columns.forEach((c) => this.validateColumnName(c));

    const setList = columns.map((c) => `\`${c}\` = @${c}`).join(", ");
    const sql = `UPDATE \`${table}\` SET ${setList} WHERE id = @__id`;
    const result = sqlite()
      .prepare(sql)
      .run({ ...data, __id: id });
    return result.changes > 0;
  }

  /** UPDATE ... WHERE â€” convenience used by modules (update_where in the wild). */
  update_where(table: string, data: Row, column: string, value: unknown): boolean {
    this.validateTableName(table);
    this.validateColumnName(column);
    const columns = Object.keys(data);
    if (columns.length === 0) return false;
    columns.forEach((c) => this.validateColumnName(c));

    const setList = columns.map((c) => `\`${c}\` = @${c}`).join(", ");
    const sql = `UPDATE \`${table}\` SET ${setList} WHERE \`${column}\` = @__value`;
    const result = sqlite()
      .prepare(sql)
      .run({ ...data, __value: value });
    return result.changes > 0;
  }

  delete(id: number, table: string): boolean {
    this.validateTableName(table);
    const sql = `DELETE FROM \`${table}\` WHERE id = @id`;
    const result = sqlite().prepare(sql).run({ id });
    return result.changes > 0;
  }

  /** DELETE ... WHERE â€” convenience used by modules. */
  delete_where(table: string, column: string, value: unknown): boolean {
    this.validateTableName(table);
    this.validateColumnName(column);
    const sql = `DELETE FROM \`${table}\` WHERE \`${column}\` = @value`;
    const result = sqlite().prepare(sql).run({ value: value as never });
    return result.changes > 0;
  }

  insert_batch(records: Row[], table: string): number {
    this.validateTableName(table);
    if (records.length === 0) return 0;

    const columns = Object.keys(records[0]);
    columns.forEach((c) => this.validateColumnName(c));
    const columnList = columns.map((c) => `\`${c}\``).join(", ");
    const placeholderList = columns.map((c) => `@${c}`).join(", ");
    const sql = `INSERT INTO \`${table}\` (${columnList}) VALUES (${placeholderList})`;

    const insertMany = sqlite().transaction((rows: Row[]) => {
      const stmt = sqlite().prepare(sql);
      for (const row of rows) {
        stmt.run(row);
      }
      return rows.length;
    });

    return insertMany(records);
  }

  // -------------------------------------------------------------------------
  // Raw SQL
  // -------------------------------------------------------------------------

  query(sql: string, returnType: ReturnType = null): unknown {
    return this.query_bind(sql, [], returnType);
  }

  query_bind(sql: string, data: Row | unknown[], returnType: ReturnType = null): unknown {
    const connection = sqlite();
    const trimmed = sql.trim().toUpperCase();

    const isSelect =
      trimmed.startsWith("SELECT") ||
      trimmed.startsWith("PRAGMA") ||
      trimmed.startsWith("WITH") ||
      trimmed.startsWith("EXPLAIN");

    if (isSelect) {
      const params = Array.isArray(data) ? data : this.namedParamsObject(data);
      const stmt = connection.prepare(sql);
      const rows =
        params === undefined
          ? stmt.all()
          : Array.isArray(params)
            ? stmt.all(...(params as never[]))
            : stmt.all(params);
      return toRows(rows);
    }

    const params = Array.isArray(data) ? data : this.namedParamsObject(data);
    const stmt = connection.prepare(sql);
    const result =
      params === undefined
        ? stmt.run()
        : Array.isArray(params)
          ? stmt.run(...(params as never[]))
          : stmt.run(params);

    // Multi-statement DDL/scripts (e.g. setup SQL files): fall back to exec.
    if (this.hasMultipleStatements(sql)) {
      connection.exec(sql);
      return true;
    }

    return {
      lastInsertId: Number(result.lastInsertRowid),
      affectedRows: result.changes,
    };
  }

  private namedParamsObject(data: Row | unknown[]): Row | undefined {
    if (Array.isArray(data)) return undefined;
    const keys = Object.keys(data);
    if (keys.length === 0) return undefined;
    // better-sqlite3 accepts named parameters with the @ prefix matched by key order.
    return data;
  }

  private hasMultipleStatements(sql: string): boolean {
    // Crude check â€” statements separated by ";" followed by more SQL.
    const withoutTrailing = sql.trim().replace(/;\s*$/, "");
    return /;\s*\S/.test(withoutTrailing);
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  count(table: string): number {
    this.validateTableName(table);
    const row = sqlite()
      .prepare(`SELECT COUNT(*) AS num FROM \`${table}\``)
      .get() as { num: number };
    return row.num;
  }

  get(
    orderBy: string,
    table: string,
    orderDirection = "ASC",
    returnType: ReturnType = "object"
  ): Row[] {
    this.validateTableName(table);
    this.validateColumnName(orderBy);

    const direction = orderDirection.toUpperCase();
    if (direction !== "ASC" && direction !== "DESC") {
      throw new Error(`Invalid order direction: '${orderDirection}'. Must be 'ASC' or 'DESC'.`);
    }

    const sql = `SELECT * FROM \`${table}\` ORDER BY \`${orderBy}\` ${direction}`;
    const rows = toRows(sqlite().prepare(sql).all());
    return returnType === null && false ? [] : rows;
  }

  get_where(id: number, table: string): Row | false {
    this.validateTableName(table);
    const row = sqlite()
      .prepare(`SELECT * FROM \`${table}\` WHERE id = ?`)
      .get(id) as Row | undefined;
    return row ?? false;
  }

  get_one_where(column: string, value: unknown, table: string): Row | false {
    this.validateTableName(table);
    this.validateColumnName(column);
    const row = sqlite()
      .prepare(`SELECT * FROM \`${table}\` WHERE \`${column}\` = ?`)
      .get(value as never) as Row | undefined;
    return row ?? false;
  }

  get_where_in(
    table: string,
    column: string,
    values: unknown[],
    options: { columns?: string | string[]; return_type?: ReturnType } = {}
  ): Row[] {
    this.validateTableName(table);
    this.validateColumnName(column);
    if (values.length === 0) return [];

    let columnsSql = "*";
    if (options.columns) {
      const cols = Array.isArray(options.columns) ? options.columns : [options.columns];
      cols.forEach((c) => this.validateColumnName(c));
      columnsSql = cols.map((c) => `\`${c}\``).join(", ");
    }

    const placeholders = values.map(() => "?").join(", ");
    const sql = `SELECT ${columnsSql} FROM \`${table}\` WHERE \`${column}\` IN (${placeholders})`;
    return toRows(sqlite().prepare(sql).all(...(values as never[])));
  }

  resequence_ids(tableName: string): boolean {
    this.validateTableName(tableName);
    const connection = sqlite();
    const rows = connection
      .prepare(`SELECT id FROM \`${tableName}\` ORDER BY id ASC`)
      .all() as Array<{ id: number }>;

    const resequence = connection.transaction(() => {
      for (let i = 0; i < rows.length; i++) {
        const target = i + 1;
        if (rows[i].id !== target) {
          connection
            .prepare(`UPDATE \`${tableName}\` SET id = ? WHERE id = ?`)
            .run(target, rows[i].id);
        }
      }
    });

    resequence();
    return true;
  }

  table_exists(table: string): boolean {
    const row = sqlite()
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table) as { name: string } | undefined;
    return row !== undefined;
  }

  get_tables(): string[] {
    const rows = sqlite()
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC"
      )
      .all() as Array<{ name: string }>;
    return rows.map((r) => r.name);
  }

  describe_table(table: string, namesOnly = false): Row[] | boolean {
    if (!this.table_exists(table)) return false;
    const columns = sqlite().prepare(`PRAGMA table_info(\`${table}\`)`).all() as Array<{
      name: string;
      type: string;
      notnull: number;
      dflt_value: unknown;
      pk: number;
    }>;

    if (namesOnly) {
      return columns.map((c) => ({ name: c.name } as Row));
    }

    return columns.map(
      (c) =>
        ({
          name: c.name,
          type: c.type,
          null: c.notnull === 0,
          key: c.pk > 0 ? "PRI" : "",
          default: c.dflt_value,
          extra: c.pk > 0 ? "auto_increment" : "",
        }) as Row
    );
  }

  attempt_truncate(table: string, validateTable = true): boolean {
    this.validateTableName(table);
    if (validateTable && !this.table_exists(table)) return false;
    sqlite().exec(`DELETE FROM \`${table}\``);
    sqlite().exec(
      `DELETE FROM sqlite_sequence WHERE name = '${table.replace(/'/g, "''")}'`
    );
    return true;
  }
}

/** Convenience singleton for engine-level use. */
export const db = new Db(null);

/** Escape helper for identifiers embedded in dynamically built SQL. */
export function escape_identifier(identifier: string): string {
  return "`" + identifier.replace(/`/g, "``") + "`";
}

