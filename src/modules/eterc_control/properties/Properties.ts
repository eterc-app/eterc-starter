import * as fs from "node:fs";
import * as path from "node:path";
import { Eterc } from "@/engine/controller";
import { ENV } from "@/engine/config";
import { MODULES_DIR } from "@/engine/paths";
import { get_context } from "@/engine/request-context";
import { EtHttpError } from "@/engine/signals";
import type { Eterc_security } from "@/modules/eterc_security/Eterc_security";

/**
 * Properties — port of
 * modules/eterc_control/properties/Properties.php.
 *
 * The PHP module is a small JSON data service used by the Properties Builder:
 *
 *   get_fields_info()     → data/fields_info.json
 *   get_address_types()   → data/address_types.json
 *   get_address_data()    → data/address_<type>.json  (JSON POST: addressType)
 *
 * The original echoed the raw file contents. The port returns the parsed JSON
 * value so the JSON API route can wrap it in its standard envelope:
 *
 *   POST /api/xhr/eterc_control-properties/get_fields_info
 *   POST /api/xhr/eterc_control-properties/get_address_types
 *   POST /api/xhr/eterc_control-properties/get_address_data
 *        body: {"addressType":"American"}
 *
 * The PHP implementation had no model/traits — all loading happens here.
 *
 * Deviations:
 *  - outside dev mode the PHP constructor delegated to
 *    eterc_control-evo::render_disabled_response() and died. The port raises
 *    a 403 instead (the JSON endpoints have no HTML disabled-response path;
 *    same approach as the sibling query_builder / module_builder controllers);
 *  - every public method is an admin endpoint, so it calls
 *    eterc_security->make_sure_allowed() like the ported admin modules;
 *  - a missing/corrupt data file yields {} or [] instead of a PHP warning and
 *    an empty response body;
 *  - the address-type filename is validated before use, so a crafted
 *    `addressType` cannot traverse outside the data directory.
 */

/** A validation rule definition as stored in fields_info.json. */
export interface PropertyValidationRule {
  rule_name: string;
  rule_label: string;
  rule_requires_value: string;
  rule_default_value?: string;
  selected: string;
}

/** A checkbox definition as stored in fields_info.json. */
export interface PropertyCheckbox {
  name: string;
  label: string;
  checked: string;
}

/** One property type definition (varchar, email, int, ...). */
export interface PropertyFieldInfo {
  property_name: string;
  property_label: string;
  validation_rules: PropertyValidationRule[];
  default_col_size: string;
  checkboxes: PropertyCheckbox[];
  suggestions: string[];
}

/** The complete fields_info.json document. */
export type PropertyFieldsInfo = Record<string, PropertyFieldInfo>;

const DATA_DIR = path.join(
  MODULES_DIR,
  "eterc_control",
  "properties",
  "data"
);

/** Only allow the plain JSON filenames used by the data directory. */
const SAFE_DATA_FILE = /^[a-z0-9_]+\.json$/;

export default class Properties extends Eterc {
  constructor(moduleName?: string | null) {
    super(moduleName);

    // PHP: non-dev requests rendered the evo "disabled" response and died.
    if (ENV.toLowerCase() !== "dev") {
      throw new EtHttpError(
        403,
        "The properties service is only available when the application is running in development mode."
      );
    }
  }

  private securityService(): Eterc_security {
    return (this as unknown as { eterc_security: Eterc_security })
      .eterc_security;
  }

  // -------------------------------------------------------------------------
  // Public API (PHP parity)
  // -------------------------------------------------------------------------

  /**
   * Return field info for all property types.
   *
   * PHP: get_fields_info() — file_get_contents(fields_info.json).
   */
  get_fields_info(): PropertyFieldsInfo {
    this.securityService().make_sure_allowed();

    const value = this.read_data_file("fields_info.json");
    return this.as_record<PropertyFieldsInfo>(value);
  }

  /**
   * Return available address types.
   *
   * PHP: get_address_types() — file_get_contents(address_types.json).
   */
  get_address_types(): string[] {
    this.securityService().make_sure_allowed();

    const value = this.read_data_file("address_types.json");
    return Array.isArray(value)
      ? value.map((item) => String(item))
      : [];
  }

  /**
   * Return address property rows for a given address type.
   *
   * PHP: get_address_data() — reads the JSON POST body, lower-cases
   * `addressType`, and loads `address_<type>.json`. Falls back to 'American';
   * an unknown type answers `[]`.
   */
  get_address_data(): unknown[] {
    this.securityService().make_sure_allowed();

    const body = this.getPostData();
    const raw_type = body.addressType;
    const address_type =
      raw_type === undefined || raw_type === null || raw_type === ""
        ? "American"
        : String(raw_type);

    const filename = `address_${address_type.toLowerCase()}.json`;

    if (!SAFE_DATA_FILE.test(filename)) {
      return [];
    }

    const value = this.read_data_file(filename);
    return Array.isArray(value) ? value : [];
  }

  // -------------------------------------------------------------------------
  // Data loading (PHP: file_get_contents + echo)
  // -------------------------------------------------------------------------

  /** Read one JSON document from the module's data/ directory. */
  private read_data_file(filename: string): unknown {
    if (!SAFE_DATA_FILE.test(filename)) {
      return null;
    }

    const file_path = path.join(DATA_DIR, filename);

    try {
      const contents = fs.readFileSync(file_path, "utf8");
      return JSON.parse(contents) as unknown;
    } catch {
      // PHP surfaced a warning and echoed an empty body; return the closest
      // JSON equivalent so clients always receive valid JSON.
      return null;
    }
  }

  /** Read the JSON request body (PHP: php://input + json_decode). */
  private getPostData(): Record<string, unknown> {
    const json = get_context().json;

    if (
      json === null ||
      json === undefined ||
      typeof json !== "object" ||
      Array.isArray(json)
    ) {
      return {};
    }

    return json as Record<string, unknown>;
  }

  private as_record<T extends Record<string, unknown>>(value: unknown): T {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return {} as T;
    }
    return value as T;
  }
}
