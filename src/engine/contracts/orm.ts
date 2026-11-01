import type { Row } from "./database";

export interface OrmQueryOptions {
  where?: Record<string, unknown>;
  orderBy?: Record<string, "asc" | "desc">;
  limit?: number;
  offset?: number;
  select?: string[];
}

export interface IOrmModel<T = Row> {
  findMany(options?: OrmQueryOptions): Promise<T[]>;
  findFirst(options?: OrmQueryOptions): Promise<T | null>;
  create(data: Partial<T>): Promise<T>;
  update(where: Record<string, unknown>, data: Partial<T>): Promise<{ count: number }>;
  delete(where: Record<string, unknown>): Promise<{ count: number }>;
}

export interface IOrmAdapter {
  readonly name: "drizzle" | "prisma";
  readonly client: unknown;
  model<T = Row>(modelName: string): IOrmModel<T>;
}

