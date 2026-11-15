import Database from "better-sqlite3";
import * as fs from "node:fs";
import type {
  DatabaseDialect,
  IDatabaseAdapter,
} from "./contracts/database";
import { DB_FILE } from "./paths";
import { assertLegacySqliteAccess } from "./db/gateway";
import {
  isReadQuery,
  placeholder,
  prepareQuery,
  quoteIdentifier,
} from "./db/sql";

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

/** Raw shared SQLite connection (legacy internals only). */
export function sqlite(): Database.Database {
  assertLegacySqliteAccess();
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

let configuredGateway: IDatabaseAdapter | null = null;

/**
 * Main-process and script entry point for tests or generated adapters.
 * The default adapter is loaded lazily to avoid a module cycle with db.ts.
 */
export function configureDatabaseGateway(adapter: IDatabaseAdapter): void {
  configuredGateway = adapter;
}

async function database(): Promise<IDatabaseAdapter> {
  if (!configuredGateway) {
    const module = await import("./active/db-adapter");
    configuredGateway = module.activeDbAdapter;
  }
  return configuredGateway;
}

function hasMultipleStatements(sql: string): boolean {
  const withoutTrailing = sql.trim().replace(/;\s*$/, "");
  return /;\s*\S/.test(withoutTrailing);
}

function splitStatements(sql: string): string[] {
  return sql
    .split(/;\s*(?=(?:[^'"]|'[^']*'|"[^"]*")*$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

export class Db {
  readonly moduleName: string | null;
  readonly dbGroup: string | null;
  private readonly adapter: IDatabaseAdapter | null;

  constructor(
    moduleName: string | null = null,
    dbGroup: string | null = null,
    adapter: IDatabaseAdapter | null = null,
  ) {
    this.moduleName = moduleName;
    this.dbGroup = dbGroup;
    this.adapter = adapter;
  }

  private async gateway(): Promise<IDatabaseAdapter> {
    return this.adapter ?? database();
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

  async validate_table_exists(table: string): Promise<void> {
    if (!(await this.table_exists(table))) {
      throw new Error(`Table does not exist: '${table}'`);
    }
  }

  // -------------------------------------------------------------------------
  // Write operations
  // -------------------------------------------------------------------------

  async insert(data: Row, table: string): Promise<number> {
    this.validateTableName(table);
    const columns = Object.keys(data);
    if (columns.length === 0) {
      throw new Error(`Cannot insert into '${table}': no data supplied`);
    }
    columns.forEach((column) => this.validateColumnName(column));

    const db = await this.gateway();
    const sql = `INSERT INTO ${quoteIdentifier(db.dialect, table)} (${columns
      .map((column) => quoteIdentifier(db.dialect, column))
      .join(", ")}) VALUES (${columns
      .map((_column, index) => placeholder(db.dialect, index + 1))
      .join(", ")})`;
    const values = columns.map((column) => data[column]);

    if (db.dialect === "postgres") {
      const rows = await db.query<Row>(`${sql} RETURNING *`, values);
      return Number(rows[0]?.id ?? 0);
    }

    const result = await db.execute(sql, values);
    return Number(result.lastInsertRowid ?? 0);
  }

  async update(id: number, data: Row, table: string): Promise<boolean> {
    this.validateTableName(table);
    const columns = Object.keys(data);
    if (columns.length === 0) return false;
    columns.forEach((column) => this.validateColumnName(column));

    const db = await this.gateway();
    const sets = columns
      .map(
        (column, index) =>
          `${quoteIdentifier(db.dialect, column)} = ${placeholder(db.dialect, index + 1)}`,
      )
      .join(", ");
    const sql = `UPDATE ${quoteIdentifier(db.dialect, table)} SET ${sets} WHERE ${quoteIdentifier(
      db.dialect,
      "id",
    )} = ${placeholder(db.dialect, columns.length + 1)}`;
    const result = await db.execute(sql, [
      ...columns.map((column) => data[column]),
      id,
    ]);
    return result.changes > 0;
  }

  async update_where(
    table: string,
    data: Row,
    column: string,
    value: unknown,
  ): Promise<boolean> {
    this.validateTableName(table);
    this.validateColumnName(column);
    const columns = Object.keys(data);
    if (columns.length === 0) return false;
    columns.forEach((entry) => this.validateColumnName(entry));

    const db = await this.gateway();
    const sets = columns
      .map(
        (entry, index) =>
          `${quoteIdentifier(db.dialect, entry)} = ${placeholder(db.dialect, index + 1)}`,
      )
      .join(", ");
    const sql = `UPDATE ${quoteIdentifier(db.dialect, table)} SET ${sets} WHERE ${quoteIdentifier(
      db.dialect,
      column,
    )} = ${placeholder(db.dialect, columns.length + 1)}`;
    const result = await db.execute(sql, [
      ...columns.map((entry) => data[entry]),
      value,
    ]);
    return result.changes > 0;
  }

  async delete(id: number | string, table: string): Promise<boolean> {
    this.validateTableName(table);
    const db = await this.gateway();
    const sql = `DELETE FROM ${quoteIdentifier(db.dialect, table)} WHERE ${quoteIdentifier(
      db.dialect,
      "id",
    )} = ${placeholder(db.dialect, 1)}`;
    const result = await db.execute(sql, [id]);
    return result.changes > 0;
  }

  async delete_where(
    table: string,
    column: string,
    value: unknown,
  ): Promise<boolean> {
    this.validateTableName(table);
    this.validateColumnName(column);
    const db = await this.gateway();
    const sql = `DELETE FROM ${quoteIdentifier(db.dialect, table)} WHERE ${quoteIdentifier(
      db.dialect,
      column,
    )} = ${placeholder(db.dialect, 1)}`;
    const result = await db.execute(sql, [value]);
    return result.changes > 0;
  }

  async insert_batch(records: Row[], table: string): Promise<number> {
    this.validateTableName(table);
    if (records.length === 0) return 0;
    const db = await this.gateway();
    return db.transaction(async (trx) => {
      const scoped = new Db(this.moduleName, this.dbGroup, trx);
      for (const record of records) {
        await scoped.insert(record, table);
      }
      return records.length;
    });
  }

  /** Runs a callback with a transaction-scoped Db facade. */
  async transaction<T>(fn: (db: Db) => Promise<T>): Promise<T> {
    const db = await this.gateway();
    return db.transaction((trx) =>
      fn(new Db(this.moduleName, this.dbGroup, trx)),
    );
  }

  // -------------------------------------------------------------------------
  // Raw SQL
  // -------------------------------------------------------------------------

  async query(sql: string, returnType: ReturnType = null): Promise<unknown> {
    return this.query_bind(sql, [], returnType);
  }

  async query_bind(
    sql: string,
    data: Row | unknown[],
    returnType: ReturnType = null,
  ): Promise<unknown> {
    void returnType;
    const db = await this.gateway();
    const prepared = prepareQuery(sql, data, db.dialect);

    if (hasMultipleStatements(sql)) {
      for (const statement of splitStatements(sql)) {
        await db.execute(statement);
      }
      return true;
    }

    if (isReadQuery(sql)) {
      return db.query<Row>(prepared.sql, prepared.params as never);
    }

    const result = await db.execute(prepared.sql, prepared.params as never);
    return {
      lastInsertId: Number(result.lastInsertRowid ?? 0),
      affectedRows: result.changes,
    };
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async count(table: string): Promise<number> {
    this.validateTableName(table);
    const db = await this.gateway();
    const row = await db.query<{ num: number | string }>(
      `SELECT COUNT(*) AS num FROM ${quoteIdentifier(db.dialect, table)}`,
    );
    return Number(row[0]?.num ?? 0);
  }

  async get(
    orderBy: string,
    table: string,
    orderDirection = "ASC",
    returnType: ReturnType = "object",
  ): Promise<Row[]> {
    this.validateTableName(table);
    this.validateColumnName(orderBy);
    void returnType;

    const direction = orderDirection.toUpperCase();
    if (direction !== "ASC" && direction !== "DESC") {
      throw new Error(
        `Invalid order direction: '${orderDirection}'. Must be 'ASC' or 'DESC'.`,
      );
    }

    const db = await this.gateway();
    const sql = `SELECT * FROM ${quoteIdentifier(db.dialect, table)} ORDER BY ${quoteIdentifier(
      db.dialect,
      orderBy,
    )} ${direction}`;
    return db.query<Row>(sql);
  }

  async get_where(id: number | string, table: string): Promise<Row | false> {
    this.validateTableName(table);
    const db = await this.gateway();
    const rows = await db.query<Row>(
      `SELECT * FROM ${quoteIdentifier(db.dialect, table)} WHERE ${quoteIdentifier(
        db.dialect,
        "id",
      )} = ${placeholder(db.dialect, 1)}`,
      [id],
    );
    return rows[0] ?? false;
  }

  async get_one_where(
    column: string,
    value: unknown,
    table: string,
  ): Promise<Row | false> {
    this.validateTableName(table);
    this.validateColumnName(column);
    const db = await this.gateway();
    const rows = await db.query<Row>(
      `SELECT * FROM ${quoteIdentifier(db.dialect, table)} WHERE ${quoteIdentifier(
        db.dialect,
        column,
      )} = ${placeholder(db.dialect, 1)}`,
      [value],
    );
    return rows[0] ?? false;
  }

  async get_where_in(
    table: string,
    column: string,
    values: unknown[],
    options: { columns?: string | string[]; return_type?: ReturnType } = {},
  ): Promise<Row[]> {
    this.validateTableName(table);
    this.validateColumnName(column);
    if (values.length === 0) return [];

    const db = await this.gateway();
    let columnsSql = "*";
    if (options.columns) {
      const columns = Array.isArray(options.columns)
        ? options.columns
        : [options.columns];
      columns.forEach((entry) => this.validateColumnName(entry));
      columnsSql = columns
        .map((entry) => quoteIdentifier(db.dialect, entry))
        .join(", ");
    }

    const placeholders = values
      .map((_value, index) => placeholder(db.dialect, index + 1))
      .join(", ");
    const sql = `SELECT ${columnsSql} FROM ${quoteIdentifier(
      db.dialect,
      table,
    )} WHERE ${quoteIdentifier(db.dialect, column)} IN (${placeholders})`;
    return db.query<Row>(sql, values);
  }

  async resequence_ids(tableName: string): Promise<boolean> {
    this.validateTableName(tableName);
    const db = await this.gateway();
    if (db.dialect !== "sqlite") {
      throw new Error(
        "Resequencing IDs is only supported for SQLite projects. " +
          "Remote databases should use stable primary keys.",
      );
    }
    const rows = await db.query<{ id: number | string }>(
      `SELECT "id" FROM ${quoteIdentifier(db.dialect, tableName)} ORDER BY "id" ASC`,
    );
    await db.transaction(async (trx) => {
      for (let index = 0; index < rows.length; index += 1) {
        const target = index + 1;
        if (Number(rows[index].id) !== target) {
          await trx.execute(
            `UPDATE ${quoteIdentifier(db.dialect, tableName)} SET "id" = ${placeholder(
              db.dialect,
              1,
            )} WHERE "id" = ${placeholder(db.dialect, 2)}`,
            [target, rows[index].id],
          );
        }
      }
    });
    return true;
  }

  async table_exists(table: string): Promise<boolean> {
    const db = await this.gateway();
    if (db.dialect === "sqlite" || db.dialect === "libsql") {
      const rows = await db.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        [table],
      );
      return rows.length > 0;
    }
    if (db.dialect === "postgres") {
      const rows = await db.query<{ name: string }>(
        "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1",
        [table],
      );
      return rows.length > 0;
    }
    const rows = await db.query<{ name: string }>(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
      [table],
    );
    return rows.length > 0;
  }

  async get_tables(): Promise<string[]> {
    const db = await this.gateway();
    if (db.dialect === "sqlite" || db.dialect === "libsql") {
      const rows = await db.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC",
      );
      return rows.map((row) => row.name);
    }
    if (db.dialect === "postgres") {
      const rows = await db.query<{ name: string }>(
        "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name ASC",
      );
      return rows.map((row) => row.name);
    }
    const rows = await db.query<{ name: string }>(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name ASC",
    );
    return rows.map((row) => row.name);
  }

  async describe_table(
    table: string,
    namesOnly = false,
  ): Promise<Row[] | boolean> {
    if (!(await this.table_exists(table))) return false;
    const db = await this.gateway();

    if (db.dialect === "sqlite" || db.dialect === "libsql") {
      const columns = await db.query<{
        name: string;
        type: string;
        notnull: number;
        dflt_value: unknown;
        pk: number;
      }>(`PRAGMA table_info(${quoteIdentifier(db.dialect, table)})`);
      if (namesOnly) return columns.map((column) => ({ name: column.name }));
      return columns.map(
        (column) =>
          ({
            name: column.name,
            type: column.type,
            null: column.notnull === 0,
            key: column.pk > 0 ? "PRI" : "",
            default: column.dflt_value,
            extra: column.pk > 0 ? "auto_increment" : "",
          }) as Row,
      );
    }

    if (db.dialect === "postgres") {
      const columns = await db.query<{
        name: string;
        type: string;
        nullable: boolean;
        default_value: unknown;
        primary: boolean;
      }>(
        `SELECT a.attname AS name,
                format_type(a.atttypid, a.atttypmod) AS type,
                NOT a.attnotnull AS nullable,
                pg_get_expr(d.adbin, d.adrelid) AS default_value,
                COALESCE(i.indisprimary, false) AS primary
           FROM pg_attribute a
           LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
           LEFT JOIN pg_index i ON i.indrelid = a.attrelid AND a.attnum = ANY(i.indkey) AND i.indisprimary
          WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped
          ORDER BY a.attnum`,
        [table],
      );
      if (namesOnly) return columns.map((column) => ({ name: column.name }));
      return columns.map(
        (column) =>
          ({
            name: column.name,
            type: column.type,
            null: column.nullable,
            key: column.primary ? "PRI" : "",
            default: column.default_value,
            extra: column.primary ? "auto_increment" : "",
          }) as Row,
      );
    }

    const columns = await db.query<{
      name: string;
      type: string;
      nullable: string;
      default_value: unknown;
      column_key: string;
      extra: string;
    }>(
      `SELECT COLUMN_NAME AS name,
              DATA_TYPE AS type,
              IS_NULLABLE AS nullable,
              COLUMN_DEFAULT AS default_value,
              COLUMN_KEY AS column_key,
              EXTRA AS extra
         FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = ?
        ORDER BY ORDINAL_POSITION`,
      [table],
    );
    if (namesOnly) return columns.map((column) => ({ name: column.name }));
    return columns.map(
      (column) =>
        ({
          name: column.name,
          type: column.type,
          null: column.nullable === "YES",
          key: column.column_key === "PRI" ? "PRI" : "",
          default: column.default_value,
          extra: column.extra,
        }) as Row,
    );
  }

  async attempt_truncate(
    table: string,
    validateTable = true,
  ): Promise<boolean> {
    this.validateTableName(table);
    const db = await this.gateway();
    if (validateTable && !(await this.table_exists(table))) return false;

    if (db.dialect === "sqlite" || db.dialect === "libsql") {
      await db.execute(`DELETE FROM ${quoteIdentifier(db.dialect, table)}`);
      try {
        await db.execute("DELETE FROM sqlite_sequence WHERE name = ?", [table]);
      } catch {
        // Tables without AUTOINCREMENT have no sqlite_sequence row.
      }
      return true;
    }

    if (db.dialect === "postgres") {
      await db.execute(
        `TRUNCATE TABLE ${quoteIdentifier(db.dialect, table)} RESTART IDENTITY CASCADE`,
      );
      return true;
    }

    await db.execute(`TRUNCATE TABLE ${quoteIdentifier(db.dialect, table)}`);
    return true;
  }
}

/** Convenience singleton for engine-level use. */
export const db = new Db(null);

/** Escape helper for identifiers embedded in dynamically built SQL. */
export function escape_identifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export type { DatabaseDialect };
