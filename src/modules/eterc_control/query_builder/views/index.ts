import type { EtViewComponent } from "@/engine/views-registry";
import QueryBuilder from "./query_builder";
export const views: Record<string, EtViewComponent> = {
  "query_builder/query_builder": QueryBuilder,
};
