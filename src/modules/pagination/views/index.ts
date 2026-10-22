import type { EtViewComponent } from "@/engine/views-registry";
import PaginationView from "./pagination";
import DefaultCss from "./default_css";
export const views: Record<string, EtViewComponent> = {
  "pagination/pagination": PaginationView,
  "pagination/default_css": DefaultCss,
};
