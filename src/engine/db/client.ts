import { drizzle } from "drizzle-orm/better-sqlite3";
import { sqlite } from "../db";
import * as relations from "./relations";
import * as schema from "./schema";

/**
 * Drizzle client over the same better-sqlite3 connection used by the engine.
 * New data-access code should use `orm`; the legacy `Db` facade remains for
 * dynamic CMS queries until they are migrated to the repositories.
 */
export const orm = drizzle(sqlite(), {
  schema: { ...schema, ...relations },
});

export type Orm = typeof orm;
export * from "./schema";
export * from "./relations";
