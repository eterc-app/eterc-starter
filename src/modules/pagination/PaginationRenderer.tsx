import type { ReactNode } from "react";
import { BASE_URL } from "@/engine/config";
import {
  Pagination_model,
  type PaginationData,
  type PaginationSettings,
  type PreparedPaginationData,
} from "./Pagination_model";
import { DEFAULT_CSS } from "./default_css";

/**
 * Pagination renderer — React port of Pagination::render_pagination() and
 * Pagination::get_showing_statement() from modules/pagination/Pagination.php.
 *
 * The renderer emits the same HTML the PHP module produced: the wrapper,
 * first/previous links, page numbers, next/last links and the optional
 * showing statement. Building the markup as a string keeps custom
 * `settings` fragments (which are HTML in the PHP API) working unchanged;
 * the React component injects that string into a display:contents wrapper so
 * the DOM structure and CSS behaviour match.
 */

/** PHP number_format() for whole row counts. */
function format_number(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  return (
    sign +
    Math.abs(rounded)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  );
}

/** PHP htmlspecialchars($value, ENT_QUOTES, 'UTF-8'). */
function htmlspecialchars(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function get_showing_statement(data: PreparedPaginationData): string {
  const offset = (data.current_page - 1) * data.limit;
  const start = offset + 1;
  const end = Math.min(offset + data.limit, data.total_rows);
  const total = format_number(data.total_rows);

  let statement: string;

  if (
    typeof data.showing_statement === "string" &&
    data.showing_statement !== ""
  ) {
    statement = data.showing_statement
      .replace(/\{start\}/g, String(start))
      .replace(/\{end\}/g, String(end))
      .replace(/\{total\}/g, total);
  } else {
    statement = `Showing ${start} to ${end} of ${total} ${data.record_name_plural}.`;
  }

  return `<p class="tg-showing-statement">${statement}</p>\n`;
}

function build_link(
  page: number,
  pagination_root: string,
  pagination_query: string,
  label: string,
  aria_label: string | null = null
): string {
  let url: string;

  if (page === 1) {
    url = BASE_URL + pagination_root.replace(/\/+$/, "");
  } else {
    url = BASE_URL + pagination_root + page;
  }

  if (pagination_query !== "") {
    url += "?" + pagination_query;
  }

  const aria = aria_label
    ? ` aria-label="${htmlspecialchars(aria_label)}"`
    : "";

  return `<a href="${htmlspecialchars(url)}"${aria}>${label}</a>`;
}

/** Build the complete markup for already-prepared pagination data. */
export function buildPaginationMarkup(data: PreparedPaginationData): string {
  const settings: PaginationSettings = data.settings;
  let html = "\n" + settings.pagination_open + "\n";

  const max_links = data.num_links_per_page;
  const num_links_to_side = Math.floor(max_links / 2);

  const current_page = Number(data.current_page);
  const total_pages = Number(data.total_pages);
  const pagination_root = data.pagination_root;
  const pagination_query = data.pagination_query ?? "";

  // First and previous links (only if not on page 1).
  if (current_page > 1) {
    html += settings.first_link_open;
    html += build_link(
      1,
      pagination_root,
      pagination_query,
      settings.first_link,
      settings.first_link_aria_label
    );
    html += settings.first_link_close + "\n";

    html += settings.prev_link_open;
    html += build_link(
      current_page - 1,
      pagination_root,
      pagination_query,
      settings.prev_link,
      settings.prev_link_aria_label
    );
    html += settings.prev_link_close + "\n";
  }

  // Calculate range of pages to show.
  let start_page = Math.max(1, current_page - num_links_to_side);
  const end_page = Math.min(total_pages, current_page + num_links_to_side);

  if (end_page - start_page < max_links - 1) {
    start_page = Math.max(1, end_page - max_links + 1);
  }

  for (let i = start_page; i <= end_page; i++) {
    if (i === current_page) {
      html += settings.cur_link_open;
      html += i;
      html += settings.cur_link_close + "\n";
    } else {
      html += settings.num_link_open;
      html += build_link(i, pagination_root, pagination_query, String(i));
      html += settings.num_link_close + "\n";
    }
  }

  // Next and last links (only if not on the last page).
  if (current_page < total_pages) {
    html += settings.next_link_open;
    html += build_link(
      current_page + 1,
      pagination_root,
      pagination_query,
      settings.next_link,
      settings.next_link_aria_label
    );
    html += settings.next_link_close + "\n";

    html += settings.last_link_open;
    html += build_link(
      total_pages,
      pagination_root,
      pagination_query,
      settings.last_link,
      settings.last_link_aria_label
    );
    html += settings.last_link_close + "\n";
  }

  html += settings.pagination_close + "\n";

  if (data.include_css === true) {
    html += DEFAULT_CSS;
  }

  return html;
}

/** React wrapper for pre-built pagination markup. */
export function PaginationMarkup({ html }: { html: string }) {
  return (
    <div
      className="tg-pagination-markup"
      style={{ display: "contents" }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Render already-prepared data (used by the Pagination controller). */
export function renderPreparedPagination(
  data: PreparedPaginationData
): ReactNode {
  let html = "";
  if (data.include_showing_statement) {
    html += get_showing_statement(data);
  }
  html += buildPaginationMarkup(data);
  return <PaginationMarkup html={html} />;
}

/**
 * Canonical pagination component.
 *
 * Usage (the port's equivalent of Modules::run('pagination/display', ...)):
 *
 *   <Pagination data={pagination_data} />
 *
 * It validates/prepares the configuration through Pagination_model and
 * renders null when the record count does not require pagination.
 */
export function Pagination({ data }: { data: Record<string, unknown> }) {
  const model = new Pagination_model("pagination");
  const prepared = model.prepare_pagination_data(data as PaginationData);
  if (prepared === null) return null;
  return <>{renderPreparedPagination(prepared)}</>;
}

export default Pagination;
