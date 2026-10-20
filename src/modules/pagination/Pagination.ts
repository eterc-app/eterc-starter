import { Trongate } from "@/engine/controller";
import {
  Pagination_model,
  type PaginationData,
  type PreparedPaginationData,
} from "./Pagination_model";
import { renderPreparedPagination } from "./PaginationRenderer";
import type { ReactNode } from "react";

/**
 * Pagination — port of modules/pagination/Pagination.php.
 *
 * Library used by other modules (PHP: Modules::run('pagination/display',
 * $pagination_data)). The public API keeps the PHP method name and accepts
 * the same configuration array. PHP echoed its output and returned void; a
 * React port must return the node, so `display()` returns ReactNode|null.
 *
 * Usage from a controller:
 *
 *   const pagination = await this.module<Pagination>("pagination");
 *   return pagination.display(pagination_data);
 *
 * Views can use the canonical <Pagination data={...} /> component from
 * ./PaginationRenderer directly (the administrators manage view does).
 */
export default class Pagination extends Trongate {
  constructor(moduleName?: string | null) {
    super(moduleName);
    this.model = new Pagination_model("pagination");
  }

  private paginationModel(): Pagination_model {
    return this.model as Pagination_model;
  }

  /**
   * Display pagination controls and the optional showing statement.
   *
   * @param pagination_data Pagination configuration (total_rows and limit
   *                        required; the remaining keys are optional).
   * @returns The rendered pagination node, or null when pagination is not
   *          required (total_rows <= limit).
   */
  display(pagination_data: PaginationData): ReactNode {
    const data: PreparedPaginationData | null =
      this.paginationModel().prepare_pagination_data(pagination_data);

    if (data === null) {
      return null;
    }

    return renderPreparedPagination(data);
  }
}
