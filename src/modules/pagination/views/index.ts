import type { TgViewComponent } from "@/engine/views-registry";
import PaginationView from "./pagination";
import DefaultCss from "./default_css";

/**
 * View registration map for the pagination module. Keys follow the PHP view
 * addressing convention: "{module}/{view_file}".
 */
export const views: Record<string, TgViewComponent> = {
  "pagination/pagination": PaginationView,
  "pagination/default_css": DefaultCss,
};
