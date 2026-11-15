import mysql, {
  type Pool,
  type PoolConnection,
  type ResultSetHeader,
} from "mysql2/promise";
import type {
  DatabaseDialect,
  DatabaseExecutionResult,
  IDatabaseAdapter,
  Row,
} from "../contracts/database";
import { prepareQuery } from "./sql";

export interface MysqlGatewayOptions {
  connectionString: string;
  maxConnections?: number;
  connectTimeoutMs?: number;
  ssl?: boolean | Record<string, unknown>;
  /** Internal container networks may intentionally run without TLS. */
  allowInsecure?: boolean;
}

function resolveSsl(
  connectionString: string,
  explicit: MysqlGatewayOptions["ssl"] | undefined,
  allowInsecure = false,
): MysqlGatewayOptions["ssl"] {
  if (allowInsecure) return undefined;
  if (explicit !== undefined) return explicit;
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("The MySQL connection string is not valid.");
  }
  const host = url.hostname.toLowerCase();
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (local) return undefined;
  const sslMode = url.searchParams.get("sslmode")?.toLowerCase();
  if (sslMode === "disable" || sslMode === "preferred") {
    throw new Error(
      "Remote MySQL connections require TLS. Use sslmode=required or stronger.",
    );
  }
  return { rejectUnauthorized: true };
}

function positional(
  params: unknown[] | Record<string, unknown> | undefined,
): unknown[] {
  if (params === undefined) return [];
  if (Array.isArray(params)) return params;
  throw new Error(
    "MySQL queries require positional parameters. Named parameters are not supported.",
  );
}

class MysqlTransactionGateway implements IDatabaseAdapter {
  readonly dialect: DatabaseDialect = "mysql";
  private readonly connection: PoolConnection;

  constructor(connection: PoolConnection) {
    this.connection = connection;
  }

  async query<T = Row>(
    sql: string,
    params?: unknown[] | Record<string, unknown>,
  ): Promise<T[]> {
    const prepared = prepareQuery(sql, params, "mysql");
    const [rows] = await this.connection.query(prepared.sql, positional(prepared.params));
    return rows as T[];
  }

  async execute(
    sql: string,
    params?: unknown[] | Record<string, unknown>,
  ): Promise<DatabaseExecutionResult> {
    const prepared = prepareQuery(sql, params, "mysql");
    const [result] = await this.connection.query(
      prepared.sql,
      positional(prepared.params),
    );
    const header = result as ResultSetHeader;
    return {
      changes: header.affectedRows ?? 0,
      lastInsertRowid: header.insertId || undefined,
    };
  }

  async transaction<T>(
    fn: (trx: IDatabaseAdapter) => Promise<T>,
  ): Promise<T> {
    await this.connection.query("SAVEPOINT eterc_nested");
    try {
      const result = await fn(this);
      await this.connection.query("RELEASE SAVEPOINT eterc_nested");
      return result;
    } catch (error) {
      await this.connection.query("ROLLBACK TO SAVEPOINT eterc_nested");
      throw error;
    }
  }

  async ping(): Promise<boolean> {
    const [rows] = await this.connection.query("SELECT 1 AS alive");
    const first = (rows as Array<{ alive?: number }>)[0];
    return first?.alive === 1;
  }

  async close(): Promise<void> {
    // The owning transaction releases the connection.
  }
}

export class MysqlGateway implements IDatabaseAdapter {
  readonly dialect: DatabaseDialect = "mysql";
  private readonly pool: Pool;

  constructor(options: MysqlGatewayOptions) {
    this.pool = mysql.createPool({
      uri: options.connectionString,
      ssl: resolveSsl(
        options.connectionString,
        options.ssl,
        options.allowInsecure,
      ) as never,
      connectionLimit: options.maxConnections ?? 5,
      connectTimeout: options.connectTimeoutMs ?? 10_000,
      waitForConnections: true,
      queueLimit: 0,
      enableKeepAlive: true,
    });
    // One quoting style across SQLite, Postgres and MySQL.
    this.pool.on("connection", (connection) => {
      connection.query("SET SESSION sql_mode = CONCAT(@@sql_mode, ',ANSI_QUOTES')");
    });
  }

  async query<T = Row>(
    sql: string,
    params?: unknown[] | Record<string, unknown>,
  ): Promise<T[]> {
    const prepared = prepareQuery(sql, params, "mysql");
    const [rows] = await this.pool.query(prepared.sql, positional(prepared.params));
    return rows as T[];
  }

  async execute(
    sql: string,
    params?: unknown[] | Record<string, unknown>,
  ): Promise<DatabaseExecutionResult> {
    const prepared = prepareQuery(sql, params, "mysql");
    const [result] = await this.pool.query(
      prepared.sql,
      positional(prepared.params),
    );
    const header = result as ResultSetHeader;
    return {
      changes: header.affectedRows ?? 0,
      lastInsertRowid: header.insertId || undefined,
    };
  }

  async transaction<T>(
    fn: (trx: IDatabaseAdapter) => Promise<T>,
  ): Promise<T> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await fn(new MysqlTransactionGateway(connection));
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async ping(): Promise<boolean> {
    try {
      const [rows] = await this.pool.query("SELECT 1 AS alive");
      const first = (rows as Array<{ alive?: number }>)[0];
      return first?.alive === 1;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
