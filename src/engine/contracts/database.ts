export type Row = Record<string, unknown>;

export interface DatabaseExecutionResult {
  changes: number;
  lastInsertRowid?: number | string;
}

export type DatabaseDialect = "sqlite" | "postgres" | "mysql";

export interface IDatabaseAdapter {
  readonly dialect: DatabaseDialect;

  /** Executes a query and returns an array of matched rows. */
  query<T = Row>(sql: string, params?: unknown[] | Record<string, unknown>): Promise<T[]>;

  /** Executes an INSERT/UPDATE/DELETE statement and returns mutation details. */
  execute(sql: string, params?: unknown[] | Record<string, unknown>): Promise<DatabaseExecutionResult>;

  /** Runs an isolated transaction block. */
  transaction<T>(fn: (trx: IDatabaseAdapter) => Promise<T>): Promise<T>;

  /** Tests the database connection. */
  ping(): Promise<boolean>;

  /** Closes any active connection pools. */
  close(): Promise<void>;

  /** Optional runtime health probe used by /api/health. */
  healthCheck?(): Promise<{ ok: boolean; message: string }>;
}

