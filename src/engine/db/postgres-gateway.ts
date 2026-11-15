import { Pool, type PoolClient, type PoolConfig } from "pg";
import type {
  DatabaseDialect,
  DatabaseExecutionResult,
  IDatabaseAdapter,
  Row,
} from "../contracts/database";

export interface PostgresGatewayOptions {
  connectionString: string;
  ssl?: PoolConfig["ssl"];
  /** Internal container networks may intentionally run without TLS. */
  allowInsecure?: boolean;
  maxConnections?: number;
  statementTimeoutMs?: number;
  connectionTimeoutMs?: number;
  applicationName?: string;
}

function resolveSsl(
  connectionString: string,
  explicit: PoolConfig["ssl"] | undefined,
  allowInsecure = false,
): PoolConfig["ssl"] {
  if (allowInsecure) return undefined;
  if (explicit !== undefined) return explicit;
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("The Postgres connection string is not valid.");
  }
  const host = url.hostname.toLowerCase();
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (local) return undefined;
  const sslmode = url.searchParams.get("sslmode")?.toLowerCase();
  if (sslmode === "disable" || sslmode === "allow" || sslmode === "prefer") {
    throw new Error(
      "Remote Postgres connections require TLS. Use sslmode=require or stronger.",
    );
  }
  return { rejectUnauthorized: true };
}

function positional(
  params: unknown[] | Record<string, unknown> | undefined,
): unknown[] | undefined {
  if (params === undefined) return undefined;
  if (Array.isArray(params)) return params;
  throw new Error(
    "Postgres queries require positional parameters. Named parameters are not supported.",
  );
}

class PostgresTransactionGateway implements IDatabaseAdapter {
  readonly dialect: DatabaseDialect = "postgres";
  private readonly client: PoolClient;

  constructor(client: PoolClient) {
    this.client = client;
  }

  async query<T = Row>(
    sql: string,
    params?: unknown[] | Record<string, unknown>,
  ): Promise<T[]> {
    const result = await this.client.query(sql, positional(params));
    return result.rows as T[];
  }

  async execute(
    sql: string,
    params?: unknown[] | Record<string, unknown>,
  ): Promise<DatabaseExecutionResult> {
    const result = await this.client.query(sql, positional(params));
    return { changes: result.rowCount ?? 0 };
  }

  async transaction<T>(
    fn: (trx: IDatabaseAdapter) => Promise<T>,
  ): Promise<T> {
    await this.client.query("SAVEPOINT eterc_nested");
    try {
      const result = await fn(this);
      await this.client.query("RELEASE SAVEPOINT eterc_nested");
      return result;
    } catch (error) {
      await this.client.query("ROLLBACK TO SAVEPOINT eterc_nested");
      throw error;
    }
  }

  async ping(): Promise<boolean> {
    const result = await this.client.query("SELECT 1 AS alive");
    return result.rows[0]?.alive === 1;
  }

  async close(): Promise<void> {
    // The owning transaction releases the client.
  }
}

/**
 * Postgres implementation of DatabaseGateway. Remote connections must use TLS;
 * the pool is bounded and every statement has a server-side timeout.
 */
export class PostgresGateway implements IDatabaseAdapter {
  readonly dialect: DatabaseDialect = "postgres";
  private readonly pool: Pool;

  constructor(options: PostgresGatewayOptions) {
    this.pool = new Pool({
      connectionString: options.connectionString,
      ssl: resolveSsl(options.connectionString, options.ssl, options.allowInsecure),
      max: options.maxConnections ?? 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: options.connectionTimeoutMs ?? 10_000,
      statement_timeout: options.statementTimeoutMs ?? 15_000,
      application_name: options.applicationName ?? "eterc",
    });
  }

  async query<T = Row>(
    sql: string,
    params?: unknown[] | Record<string, unknown>,
  ): Promise<T[]> {
    const result = await this.pool.query(sql, positional(params));
    return result.rows as T[];
  }

  async execute(
    sql: string,
    params?: unknown[] | Record<string, unknown>,
  ): Promise<DatabaseExecutionResult> {
    const result = await this.pool.query(sql, positional(params));
    return { changes: result.rowCount ?? 0 };
  }

  async transaction<T>(
    fn: (trx: IDatabaseAdapter) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(new PostgresTransactionGateway(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.pool.query("SELECT 1 AS alive");
      return result.rows[0]?.alive === 1;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
