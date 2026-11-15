import {
  createClient,
  type Client,
  type Transaction,
} from "@libsql/client";
import type {
  DatabaseDialect,
  DatabaseExecutionResult,
  IDatabaseAdapter,
  Row,
} from "../contracts/database";
import { prepareQuery } from "./sql";

export interface LibsqlGatewayOptions {
  url: string;
  authToken?: string;
}

class LibsqlTransactionGateway implements IDatabaseAdapter {
  readonly dialect: DatabaseDialect = "libsql";
  private readonly tx: Transaction;

  constructor(transaction: Transaction) {
    this.tx = transaction;
  }

  async query<T = Row>(
    sql: string,
    params?: unknown[] | Record<string, unknown>,
  ): Promise<T[]> {
    const prepared = prepareQuery(sql, params, "libsql");
    const result = await this.tx.execute({
      sql: prepared.sql,
      args: (prepared.params ?? []) as never,
    });
    return result.rows as T[];
  }

  async execute(
    sql: string,
    params?: unknown[] | Record<string, unknown>,
  ): Promise<DatabaseExecutionResult> {
    const prepared = prepareQuery(sql, params, "libsql");
    const result = await this.tx.execute({
      sql: prepared.sql,
      args: (prepared.params ?? []) as never,
    });
    return {
      changes: result.rowsAffected,
      lastInsertRowid:
        result.lastInsertRowid !== undefined
          ? result.lastInsertRowid.toString()
          : undefined,
    };
  }

  async transaction<T>(
    fn: (trx: IDatabaseAdapter) => Promise<T>,
  ): Promise<T> {
    return fn(this);
  }

  async ping(): Promise<boolean> {
    const result = await this.tx.execute("SELECT 1 AS alive");
    return result.rows[0]?.alive === 1;
  }

  async close(): Promise<void> {
    // The owning transaction closes the handle.
  }
}

export class LibsqlGateway implements IDatabaseAdapter {
  readonly dialect: DatabaseDialect = "libsql";
  private readonly client: Client;

  constructor(options: LibsqlGatewayOptions) {
    this.client = createClient({
      url: options.url,
      authToken: options.authToken,
    });
  }

  async query<T = Row>(
    sql: string,
    params?: unknown[] | Record<string, unknown>,
  ): Promise<T[]> {
    const prepared = prepareQuery(sql, params, "libsql");
    const result = await this.client.execute({
      sql: prepared.sql,
      args: (prepared.params ?? []) as never,
    });
    return result.rows as T[];
  }

  async execute(
    sql: string,
    params?: unknown[] | Record<string, unknown>,
  ): Promise<DatabaseExecutionResult> {
    const prepared = prepareQuery(sql, params, "libsql");
    const result = await this.client.execute({
      sql: prepared.sql,
      args: (prepared.params ?? []) as never,
    });
    return {
      changes: result.rowsAffected,
      lastInsertRowid:
        result.lastInsertRowid !== undefined
          ? result.lastInsertRowid.toString()
          : undefined,
    };
  }

  async transaction<T>(
    fn: (trx: IDatabaseAdapter) => Promise<T>,
  ): Promise<T> {
    const transaction = await this.client.transaction("write");
    try {
      const result = await fn(new LibsqlTransactionGateway(transaction));
      await transaction.commit();
      return result;
    } catch (error) {
      await transaction.rollback();
      throw error;
    } finally {
      transaction.close();
    }
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.client.execute("SELECT 1 AS alive");
      return result.rows[0]?.alive === 1;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    this.client.close();
  }
}
