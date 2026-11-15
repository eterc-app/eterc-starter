import type { DatabaseDialect, IDatabaseAdapter } from "../contracts/database";

export type DatabaseProviderKind = "sqlite" | "postgres" | "mysql" | "libsql";

/**
 * Runtime contract for every database provider. The CMS and flow stores should
 * depend on this interface, never on a concrete driver.
 */
export type DatabaseGateway = IDatabaseAdapter;

export class LegacyDatabaseAccessError extends Error {
  constructor(provider: string) {
    super(
      `The legacy synchronous database facade is not available while "${provider}" is selected. ` +
        "Use an async repository through DatabaseGateway.",
    );
    this.name = "LegacyDatabaseAccessError";
  }
}

export function configuredDatabaseProvider(): string {
  return (process.env.ET_DATABASE_PROVIDER ?? "sqlite").trim().toLowerCase();
}

export function isRemoteDatabaseProvider(
  provider = configuredDatabaseProvider(),
): boolean {
  return provider !== "sqlite";
}

/**
 * Called by the legacy synchronous facade. Remote providers are not allowed to
 * fall through to a local SQLite file; a half-migrated project must fail loudly.
 */
export function assertLegacySqliteAccess(): void {
  const provider = configuredDatabaseProvider();
  if (provider !== "sqlite") {
    throw new LegacyDatabaseAccessError(provider);
  }
}

export function supportsTransactionalDdl(dialect: DatabaseDialect): boolean {
  return dialect !== "mysql";
}
