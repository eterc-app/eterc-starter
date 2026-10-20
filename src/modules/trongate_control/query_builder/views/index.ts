import type { TgViewComponent } from "@/engine/views-registry";
import QueryBuilder from "./query_builder";

/**
 * View registration map for the query_builder child module - keys are
 * "{module}/{view_file}" and match the PHP view filename
 * modules/trongate_control/query_builder/views/query_builder.php.
 *
 * The PHP original was a standalone document served inside the Flo iframe;
 * the React port keeps the identical page markup and builder logic in
 * <QueryBuilder /> (see views/query_builder.tsx).
 */
export const views: Record<string, TgViewComponent> = {
  "query_builder/query_builder": QueryBuilder,
};
