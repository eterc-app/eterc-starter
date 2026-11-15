import type {
  DatabaseDialect,
  DatabaseExecutionResult,
  IDatabaseAdapter,
  Row,
} from "../contracts/database";

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Base for async repositories. Subclasses receive a DatabaseGateway and must
 * use parameterized values plus validated identifiers.
 *
 * Repository constructors must accept a single IDatabaseAdapter so transaction
 * callbacks can construct a transaction-scoped instance.
 */
export abstract class Repository {
  protected readonly db: IDatabaseAdapter;

  constructor(db: IDatabaseAdapter) {
    this.db = db;
  }

  get dialect(): DatabaseDialect {
    return this.db.dialect;
  }

  protected identifier(value: string): string {
    if (!IDENTIFIER.test(value)) {
      throw new Error(`Invalid SQL identifier: ${value}`);
    }
    return this.dialect === "mysql" ? `\`${value}\`` : `"${value}"`;
  }

  protected placeholder(index: number): string {
    return this.dialect === "postgres" ? `$${index}` : "?";
  }

  protected many<T extends Row = Row>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]> {
    return this.db.query<T>(sql, params);
  }

  protected async one<T extends Row = Row>(
    sql: string,
    params?: unknown[],
  ): Promise<T | null> {
    const rows = await this.db.query<T>(sql, params);
    return rows[0] ?? null;
  }

  protected execute(
    sql: string,
    params?: unknown[],
  ): Promise<DatabaseExecutionResult> {
    return this.db.execute(sql, params);
  }

  protected async transaction<T>(fn: (repo: this) => Promise<T>): Promise<T> {
    const Ctor = this.constructor as new (db: IDatabaseAdapter) => this;
    return this.db.transaction((trx) => fn(new Ctor(trx)));
  }
}
