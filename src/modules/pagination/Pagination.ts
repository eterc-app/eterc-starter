import { Eterc } from "@/engine/controller";
import {
  Pagination_model,
  type PaginationData,
  type PreparedPaginationData,
} from "./Pagination_model";
import { renderPreparedPagination } from "./PaginationRenderer";
import type { ReactNode } from "react";
export default class Pagination extends Eterc {
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
