import { Model } from "@/engine/model";
import { BASE_URL } from "@/engine/config";
import {
  current_url,
  get_last_segment,
  remove_query_string,
  segment,
} from "@/engine/request-context";

/**
 * Pagination_model — port of modules/pagination/Pagination_model.php.
 *
 * Validates the pagination configuration, fills in the documented defaults,
 * detects the pagination root / current page and returns the processed data
 * consumed by the Pagination renderer. Returns null when the record count is
 * too small to paginate (the controller then renders nothing).
 */

export type PaginationSettings = Record<string, string>;

export interface PaginationData {
  total_rows: number;
  limit: number;
  include_showing_statement?: boolean;
  page_num_segment?: number | null;
  pagination_root?: string | null;
  pagination_query?: string;
  settings?: Partial<PaginationSettings> | null;
  include_css?: boolean;
  showing_statement?: string | null;
  num_links_per_page?: number;
  record_name_plural?: string;
  [key: string]: unknown;
}

export interface PreparedPaginationData {
  total_rows: number;
  limit: number;
  include_showing_statement: boolean;
  page_num_segment: number | null;
  pagination_root: string;
  pagination_query: string;
  settings: PaginationSettings;
  include_css: boolean;
  showing_statement: string | null;
  num_links_per_page: number;
  record_name_plural: string;
  total_pages: number;
  current_page: number;
  [key: string]: unknown;
}

/** Default markup settings (Pagination_model::$default_settings). */
export const DEFAULT_SETTINGS: PaginationSettings = {
  pagination_open:
    '<nav aria-label="Pagination" class="inline-flex flex-wrap items-center gap-1">',
  pagination_close: "</nav>",
  cur_link_open:
    '<a aria-current="page" class="pointer-events-none inline-flex items-center rounded-md border border-primary bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">',
  cur_link_close: "</a>",
  num_link_open: "",
  num_link_close: "",
  first_link: "First",
  first_link_open: "",
  first_link_close: "",
  first_link_aria_label: "First page",
  last_link: "Last",
  last_link_open: "",
  last_link_close: "",
  last_link_aria_label: "Last page",
  prev_link: "&laquo;",
  prev_link_open: "",
  prev_link_close: "",
  prev_link_aria_label: "Previous page",
  next_link: "&raquo;",
  next_link_open: "",
  next_link_close: "",
  next_link_aria_label: "Next page",
};

interface OptionalProperty {
  default: unknown;
  type: "bool" | "int" | "string" | "array";
}

const OPTIONAL_PROPERTIES: Record<string, OptionalProperty> = {
  include_showing_statement: { default: false, type: "bool" },
  page_num_segment: { default: null, type: "int" },
  pagination_root: { default: null, type: "string" },
  pagination_query: { default: "", type: "string" },
  settings: { default: {}, type: "array" },
  include_css: { default: false, type: "bool" },
  showing_statement: { default: null, type: "string" },
  num_links_per_page: { default: 7, type: "int" },
  record_name_plural: { default: "records", type: "string" },
};

const REQUIRED_PROPERTIES: Record<string, "int"> = {
  total_rows: "int",
  limit: "int",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isExpectedType(value: unknown, type: OptionalProperty["type"]): boolean {
  switch (type) {
    case "bool":
      return typeof value === "boolean";
    case "int":
      return typeof value === "number" && Number.isInteger(value);
    case "string":
      return typeof value === "string";
    case "array":
      return isRecord(value);
    default:
      return false;
  }
}

export class Pagination_model extends Model {
  /**
   * Prepare and validate pagination data.
   *
   * Mirrors Pagination_model::prepare_pagination_data(): required-property
   * failures are fatal (the PHP original calls die()), optional properties
   * with a wrong type fall back to their defaults, and `null` means "no
   * pagination required".
   */
  prepare_pagination_data(
    pagination_data: PaginationData
  ): PreparedPaginationData | null {
    const data: Record<string, unknown> = { ...pagination_data };

    this.check_for_required_properties(data);
    this.init_optional_properties(data);

    const root = data.pagination_root;
    if (root === null || root === undefined || root === "") {
      data.pagination_root = this.auto_detect_pagination_root();
    } else {
      const rootString = String(root);
      data.pagination_root = rootString.endsWith("/") ? rootString : rootString + "/";
    }

    // Early return if no pagination needed.
    if (Number(data.total_rows) <= Number(data.limit)) {
      return null;
    }

    const total_pages = Math.ceil(Number(data.total_rows) / Number(data.limit));
    data.total_pages = total_pages;

    let current_page = this.get_current_page(
      data.page_num_segment === null || data.page_num_segment === undefined
        ? null
        : Number(data.page_num_segment)
    );

    if (current_page > total_pages) {
      current_page = total_pages;
    }
    data.current_page = current_page;

    return data as unknown as PreparedPaginationData;
  }

  private check_for_required_properties(data: Record<string, unknown>): void {
    const missing: string[] = [];

    for (const [property, expected_type] of Object.entries(REQUIRED_PROPERTIES)) {
      if (!isExpectedType(data[property], expected_type)) {
        missing.push(`${property} (expected type: ${expected_type})`);
      }
    }

    if (missing.length === 0) return;

    let error_message = "Pagination Error: ";
    error_message +=
      missing.length === 1
        ? "Missing or invalid required property: "
        : "Missing or invalid required properties: ";
    error_message += missing.join(", ");

    throw new Error(error_message);
  }

  private init_optional_properties(data: Record<string, unknown>): void {
    for (const [property, options] of Object.entries(OPTIONAL_PROPERTIES)) {
      if (data[property] === undefined || data[property] === null) {
        // Non-null defaults (bool/int/string/array) replace null exactly as
        // PHP's isset() branch does; nullable defaults keep null.
        data[property] = options.default;
        continue;
      }

      if (options.default === null) {
        // Nullable property supplied with a value: only null is valid.
        if (data[property] === null) continue;
      }

      if (!isExpectedType(data[property], options.type)) {
        data[property] = options.default;
      }
    }

    const settings = data.settings;
    if (settings === undefined || settings === null || !isRecord(settings)) {
      data.settings = { ...DEFAULT_SETTINGS };
    } else if (Object.keys(settings).length === 0) {
      data.settings = { ...DEFAULT_SETTINGS };
    } else {
      data.settings = this.validate_settings(settings);
    }
  }

  private validate_settings(
    submitted_settings: Record<string, unknown>
  ): PaginationSettings {
    const settings: PaginationSettings = {};
    for (const [key, default_value] of Object.entries(DEFAULT_SETTINGS)) {
      const submitted = submitted_settings[key];
      settings[key] = typeof submitted === "string" ? submitted : default_value;
    }
    return settings;
  }

  private get_current_page(segmentPosition: number | null): number {
    if (segmentPosition === null) {
      const last_segment = get_last_segment();
      if (/^-?\d+(?:\.\d+)?$/.test(last_segment)) {
        return Math.max(1, Number.parseInt(last_segment, 10));
      }
      return 1;
    }

    const page = Number(segment(segmentPosition, "int"));
    return Math.max(1, page);
  }

  private auto_detect_pagination_root(): string {
    const page_url = current_url();
    const last_segment = get_last_segment();

    const base_url = remove_query_string(page_url);

    // Resolve the path component, then strip the configured BASE_URL so the
    // result is a relative pagination root (PHP: str_replace(BASE_URL, ...)).
    let pathname = base_url;
    try {
      pathname = new URL(base_url).pathname;
    } catch {
      pathname = base_url.split("?")[0];
    }

    let base_path = BASE_URL;
    try {
      if (/^https?:\/\//.test(base_path)) {
        base_path = new URL(base_path).pathname;
      }
    } catch {
      /* keep as-is */
    }

    base_path = base_path.replace(/^\/+/, "").replace(/\/+$/, "");
    pathname = pathname.replace(/^\/+/, "").replace(/\/+$/, "");

    if (
      base_path !== "" &&
      (pathname === base_path || pathname.startsWith(base_path + "/"))
    ) {
      pathname = pathname.slice(base_path.length).replace(/^\/+/, "");
    }

    if (last_segment !== "" && /^-?\d+(?:\.\d+)?$/.test(last_segment)) {
      const last_segment_pos = pathname.lastIndexOf("/" + last_segment);
      if (last_segment_pos !== -1) {
        pathname = pathname.slice(0, last_segment_pos);
      } else if (pathname === last_segment) {
        pathname = "";
      }
    }

    pathname = pathname.replace(/\/+$/, "");

    return pathname === "" ? "/" : pathname + "/";
  }
}

export default Pagination_model;
