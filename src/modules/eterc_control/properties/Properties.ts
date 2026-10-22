import * as fs from "node:fs";
import * as path from "node:path";
import { Eterc } from "@/engine/controller";
import { ENV } from "@/engine/config";
import { MODULES_DIR } from "@/engine/paths";
import { get_context } from "@/engine/request-context";
import { EtHttpError } from "@/engine/signals";
import type { Eterc_security } from "@/modules/eterc_security/Eterc_security";

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

  get_fields_info(): PropertyFieldsInfo {
    this.securityService().make_sure_allowed();

    const value = this.read_data_file("fields_info.json");
    return this.as_record<PropertyFieldsInfo>(value);
  }
  get_address_types(): string[] {
    this.securityService().make_sure_allowed();

    const value = this.read_data_file("address_types.json");
    return Array.isArray(value)
      ? value.map((item) => String(item))
      : [];
  }
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
      return null;
    }
  }
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
