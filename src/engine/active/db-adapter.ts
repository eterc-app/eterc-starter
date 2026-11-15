import type { DatabaseDialect, IDatabaseAdapter } from "../contracts/database";
import { sqlite } from "../db";
import { SqliteGateway } from "../db/sqlite-gateway";

export class SqliteDatabaseAdapter extends SqliteGateway {
  readonly dialect: DatabaseDialect = "sqlite";

  constructor() {
    super(sqlite());
  }
}

export const activeDbAdapter: IDatabaseAdapter = new SqliteDatabaseAdapter();
