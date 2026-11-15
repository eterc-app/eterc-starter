import type Database from "better-sqlite3";
import type {
  DatabaseDialect,
  DatabaseExecutionResult,
  IDatabaseAdapter,
  Row,
} from "../contracts/database";

/**
 * SQLite implementation of DatabaseGateway. The underlying better-sqlite3
 * driver is synchronous, but this adapter exposes the same async contract used
 * by remote providers so repositories have one execution model.
 */
export class SqliteGateway implements IDatabaseAdapter {
  readonly dialect: DatabaseDialect = "sqlite";
  protected readonly connection: Database.Database;

  constructor(connection: Database.Database) {
    this.connection = connection;
  }

  async query<T = Row>(
    sql: string,
    params?: unknown[] | Record<string, unknown>,
  ): Promise<T[]> {
    const statement = this.connection.prepare(sql);
    if (params) {
      return (
        Array.isArray(params)
          ? statement.all(...params)
          : statement.all(params)
      ) as T[];
    }
    return statement.all() as T[];
  }

  async execute(
    sql: string,
    params?: unknown[] | Record<string, unknown>,
  ): Promise<DatabaseExecutionResult> {
    const statement = this.connection.prepare(sql);
    const result = params
      ? Array.isArray(params)
        ? statement.run(...params)
        : statement.run(params)
      : statement.run();
    return {
      changes: result.changes,
      lastInsertRowid:
        typeof result.lastInsertRowid === "bigint"
          ? result.lastInsertRowid.toString()
          : result.lastInsertRowid,
    };
  }

  async transaction<T>(
    fn: (trx: IDatabaseAdapter) => Promise<T>,
  ): Promise<T> {
    this.connection.exec("BEGIN");
    try {
      const result = await fn(this);
      this.connection.exec("COMMIT");
      return result;
    } catch (error) {
      this.connection.exec("ROLLBACK");
      throw error;
    }
  }

  async ping(): Promise<boolean> {
    try {
      const result = this.connection
        .prepare("SELECT 1 as alive")
        .get() as { alive?: number };
      return result?.alive === 1;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    // Shared connection ownership stays with the runtime.
  }
}
