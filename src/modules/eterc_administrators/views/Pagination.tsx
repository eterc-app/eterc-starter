/**
 * Compatibility re-export of the canonical pagination component.
 *
 * The inline stopgap that lived here has been replaced by the pagination
 * module's Pagination_model and PaginationRenderer. The manage view now
 * imports the canonical module directly; this re-export is kept so external
 * imports of the old path keep working unchanged.
 */
export { Pagination } from "@/modules/pagination/PaginationRenderer";
