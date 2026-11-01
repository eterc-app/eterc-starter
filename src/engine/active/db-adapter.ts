import type {
  DatabaseDialect,
  DatabaseExecutionResult,
  IDatabaseAdapter,
  Row,
} from "../contracts/database";
import { sqlite } from "../db";

export class SqliteDatabaseAdapter implements IDatabaseAdapter {
  readonly dialect: DatabaseDialect = "sqlite";

  async query<T = Row>(sql: string, params?: unknown[] | Record<string, unknown>): Promise<T[]> {
    const db = sqlite();
    const statement = db.prepare(sql);
    if (params) {
      return (Array.isArray(params) ? statement.all(...params) : statement.all(params)) as T[];
    }
    return statement.all() as T[];
  }

  async execute(sql: string, params?: unknown[] | Record<string, unknown>): Promise<DatabaseExecutionResult> {
    const db = sqlite();
    const statement = db.prepare(sql);
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

  async transaction<T>(fn: (trx: IDatabaseAdapter) => Promise<T>): Promise<T> {
    const db = sqlite();
    db.exec("BEGIN");
    try {
      const result = await fn(this);
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  async ping(): Promise<boolean> {
    try {
      const result = sqlite().prepare("SELECT 1 as alive").get() as { alive?: number };
      return result?.alive === 1;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    // Shared sqlite connection managed by runtime.
  }
}

export const activeDbAdapter: IDatabaseAdapter = new SqliteDatabaseAdapter();
