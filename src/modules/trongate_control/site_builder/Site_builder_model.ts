import * as fs from "node:fs";
import * as path from "node:path";
import { Model } from "@/engine/model";
import { data_path, GENERATED_MODULES_DIR, MODULES_DIR } from "@/engine/paths";
import { url_title } from "@/engine/String_service";
import type {
  GenerateModuleInput,
  GeneratorContext,
  PostedProperty,
  PropertyInput,
} from "./types";

/**
 * Site_builder_model — port of
 * modules/trongate_control/site_builder/Site_builder_model.php.
 *
 * The PHP model mixed three kinds of work:
 *   1. property normalisation / searchable-column discovery;
 *   2. PHP view rendering for the dynamic fragments that were injected into
 *      the donor templates (controller_helper.php + model_helper.php);
 *   3. filesystem helpers (empty_directory / check_write_permissions) and the
 *      admin navigation-menu writer.
 *
 * In the port the donor PHP files are replaced by TypeScript/TSX emitters, so
 * the "dynamic fragment" methods return generated source strings instead of
 * rendered HTML. The public method names are preserved so the controller reads
 * like the PHP original.
 *
 * SQLite deviations (documented again in the generated .sql file):
 *   - `INT PRIMARY KEY AUTO_INCREMENT` → `INTEGER PRIMARY KEY AUTOINCREMENT`;
 *   - optional numeric columns default to 0, optional other columns to NULL
 *     (the same no-NULL sentinel convention as the PHP generator);
 *   - identifiers use backticks (SQLite accepts them).
 */

const PROPERTY_TYPES = [
  "varchar",
  "textarea",
  "int",
  "decimal",
  "boolean",
  "email",
  "date",
  "time",
  "date and time",
  "date range",
  "time range",
] as const;

const NUMERIC_SQL_TYPES = ["INT", "DECIMAL(10,2)", "TINYINT(1)"];

const MODULE_NAME_PATTERN = /^[a-z0-9_]+$/;
const ORDER_BY_PATTERN = /^[a-z0-9_]+( DESC)?$/;
const FIELD_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

/** PHP ucfirst(): upper-case the first character only. */
function ucfirst(value: string): string {
  return value === "" ? value : value.charAt(0).toUpperCase() + value.slice(1);
}

/** PHP ucwords(): upper-case the first character of every space-separated word. */
function ucwords(value: string): string {
  return value
    .split(" ")
    .map((word) =>
      word === "" ? word : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(" ");
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) => typeof entry === "string" || typeof entry === "number")
    .map((entry) => String(entry));
}

/** JSON.stringify for embedding a JS string literal in generated source. */
function js(value: string): string {
  return JSON.stringify(value);
}

/** A JSX text expression: {"Task Title"} */
function jsxText(value: string): string {
  return "{" + js(value) + "}";
}

/** PHP extract_content($rule, '[', ']'). */
function extractRuleValue(rule: string): string {
  const start = rule.indexOf("[");
  if (start === -1) return "";
  const end = rule.indexOf("]", start + 1);
  if (end === -1) return "";
  return rule.slice(start + 1, end);
}

/** PHP extract_rule_name($rule). */
function extractRuleName(rule: string): string {
  const start = rule.indexOf("[");
  return (start === -1 ? rule : rule.slice(0, start)).trim();
}

interface RangeProperty {
  start: PostedProperty;
  end: PostedProperty;
}

export class Site_builder_model extends Model {
  constructor(moduleName: string | null = "site_builder") {
    super(moduleName);
  }

  // =========================================================================
  // Normalisation / validation
  // =========================================================================

  /**
   * Parse the `properties` posted value.
   *
   * The wizard sends a JSON string; direct callers may pass the array. Invalid
   * JSON is rejected by validate_generation_input() before this runs, but this
   * method stays defensive because it is also used by the read-only helpers.
   */
  private parse_properties(value: unknown): PropertyInput[] {
    if (Array.isArray(value)) {
      return value.filter(
        (entry): entry is PropertyInput =>
          entry !== null && typeof entry === "object" && !Array.isArray(entry)
      );
    }

    if (typeof value === "string" && value.trim() !== "") {
      try {
        const parsed: unknown = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (entry): entry is PropertyInput =>
              entry !== null && typeof entry === "object" && !Array.isArray(entry)
          );
        }
      } catch {
        /* fall through */
      }
    }

    return [];
  }

  /**
   * Build the normalised generation context consumed by every emitter.
   *
   * Throws when the posted properties JSON is malformed; the controller turns
   * that into the PHP "Invalid Request" response contract.
   */
  normalize_input(input: GenerateModuleInput): GeneratorContext {
    const module_folder_name = String(input.module_folder_name ?? "").trim();
    const properties = this.parse_properties(input.properties);

    const posted_properties = this.est_posted_properties(properties);
    const has_searchable = posted_properties.some(
      (property) => property.is_searchable === "yes"
    );
    const searchable_columns = posted_properties
      .filter((property) => property.is_searchable === "yes")
      .map((property) => property.form_field_name);

    const raw_order_by = String(input.orderBy ?? "").trim();
    const order_by = this.resolve_order_by(raw_order_by, posted_properties);

    return {
      module_folder_name,
      module_folder_path: path.join(GENERATED_MODULES_DIR, module_folder_name),
      class_name: ucfirst(module_folder_name),
      record_name_singular: String(
        input.record_name_singular ?? module_folder_name
      ).trim(),
      record_name_plural: String(
        input.record_name_plural ?? module_folder_name
      ).trim(),
      nav_label: String(input.nav_label ?? "").trim(),
      url_column: String(input.urlColumn ?? "").trim(),
      order_by,
      properties_json: JSON.stringify(properties),
      properties,
      posted_properties,
      has_searchable,
      searchable_columns,
      searchable_column_options: posted_properties
        .filter((property) => property.is_searchable === "yes")
        .map((property) => ({
          value: property.form_field_name,
          label: property.property_name,
        })),
      table_properties: this.return_table_properties(posted_properties),
    };
  }

  /**
   * Validate the raw `properties` posted value before normalisation.
   *
   * Invalid JSON must not silently become an empty property list: callers
   * would otherwise generate a table with only an id column while believing
   * their fields were accepted.
   */
  validate_properties_input(value: unknown): string | null {
    if (value === undefined || value === null || value === "") return null;

    let decoded: unknown = value;

    if (typeof value === "string") {
      try {
        decoded = JSON.parse(value);
      } catch {
        return "Properties must be valid JSON.";
      }
    }

    if (!Array.isArray(decoded)) {
      return "Properties must be a JSON array.";
    }

    for (let index = 0; index < decoded.length; index++) {
      const entry = decoded[index];
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        return `Each item in the properties array must be an object (index ${index}).`;
      }
      const record = entry as Record<string, unknown>;
      if (typeof record.propertyName !== "string" || record.propertyName.trim() === "") {
        return `Item at index ${index} is missing propertyName.`;
      }
      if (typeof record.propertyType !== "string" || record.propertyType.trim() === "") {
        return `Item at index ${index} is missing propertyType.`;
      }
      if (record.validationRules !== undefined && !Array.isArray(record.validationRules)) {
        return `Item at index ${index} has an invalid validationRules value.`;
      }
    }

    return null;
  }

  /**
   * Validate a normalised context before any file is written.
   *
   * The module-name/order-by checks are security boundaries: both values are
   * interpolated into generated TypeScript and SQL. Field names are also
   * validated here because they become object keys and SQL identifiers.
   *
   * @returns An error message, or null when the context is safe to generate.
   */
  validate_context(context: GeneratorContext): string | null {
    if (context.module_folder_name === "") {
      return "Module could not be created because no module name was provided.";
    }

    if (!MODULE_NAME_PATTERN.test(context.module_folder_name)) {
      return "Module folder names may only contain lowercase letters, numbers and underscores.";
    }

    if (!/^[a-z]/.test(context.module_folder_name)) {
      return "Module folder names must start with a lowercase letter (they become TypeScript class names).";
    }

    if (!ORDER_BY_PATTERN.test(context.order_by)) {
      return "The default order by value is invalid.";
    }

    const seen = new Set<string>();
    for (const property of context.posted_properties) {
      if (!FIELD_NAME_PATTERN.test(property.form_field_name)) {
        return `The property '${property.property_name}' does not produce a valid database column name.`;
      }
      if (property.form_field_name === "id") {
        return "A property cannot be named 'id' because the generated table already has an id column.";
      }
      if (seen.has(property.form_field_name)) {
        return `More than one property produces the column '${property.form_field_name}'. Property names must be unique.`;
      }
      seen.add(property.form_field_name);

      if (
        !(PROPERTY_TYPES as readonly string[]).includes(property.property_type)
      ) {
        return `The property '${property.property_name}' uses an unsupported property type '${property.property_type}'.`;
      }
    }

    return null;
  }

  /**
   * Resolve an order-by value posted by the module wizard.
   *
   * The wizard offers friendly property names ("Task Title") as well as raw
   * columns; the donor model needs a column (the PHP generator relied on the
   * wizard posting a column). Property names are mapped to their
   * form_field_name equivalents here.
   */
  private resolve_order_by(
    value: string,
    posted_properties: PostedProperty[]
  ): string {
    if (value === "" || value === "id" || value === "id DESC") {
      return value === "" ? "id" : value;
    }

    const descending = value.endsWith(" DESC");
    const base = descending ? value.slice(0, -5).trim() : value;

    let column = "";
    for (const property of posted_properties) {
      if (
        property.form_field_name === base ||
        property.property_name === base
      ) {
        column = property.form_field_name;
        break;
      }
    }

    if (column === "") column = base;
    return descending ? `${column} DESC` : column;
  }

  // =========================================================================
  // Property flattening (PHP: est_posted_properties + split_* helpers)
  // =========================================================================

  /**
   * Flatten the posted property list, splitting date/time ranges into
   * `<base>_start` / `<base>_end` columns exactly like the PHP original.
   */
  est_posted_properties(
    properties: PropertyInput[] | string | null | undefined
  ): PostedProperty[] {
    const list = this.parse_properties(properties);
    const posted_properties: PostedProperty[] = [];

    for (const property of list) {
      const property_type = asString(property.propertyType).trim();

      if (property_type === "date range" || property_type === "time range") {
        const split = this.split_range_property(
          property,
          property_type === "date range" ? "date" : "time"
        );
        posted_properties.push(split.start, split.end);
        continue;
      }

      const property_name = asString(property.propertyName);
      const posted: PostedProperty = {
        property_name,
        property_type,
        on_form: asString(property.onForm, "yes"),
        is_searchable: asString(property.isSearchable, "no"),
        on_summary_table: asString(property.onSummaryTable, "no"),
        validation_rules: asStringArray(property.validationRules),
        form_field_name: this.build_form_field_name(property_name),
      };
      posted_properties.push(posted);
    }

    return posted_properties;
  }

  /** PHP: build_form_field_name(). */
  build_form_field_name(property_name: string): string {
    return url_title(property_name).replace(/-/g, "_");
  }

  private split_range_property(
    property: PropertyInput,
    field_type: "date" | "time"
  ): RangeProperty {
    const fallback = field_type === "date" ? "Date Range" : "Time Range";
    const base_name = asString(property.propertyName, fallback);
    const base_field = url_title(base_name).replace(/-/g, "_");
    const on_form = asString(property.onForm, "yes");
    const is_searchable = asString(property.isSearchable, "no");
    const on_summary_table = asString(property.onSummaryTable, "no");
    const all_rules = asStringArray(property.validationRules);
    const labels = this.derive_range_labels(base_name);

    const prefix = field_type === "date" ? "date " : "time ";
    const start_rules: string[] = [];
    const end_rules: string[] = [];

    for (const rule of all_rules) {
      if (rule.startsWith(`start ${prefix}`)) {
        start_rules.push(rule.slice(`start ${prefix}`.length));
      }
      if (rule.startsWith(`end ${prefix}`)) {
        end_rules.push(rule.slice(`end ${prefix}`.length));
      }
    }

    const start: PostedProperty = {
      property_name: labels.start,
      property_type: field_type,
      on_form,
      is_searchable,
      on_summary_table,
      validation_rules: start_rules,
      form_field_name: `${base_field}_start`,
    };

    const end: PostedProperty = {
      property_name: labels.end,
      property_type: field_type,
      on_form,
      is_searchable,
      on_summary_table,
      validation_rules: end_rules,
      form_field_name: `${base_field}_end`,
    };

    return { start, end };
  }

  /** PHP: derive_range_labels(). */
  private derive_range_labels(name: string): { start: string; end: string } {
    const match = name.match(/^(.+)\s+and\s+(.+)$/i);
    if (match) {
      return { start: match[1].trim(), end: match[2].trim() };
    }
    return { start: `${name} Start`, end: `${name} End` };
  }

  // =========================================================================
  // Searchable-column helpers
  // =========================================================================

  /** True when at least one property has is_searchable === 'yes'. */
  has_searchable_property(
    properties_json: string | PropertyInput[] | null | undefined
  ): boolean {
    return this.est_posted_properties(properties_json).some(
      (property) => property.is_searchable === "yes"
    );
  }

  /** form_field_name values of all searchable properties. */
  get_searchable_columns(
    properties_json: string | PropertyInput[] | null | undefined
  ): string[] {
    return this.est_posted_properties(properties_json)
      .filter((property) => property.is_searchable === "yes")
      .map((property) => property.form_field_name);
  }

  /** Only properties that appear on the summary table. */
  return_table_properties(
    posted_properties: PostedProperty[]
  ): PostedProperty[] {
    return posted_properties.filter(
      (property) => property.on_summary_table === "yes"
    );
  }

  // =========================================================================
  // Filesystem helpers (PHP: check_write_permissions / empty_directory)
  // =========================================================================

  /**
   * Check that every path is writable.
   *
   * The PHP original checked `config/` and `modules/`. The port writes only
   * into the generated-modules directory and (optionally) the settings
   * directory, so those are the defaults; callers may append more.
   */
  check_write_permissions(additional_paths: string[] = []): boolean {
    const paths = [MODULES_DIR, GENERATED_MODULES_DIR, ...additional_paths];

    for (const target of paths) {
      if (!fs.existsSync(target)) {
        // A missing directory is fine only when its parent is writable and
        // the controller can create it (GENERATED_MODULES_DIR is ensured).
        const parent = path.dirname(target);
        if (!fs.existsSync(parent)) return false;
        try {
          fs.accessSync(parent, fs.constants.W_OK);
        } catch {
          return false;
        }
        continue;
      }

      try {
        fs.accessSync(target, fs.constants.W_OK);
      } catch {
        return false;
      }
    }

    return true;
  }

  /** Remove a directory's contents recursively, keeping the directory. */
  empty_directory(directory: string): void {
    if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
      return;
    }

    for (const item of fs.readdirSync(directory)) {
      const full_path = path.join(directory, item);
      if (fs.statSync(full_path).isDirectory()) {
        fs.rmSync(full_path, { recursive: true, force: true });
      } else {
        fs.unlinkSync(full_path);
      }
    }
  }

  /** PHP prep_file_contents(): legacy HTML-entity restoration. */
  prep_file_contents(content: string): string {
    return content.replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  }

  // =========================================================================
  // Generated validation tests (controller_helper.php)
  // =========================================================================

  /**
   * Build the `await this.validation.set_rules(...)` lines for submit().
   *
   * The PHP generator returned pre-indented PHP statements; the port returns
   * indented TypeScript statements because `Validation::set_rules` is
   * asynchronous.
   */
  build_validation_tests(data: GeneratorContext): string {
    const tests: string[] = [];

    for (const property of data.posted_properties) {
      const row = this.build_validation_test_row(property);
      if (row !== "") tests.push(row);
    }

    return tests.join("\n");
  }

  private build_validation_test_row(property: PostedProperty): string {
    const form_field_name = property.form_field_name;
    const validation_label = property.property_name.trim().toLowerCase();
    let rules = [...property.validation_rules];

    switch (property.property_type) {
      case "varchar":
      case "textarea":
        break;
      case "int":
        rules = ["integer", ...rules];
        break;
      case "decimal":
        rules = ["decimal", ...rules];
        break;
      case "boolean":
        return "";
      case "email":
        rules = ["valid_email", ...rules];
        break;
      case "date":
        rules = ["valid_date", ...rules];
        break;
      case "time":
        rules = ["valid_time", ...rules];
        break;
      case "date and time":
        rules = ["valid_datetime_local", ...rules];
        break;
      default:
        return "";
    }

    if (rules.length < 1) return "";

    let validation_tests_str = rules.join("|");
    validation_tests_str = validation_tests_str
      .replace(/min length\[/g, "min_length[")
      .replace(/max length\[/g, "max_length[")
      .replace(/greater than\[/g, "greater_than[")
      .replace(/less than\[/g, "less_than[");

    if (property.property_type === "date and time") {
      validation_tests_str = validation_tests_str
        .replace(/in the past/g, "callback_datetime_in_past")
        .replace(/in the future/g, "callback_datetime_in_future");
    } else if (property.property_type === "time") {
      validation_tests_str = validation_tests_str
        .replace(/in the past/g, "callback_time_in_past")
        .replace(/in the future/g, "callback_time_in_future");
    } else {
      validation_tests_str = validation_tests_str
        .replace(/in the past/g, "callback_date_in_past")
        .replace(/in the future/g, "callback_date_in_future");
    }

    return `    await this.validation.set_rules(${js(form_field_name)}, ${js(
      validation_label
    )}, ${js(validation_tests_str)});`;
  }

  // =========================================================================
  // Generated callback methods (controller_helper.php)
  // =========================================================================

  /** Build the date/time validation callback methods for the controller. */
  build_dynamic_callback_methods(data: GeneratorContext): string {
    const methods: string[] = [];

    if (this.needs_rule(data, "date", "in the past")) {
      methods.push(
        this.build_callback_method("date_in_past", "date", "date", "past")
      );
    }
    if (this.needs_rule(data, "date", "in the future")) {
      methods.push(
        this.build_callback_method("date_in_future", "date", "date", "future")
      );
    }
    if (this.needs_rule(data, "date and time", "in the past")) {
      methods.push(
        this.build_callback_method(
          "datetime_in_past",
          "datetime",
          "datetime",
          "past"
        )
      );
    }
    if (this.needs_rule(data, "date and time", "in the future")) {
      methods.push(
        this.build_callback_method(
          "datetime_in_future",
          "datetime",
          "datetime",
          "future"
        )
      );
    }
    if (this.needs_rule(data, "time", "in the past")) {
      methods.push(
        this.build_callback_method("time_in_past", "time", "time", "past")
      );
    }
    if (this.needs_rule(data, "time", "in the future")) {
      methods.push(
        this.build_callback_method("time_in_future", "time", "time", "future")
      );
    }

    return methods.join("\n\n");
  }

  private needs_rule(
    data: GeneratorContext,
    property_type: string,
    rule: string
  ): boolean {
    return data.posted_properties.some(
      (property) =>
        property.property_type === property_type &&
        property.validation_rules.includes(rule)
    );
  }

  private build_callback_method(
    method_name: string,
    parameter_name: string,
    model_method_suffix: string,
    direction: "past" | "future"
  ): string {
    const description =
      parameter_name === "date"
        ? "a date is in the past (strictly before today)"
        : parameter_name === "datetime"
          ? "a datetime is in the past (strictly before now)"
          : "a time is in the past (strictly before now)";

    const future_description =
      parameter_name === "date"
        ? "a date is in the future (strictly after today)"
        : parameter_name === "datetime"
          ? "a datetime is in the future (strictly after now)"
          : "a time is in the future (strictly after now)";

    const format_hint =
      parameter_name === "date"
        ? "YYYY-MM-DD"
        : parameter_name === "datetime"
          ? "YYYY-MM-DDTHH:MM"
          : "HH:MM or HH:MM:SS";

    const lines: string[] = [];
    lines.push("  /**");
    lines.push(
      `   * Validates that ${
        direction === "past" ? description : future_description
      }.`
    );
    lines.push("   *");
    lines.push(`   * @param string $${parameter_name} The ${parameter_name} value (${format_hint}).`);
    lines.push(
      "   * @return string|true Error message if validation fails, true if passes."
    );
    lines.push("   */");
    lines.push(
      `  ${method_name}(${parameter_name}: string): string | true {`
    );
    lines.push("    if (!from_trongate_mx()) {");
    lines.push(
      '      throw new TgHttpError(403, "403 Forbidden - Direct URL access not permitted");'
    );
    lines.push("    }");
    lines.push(
      `    return this.module_model().validate_${model_method_suffix}_in_${direction}(${parameter_name});`
    );
    lines.push("  }");
    return lines.join("\n");
  }

  // =========================================================================
  // Generated model validation methods (model_helper.php)
  // =========================================================================

  /** Build the model's date/time validation methods. */
  build_dynamic_validation_methods(data: GeneratorContext): string {
    const methods: string[] = [];

    if (this.needs_rule(data, "date", "in the past")) {
      methods.push(this.build_date_validation_method("past"));
    }
    if (this.needs_rule(data, "date", "in the future")) {
      methods.push(this.build_date_validation_method("future"));
    }
    if (this.needs_rule(data, "date and time", "in the past")) {
      methods.push(this.build_datetime_validation_method("past"));
    }
    if (this.needs_rule(data, "date and time", "in the future")) {
      methods.push(this.build_datetime_validation_method("future"));
    }
    if (this.needs_rule(data, "time", "in the past")) {
      methods.push(this.build_time_validation_method("past"));
    }
    if (this.needs_rule(data, "time", "in the future")) {
      methods.push(this.build_time_validation_method("future"));
    }

    return methods.join("\n\n");
  }

  private build_date_validation_method(direction: "past" | "future"): string {
    const comparison = direction === "past" ? ">=" : "<=";
    const message =
      direction === "past"
        ? "The date must be in the past."
        : "The date must be in the future.";

    return [
      "  /**",
      `   * Validates that a date is in the ${direction} (strictly ${
        direction === "past" ? "before today" : "after today"
      }).`,
      "   *",
      "   * @param string $date The date value (YYYY-MM-DD).",
      "   * @return string | true Error message if validation fails, true if passes.",
      "   */",
      `  validate_date_in_${direction}(date: string): string | true {`,
      '    if (date === "") return true;',
      "",
      '    const input = new Date(date + "T00:00:00");',
      "    const today = new Date();",
      "    today.setHours(0, 0, 0, 0);",
      "",
      "    if (Number.isNaN(input.getTime())) {",
      '      return "The date must be a valid date.";',
      "    }",
      "",
      `    if (input ${comparison} today) {`,
      `      return ${js(message)};`,
      "    }",
      "",
      "    return true;",
      "  }",
    ].join("\n");
  }

  private build_datetime_validation_method(
    direction: "past" | "future"
  ): string {
    const comparison = direction === "past" ? ">=" : "<=";
    const message =
      direction === "past"
        ? "The datetime must be in the past."
        : "The datetime must be in the future.";

    return [
      "  /**",
      `   * Validates that a datetime is in the ${direction} (strictly ${
        direction === "past" ? "before now" : "after now"
      }).`,
      "   *",
      "   * @param string $datetime The datetime value (YYYY-MM-DDTHH:MM).",
      "   * @return string | true Error message if validation fails, true if passes.",
      "   */",
      `  validate_datetime_in_${direction}(datetime: string): string | true {`,
      '    if (datetime === "") return true;',
      "",
      "    const input = new Date(datetime);",
      "    const now = new Date();",
      "",
      "    if (Number.isNaN(input.getTime())) {",
      '      return "The datetime must be a valid datetime.";',
      "    }",
      "",
      `    if (input ${comparison} now) {`,
      `      return ${js(message)};`,
      "    }",
      "",
      "    return true;",
      "  }",
    ].join("\n");
  }

  private build_time_validation_method(direction: "past" | "future"): string {
    const comparison = direction === "past" ? ">=" : "<=";
    const message =
      direction === "past"
        ? "The time must be in the past."
        : "The time must be in the future.";

    return [
      "  /**",
      `   * Validates that a time is in the ${direction} (strictly ${
        direction === "past" ? "before now" : "after now"
      }).`,
      "   *",
      "   * @param string $time The time value (HH:MM or HH:MM:SS).",
      "   * @return string | true Error message if validation fails, true if passes.",
      "   */",
      `  validate_time_in_${direction}(time: string): string | true {`,
      '    if (time === "") return true;',
      "",
      '    const match = time.match(/^(\\d{2}):(\\d{2})(?::(\\d{2}))?$/);',
      "    if (!match) {",
      '      return "The time must be a valid time.";',
      "    }",
      "",
      "    const input = new Date();",
      "    input.setHours(Number(match[1]), Number(match[2]), Number(match[3] ?? 0), 0);",
      "    const now = new Date();",
      "",
      `    if (input ${comparison} now) {`,
      `      return ${js(message)};`,
      "    }",
      "",
      "    return true;",
      "  }",
    ].join("\n");
  }

  // =========================================================================
  // Generated posted-data / display helpers (model_helper.php)
  // =========================================================================

  /** Build the object literal inside the generated model's get_data_from_post(). */
  build_dynamic_posted_data(data: GeneratorContext): string {
    const lines: string[] = [];

    for (const property of data.posted_properties) {
      const field = property.form_field_name;

      if (property.property_type === "textarea") {
        lines.push(
          `      ${field}: String(post(${js(field)}) ?? "").trim(),`
        );
      } else if (property.property_type === "boolean") {
        lines.push(
          `      ${field}: (post(${js(
            field
          )}) === "1" || post(${js(field)}) === "on" || post(${js(
            field
          )}) === "true" || post(${js(field)}) === true) ? 1 : 0,`
        );
      } else {
        lines.push(`      ${field}: post(${js(field)}, true),`);
      }
    }

    return lines.join("\n");
  }

  /** Build the trim/boolean display conversions in prepare_record_for_display(). */
  build_dynamic_prepared_record(data: GeneratorContext): string {
    const lines: string[] = [];

    for (const property of data.posted_properties) {
      const field = property.form_field_name;

      if (
        property.property_type === "varchar" ||
        property.property_type === "textarea"
      ) {
        lines.push(
          `    record.${field} = typeof record.${field} === "string" ? record.${field}.trim() : record.${field};`
        );
      } else if (property.property_type === "boolean") {
        lines.push(
          `    record.${field} = Number(record.${field} ?? 0) === 1 ? "yes" : "no";`
        );
      }
    }

    return lines.join("\n");
  }

  // =========================================================================
  // Generated form fields (model_helper.php: build_dynamic_form_fields)
  // =========================================================================

  /** Build the JSX form controls inserted into the generated create view. */
  build_dynamic_form_fields(data: GeneratorContext): string {
    const rows: string[] = [];
    for (const property of data.posted_properties) {
      rows.push(this.build_form_field_row(property));
    }
    return rows.join("\n\n");
  }

  private build_form_field_row(property: PostedProperty): string {
    const field = property.form_field_name;
    const label = ucwords(property.property_name.replace(/_/g, " "));
    const validation = `            <ValidationErrors field=${js(field)} />`;

    if (property.property_type === "boolean") {
      return [
        '          <div className="space-y-2">',
        '            <label className="flex items-center gap-2 text-sm font-medium">',
        "              <input",
        '                type="checkbox"',
        `                name=${js(field)}`,
        '                value="1"',
        `                defaultChecked={Number(data.${field} ?? 0) === 1 || data.${field} === "yes"}`,
        '                className="size-4 rounded border-input"',
        "              />",
        `              ${jsxText(label)}`,
        "            </label>",
        validation,
        "          </div>",
      ].join("\n");
    }

    const attributes = this.build_form_field_attributes(property);
    const tag = this.form_field_tag(property);

    if (tag === "textarea") {
      return [
        '          <div className="space-y-2">',
        `            <Label htmlFor=${js(field)}>${jsxText(label)}</Label>`,
        validation,
        "            <Textarea",
        `              id=${js(field)}`,
        `              name=${js(field)}`,
        `              defaultValue={String(data.${field} ?? "")}`,
        `              placeholder=${js(`Enter ${label}`)}`,
        "              rows={5}",
        attributes,
        "            />",
        "          </div>",
      ]
        .filter((line) => line !== "")
        .join("\n");
    }

    const input_type = this.form_field_input_type(property);
    return [
      '          <div className="space-y-2">',
      `            <Label htmlFor=${js(field)}>${jsxText(label)}</Label>`,
      validation,
      "            <Input",
      `              id=${js(field)}`,
      `              type=${js(input_type)}`,
      `              name=${js(field)}`,
      `              defaultValue={String(data.${field} ?? "")}`,
      `              placeholder=${js(`Enter ${label}`)}`,
      attributes,
      "            />",
      "          </div>",
    ]
      .filter((line) => line !== "")
      .join("\n");
  }

  private form_field_tag(property: PostedProperty): "input" | "textarea" {
    return property.property_type === "textarea" ? "textarea" : "input";
  }

  private form_field_input_type(property: PostedProperty): string {
    switch (property.property_type) {
      case "int":
      case "decimal":
        return "number";
      case "email":
        return "email";
      case "date":
        return "date";
      case "time":
        return "time";
      case "date and time":
        return "datetime-local";
      default:
        return "text";
    }
  }

  /** Build JSX attributes from the property's validation rules. */
  private build_form_field_attributes(property: PostedProperty): string {
    const attributes: string[] = [];

    for (const rule of property.validation_rules) {
      const rule_name = extractRuleName(rule);
      const rule_value = extractRuleValue(rule);

      switch (rule_name) {
        case "required":
          attributes.push("            required");
          break;
        case "min length": {
          const value = Number(rule_value);
          if (rule_value !== "" && Number.isFinite(value)) {
            attributes.push(`            minLength={${value}}`);
          }
          break;
        }
        case "max length": {
          const value = Number(rule_value);
          if (rule_value !== "" && Number.isFinite(value)) {
            attributes.push(`            maxLength={${value}}`);
          }
          break;
        }
        case "greater than": {
          if (rule_value !== "") {
            const numeric = Number(rule_value);
            attributes.push(
              `            min={${
                Number.isFinite(numeric) ? numeric : js(rule_value)
              }}`
            );
          }
          break;
        }
        case "less than": {
          if (rule_value !== "") {
            const numeric = Number(rule_value);
            attributes.push(
              `            max={${
                Number.isFinite(numeric) ? numeric : js(rule_value)
              }}`
            );
          }
          break;
        }
        case "in the past":
          attributes.push('            data-date-constraint="past"');
          break;
        case "in the future":
          attributes.push('            data-date-constraint="future"');
          break;
        default:
          break;
      }
    }

    if (property.property_type === "decimal") {
      attributes.push('            step="any"');
    }

    return attributes.join("\n");
  }

  // =========================================================================
  // Date-constraint script (model_helper.php: needs_date_constraint_js)
  // =========================================================================

  /** True when any temporal property has an in-the-past/future rule. */
  needs_date_constraint_js(data: GeneratorContext): boolean {
    const temporal_types = ["date", "date and time", "time"];
    return data.posted_properties.some(
      (property) =>
        temporal_types.includes(property.property_type) &&
        (property.validation_rules.includes("in the past") ||
          property.validation_rules.includes("in the future"))
    );
  }

  /**
   * Build the browser script body that sets min/max on temporal inputs.
   *
   * The PHP version emitted a DOMContentLoaded listener from the create view.
   * The generated React view embeds this body in a <script> after the form;
   * the body also handles the already-loaded case for client-side renders.
   */
  build_dynamic_date_constraint_js(data: GeneratorContext): string {
    if (!this.needs_date_constraint_js(data)) return "";

    return [
      "(() => {",
      "  const applyDateConstraints = () => {",
      "    const now = new Date();",
      "    const pad = (value) => String(value).padStart(2, \"0\");",
      "    const localToday = now.getFullYear() + \"-\" + pad(now.getMonth() + 1) + \"-\" + pad(now.getDate());",
      "    const localNow = localToday + \"T\" + pad(now.getHours()) + \":\" + pad(now.getMinutes());",
      "",
      "    document.querySelectorAll(\"[data-date-constraint]\").forEach((input) => {",
      "      const constraint = input.getAttribute(\"data-date-constraint\");",
      "      const type = input.getAttribute(\"type\");",
      "      let bound;",
      "      if (type === \"time\") {",
      "        bound = pad(now.getHours()) + \":\" + pad(now.getMinutes());",
      "      } else if (type === \"datetime-local\") {",
      "        bound = localNow;",
      "      } else {",
      "        bound = localToday;",
      "      }",
      "",
      "      if (constraint === \"past\") {",
      "        input.setAttribute(\"max\", bound);",
      "      } else if (constraint === \"future\") {",
      "        input.setAttribute(\"min\", bound);",
      "      }",
      "    });",
      "  };",
      "",
      "  if (document.readyState === \"loading\") {",
      "    document.addEventListener(\"DOMContentLoaded\", applyDateConstraints);",
      "  } else {",
      "    applyDateConstraints();",
      "  }",
      "})();",
    ].join("\n");
  }

  // =========================================================================
  // Generated summary table / details (dynamic_table.php / dynamic_details.php)
  // =========================================================================

  /** Build the full <table> markup for the generated manage view. */
  build_dynamic_table(data: GeneratorContext): string {
    const properties = data.table_properties;
    const lines: string[] = [];

    lines.push('            <table className="w-full border-collapse text-sm">');
    lines.push('              <thead className="bg-muted/60">');
    lines.push("                <tr>");
    lines.push(`                  <th colSpan={${properties.length + 1}} className="p-3 text-left">`);
    lines.push('                    <div className="flex flex-wrap items-center justify-between gap-2">');
    lines.push('                      <span className="font-semibold">Records</span>');
    lines.push('                      <div className="flex items-center gap-2 text-sm font-normal">');
    lines.push('                        Records Per Page:{" "}');
    lines.push("                        <PerPageSelect");
    lines.push("                          options={per_page_options}");
    lines.push("                          selected={selected_per_page}");
    lines.push(`                          module=${js(data.module_folder_name)}`);
    lines.push("                        />");
    lines.push("                      </div>");
    lines.push("                    </div>");
    lines.push("                  </th>");
    lines.push("                </tr>");
    lines.push("                <tr className=\"border-t\">");
    for (const property of properties) {
      lines.push(
        `                  <th className="p-3 text-left font-semibold">${jsxText(
          ucwords(property.property_name.replace(/_/g, " "))
        )}</th>`
      );
    }
    lines.push('                  <th className="p-3 text-right font-semibold">Actions</th>');
    lines.push("                </tr>");
    lines.push("              </thead>");
    lines.push("              <tbody>");
    lines.push("                {rows.map((row) => (");
    lines.push('                  <tr key={String(row.id)} className="border-t transition-colors hover:bg-muted/40">');

    properties.forEach((property, index) => {
      const field = property.form_field_name;
      if (index === 0) {
        lines.push(
          `                    <td className="p-3"><a className="font-medium text-primary hover:underline" href={site_url(${js(
            `${data.module_folder_name}/show/`
          )} + String(row.id))}>{String(row.${field} ?? "")}</a></td>`
        );
      } else {
        lines.push(
          `                    <td className="p-3">{String(row.${field} ?? "")}</td>`
        );
      }
    });

    lines.push('                    <td className="p-3">');
    lines.push('                      <div className="flex items-center justify-end gap-1">');
    lines.push(
      `                        <Button asChild variant="ghost" size="icon">
                          <a href={site_url(${js(
                            `${data.module_folder_name}/show/`
                          )} + String(row.id))} aria-label="View record">
                            <Eye className="size-4" />
                          </a>
                        </Button>`
    );
    lines.push(
      `                        <Button asChild variant="ghost" size="icon">
                          <a href={site_url(${js(
                            `${data.module_folder_name}/create/`
                          )} + String(row.id))} aria-label="Edit record">
                            <Pencil className="size-4" />
                          </a>
                        </Button>`
    );
    lines.push(
      `                        <Button asChild variant="ghost" size="icon">
                          <a href={site_url(${js(
                            `${data.module_folder_name}/delete_conf/`
                          )} + String(row.id))} aria-label="Delete record">
                            <Trash2 className="size-4 text-destructive" />
                          </a>
                        </Button>`
    );
    lines.push("                      </div>");
    lines.push("                    </td>");
    lines.push("                  </tr>");
    lines.push("                ))}");
    lines.push("              </tbody>");
    lines.push("            </table>");

    return lines.join("\n");
  }

  /** Build the detail grid markup for the generated show view. */
  build_dynamic_details(data: GeneratorContext): string {
    const lines: string[] = [];
    lines.push('          <div className="space-y-4">');

    for (const property of data.posted_properties) {
      const field = property.form_field_name;
      if (property.property_type === "textarea") {
        lines.push(
          '            <div className="space-y-1 border-b pb-4 last:border-0 last:pb-0">'
        );
        lines.push(
          `              <div className="text-sm font-medium text-muted-foreground">${jsxText(
            ucwords(property.property_name.replace(/_/g, " "))
          )}</div>`
        );
        lines.push(
          `              <div className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm">{String(data.${field} ?? "")}</div>`
        );
        lines.push("            </div>");
      } else {
        lines.push(
          '            <div className="grid gap-1 border-b pb-4 last:border-0 last:pb-0 sm:grid-cols-[12rem_1fr]">'
        );
        lines.push(
          `              <div className="text-sm font-medium text-muted-foreground">${jsxText(
            ucwords(property.property_name.replace(/_/g, " "))
          )}</div>`
        );
        lines.push(
          `              <div className="text-sm">{String(data.${field} ?? "")}</div>`
        );
        lines.push("            </div>");
      }
    }

    lines.push("          </div>");
    return lines.join("\n");
  }

  /** Build the searchable-column <option> markup. */
  build_searchable_options(data: GeneratorContext, indent = "                "): string {
    return data.searchable_column_options
      .map(
        (option) =>
          `${indent}<option value=${js(option.value)}>${jsxText(
            option.label
          )}</option>`
      )
      .join("\n");
  }

  // =========================================================================
  // Generated controller source (donor_controller.php)
  // =========================================================================

  /** Build the generated `<Controller>.ts` source. */
  generate_controller_content(data: GeneratorContext): string {
    const callback_methods = this.build_dynamic_callback_methods(data);
    const needs_callbacks = callback_methods !== "";
    const validation_tests = this.build_validation_tests(data);
    const lines: string[] = [];

    lines.push('import type { ReactNode } from "react";');
    lines.push('import { Trongate } from "@/engine/controller";');
    lines.push('import { BASE_URL } from "@/engine/config";');
    lines.push('import { set_flashdata } from "@/engine/Flashdata";');
    lines.push('import { get_param, post } from "@/engine/post";');
    lines.push(
      needs_callbacks
        ? 'import { from_trongate_mx, get_context } from "@/engine/request-context";'
        : 'import { get_context } from "@/engine/request-context";'
    );
    lines.push('import { session_get, session_set } from "@/engine/session";');
    if (needs_callbacks) {
      lines.push('import { TgHttpError } from "@/engine/signals";');
    }
    lines.push('import type { TgTemplateData } from "@/engine/Templates";');
    lines.push(
      'import { previous_url, redirect, segment } from "@/engine/Url";'
    );
    lines.push('import { register_views } from "@/engine/views-registry";');
    lines.push(
      'import type { Trongate_security } from "@/modules/trongate_security/Trongate_security";'
    );
    lines.push(
      `import { ${data.class_name}_model } from "./${data.class_name}_model";`
    );
    lines.push('import { views } from "./views";');
    lines.push("");
    lines.push("register_views(views);");
    lines.push("");
    lines.push("/**");
    lines.push(` * ${data.class_name} controller`);
    lines.push(" *");
    lines.push(
      ` * Manages ${data.record_name_singular.toLowerCase()} records with full CRUD operations.`
    );
    lines.push(" * Generated by Site Builder (port of donor_controller.php).");
    lines.push(" */");
    lines.push(`export default class ${data.class_name} extends Trongate {`);
    lines.push("  private default_limit = 20;");
    lines.push("  private per_page_options = [10, 20, 50, 100];");
    lines.push("");
    lines.push("  constructor(moduleName?: string | null) {");
    lines.push("    super(moduleName);");
    lines.push(
      `    this.model = new ${data.class_name}_model(this.module_name || ${js(
        data.module_folder_name
      )});`
    );
    lines.push("  }");
    lines.push("");
    lines.push("  private security_service(): Trongate_security {");
    lines.push(
      "    return (this as unknown as { trongate_security: Trongate_security })"
    );
    lines.push("      .trongate_security;");
    lines.push("  }");
    lines.push("");
    lines.push(`  private module_model(): ${data.class_name}_model {`);
    lines.push(`    return this.model as ${data.class_name}_model;`);
    lines.push("  }");
    lines.push("");
    lines.push("  private base_url(): string {");
    lines.push(
      '    return BASE_URL.endsWith("/") ? BASE_URL : BASE_URL + "/";'
    );
    lines.push("  }");
    lines.push("");
    lines.push("  /** Default entry point - redirects to manage page. */");
    lines.push("  async index(): Promise<ReactNode> {");
    lines.push('    redirect("__MODULE__/manage");');
    lines.push("  }");
    lines.push("");
    lines.push(...this.build_manage_method(data));
    lines.push("");
    lines.push(...this.build_create_method());
    lines.push("");
    lines.push(...this.build_submit_method(data, validation_tests));
    lines.push("");
    lines.push(...this.build_show_method(data));
    lines.push("");
    lines.push(...this.build_delete_conf_method(data));
    lines.push("");
    lines.push(...this.build_submit_delete_method());
    lines.push("");
    lines.push(...this.build_set_per_page_method());
    lines.push("");
    lines.push(...this.build_pagination_method(data));
    lines.push("");
    lines.push(...this.build_back_url_method());
    lines.push("");
    lines.push(...this.build_not_found_method(data));
    lines.push("");
    lines.push(...this.build_selected_per_page_method());
    lines.push("");
    lines.push(...this.build_limit_method());
    lines.push("");
    lines.push(...this.build_offset_method());
    lines.push("");
    lines.push(...this.build_create_data_method(data));

    if (data.has_searchable) {
      lines.push("");
      lines.push(...this.build_submit_search_method());
      lines.push("");
      lines.push(...this.build_search_modal_method());
    }

    if (callback_methods !== "") {
      lines.push("");
      lines.push(callback_methods);
    }

    lines.push("}");
    lines.push("");

    return lines.join("\n").replace(/__MODULE__/g, data.module_folder_name);
  }

  private build_manage_method(data: GeneratorContext): string[] {
    const lines: string[] = [];
    lines.push(`  /** Display paginated list of ${data.record_name_plural.toLowerCase()}. */`);
    lines.push("  async manage(): Promise<ReactNode> {");
    lines.push("    this.security_service().make_sure_allowed();");

    if (data.has_searchable) {
      lines.push("");
      lines.push('    const search_query = get_param("search_query");');
      lines.push('    let search_column = get_param("search_column");');
      lines.push(
        "    const allowed_columns = this.module_model().get_searchable_columns();"
      );
      lines.push(
        '    if (search_column !== "" && !allowed_columns.includes(search_column)) {'
      );
      lines.push('      search_column = "";');
      lines.push("    }");
      lines.push("");
      lines.push('    const search_active = search_query !== "";');
      lines.push("    let total_rows = 0;");
      lines.push("    if (search_active) {");
      lines.push(
        "      total_rows = this.module_model().count_search_results(search_query, search_column);"
      );
      lines.push("    } else {");
      lines.push("      total_rows = this.module_model().count_all();");
      lines.push("    }");
    } else {
      lines.push("");
      lines.push("    const total_rows = this.module_model().count_all();");
    }

    lines.push("");
    lines.push("    const limit = this.get_limit();");
    lines.push("    const offset = this.get_offset();");
    lines.push("");

    if (data.has_searchable) {
      lines.push(
        "    let rows = this.module_model().fetch_records(limit, offset);"
      );
      lines.push("    if (search_active) {");
      lines.push(
        "      rows = this.module_model().search_records(search_query, search_column, limit, offset);"
      );
      lines.push("    } else {");
      lines.push(
        "      rows = this.module_model().fetch_records(limit, offset);"
      );
      lines.push("    }");
    } else {
      lines.push(
        "    let rows = this.module_model().fetch_records(limit, offset);"
      );
    }

    lines.push(
      "    rows = this.module_model().prepare_records_for_display(rows);"
    );
    lines.push("");
    lines.push("    const data: TgTemplateData = {");
    lines.push("      rows,");
    if (data.has_searchable) {
      lines.push(
        "      pagination_data: this.get_pagination_data(total_rows, limit, search_query, search_column),"
      );
    } else {
      lines.push(
        "      pagination_data: this.get_pagination_data(total_rows, limit),"
      );
    }
    lines.push("      viewModule: this.module_name,");
    lines.push('      viewFile: "manage",');
    lines.push("      per_page_options: this.per_page_options,");
    lines.push("      selected_per_page: this.get_selected_per_page(),");
    if (data.has_searchable) {
      lines.push("      search_query,");
      lines.push("      search_column,");
      lines.push("      search_active,");
    }
    lines.push("    };");
    lines.push("");
    lines.push("    return this.templates.admin(data);");
    lines.push("  }");
    return lines;
  }

  private build_create_method(): string[] {
    return [
      "  /** Display form for creating or editing a record. */",
      "  async create(): Promise<ReactNode> {",
      "    this.security_service().make_sure_allowed();",
      "",
      '    const update_id = Number(segment(3, "int"));',
      "    let data: Record<string, unknown>;",
      "",
      '    if (get_context().httpMethod === "GET" && update_id > 0) {',
      "      const record = this.module_model().get_data_from_db(update_id);",
      "      if (record === false) {",
      "        return this.not_found();",
      "      }",
      "      data = record;",
      "    } else {",
      "      data = this.module_model().get_data_from_post();",
      "    }",
      "",
      "    return this.templates.admin(this.build_create_data(data, update_id));",
      "  }",
    ];
  }

  private build_submit_method(
    data: GeneratorContext,
    validation_tests: string
  ): string[] {
    const lines: string[] = [];
    lines.push("  /** Handle form submission for creating/updating records. */");
    lines.push("  async submit(): Promise<ReactNode> {");
    lines.push("    this.security_service().make_sure_allowed();");
    lines.push("");
    lines.push('    const submit = String(post("submit", true) ?? "");');
    lines.push("");
    lines.push('    if (submit !== "Submit") {');
    lines.push('      redirect("__MODULE__/manage");');
    lines.push("    }");
    lines.push("");
    if (validation_tests !== "") {
      lines.push(validation_tests);
      lines.push("");
    }
    lines.push("    if ((await this.validation.run()) !== true) {");
    lines.push('      const update_id = Number(segment(3, "int"));');
    lines.push("      return this.view(");
    lines.push(
      `        ${js(`${data.module_folder_name}/create`)},`
    );
    lines.push(
      "        this.build_create_data(this.module_model().get_data_from_post(), update_id)"
    );
    lines.push("      );");
    lines.push("    }");
    lines.push("");
    lines.push('    let update_id = Number(segment(3, "int"));');
    lines.push(
      "    const data = this.module_model().get_data_from_post();"
    );
    lines.push("");
    lines.push("    if (update_id > 0) {");
    lines.push("      this.module_model().update_record(update_id, data);");
    lines.push(
      `      set_flashdata(${js(
        `${data.record_name_singular.charAt(0).toUpperCase()}${data.record_name_singular.slice(
          1
        )} updated successfully`
      )});`
    );
    lines.push('      redirect("__MODULE__/show/" + update_id);');
    lines.push("    }");
    lines.push("");
    lines.push(
      "    update_id = this.module_model().create_new_record(data);"
    );
    lines.push(
      `    set_flashdata(${js(
        `${data.record_name_singular.charAt(0).toUpperCase()}${data.record_name_singular.slice(
          1
        )} created successfully`
      )});`
    );
    lines.push('    redirect("__MODULE__/manage");');
    lines.push("  }");
    return lines;
  }

  private build_show_method(data: GeneratorContext): string[] {
    return [
      "  /** Display detailed view of a single record. */",
      "  async show(): Promise<ReactNode> {",
      "    this.security_service().make_sure_allowed();",
      "",
      '    const update_id = Number(segment(3, "int"));',
      "",
      "    if (update_id === 0) {",
      '      redirect("__MODULE__/manage");',
      "    }",
      "",
      "    const data = this.module_model().get_data_from_db(update_id, true);",
      "",
      "    if (data === false) {",
      "      return this.not_found();",
      "    }",
      "",
      "    const view_data: TgTemplateData = {",
      "      ...data,",
      "      update_id,",
      `      headline: ${js(`${ucwords(data.record_name_singular)} Details`)},`,
      "      back_url: this.get_back_url(),",
      "      viewModule: this.module_name,",
      '      viewFile: "show",',
      "    };",
      "",
      "    return this.templates.admin(view_data);",
      "  }",
    ];
  }

  private build_delete_conf_method(data: GeneratorContext): string[] {
    return [
      "  /** Display confirmation page before deleting a record. */",
      "  async delete_conf(): Promise<ReactNode> {",
      "    this.security_service().make_sure_allowed();",
      "",
      '    const update_id = Number(segment(3, "int"));',
      "",
      "    if (update_id === 0) {",
      "      return this.not_found();",
      "    }",
      "",
      "    const data = this.module_model().get_data_for_edit(update_id);",
      "",
      "    if (data === false) {",
      "      return this.not_found();",
      "    }",
      "",
      "    const view_data: TgTemplateData = {",
      "      ...data,",
      "      update_id,",
      `      headline: ${js(
        `Delete ${ucwords(data.record_name_singular)} Record`
      )},`,
      "      cancel_url: this.base_url() + \"__MODULE__/show/\" + update_id,",
      "      form_location: this.base_url() + \"__MODULE__/submit_delete/\" + update_id,",
      "      viewModule: this.module_name,",
      '      viewFile: "delete_conf",',
      "    };",
      "",
      "    return this.templates.admin(view_data);",
      "  }",
    ];
  }

  private build_submit_delete_method(): string[] {
    return [
      "  /** Handle record deletion after confirmation. */",
      "  async submit_delete(): Promise<ReactNode> {",
      "    this.security_service().make_sure_allowed();",
      "",
      '    const submit = String(post("submit", true) ?? "");',
      "",
      '    if (submit !== "Yes - Delete Now") {',
      '      redirect("__MODULE__/manage");',
      "    }",
      "",
      '    const update_id = Number(segment(3, "int"));',
      "",
      "    if (update_id === 0) {",
      '      redirect("__MODULE__/manage");',
      "    }",
      "",
      "    const record = this.module_model().find_by_id(update_id);",
      "",
      "    if (record === false) {",
      '      redirect("__MODULE__/manage");',
      "    }",
      "",
      "    this.module_model().delete_record(update_id);",
      '    set_flashdata("The record was successfully deleted");',
      '    redirect("__MODULE__/manage");',
      "  }",
    ];
  }

  private build_set_per_page_method(): string[] {
    return [
      "  /** Set number of records per page for pagination. */",
      "  async set_per_page(): Promise<ReactNode> {",
      "    this.security_service().make_sure_allowed();",
      "",
      '    let selected_index = Number(segment(3, "int"));',
      "",
      "    if (selected_index < 0 || selected_index >= this.per_page_options.length) {",
      "      selected_index = 1;",
      "    }",
      "",
      '    session_set("selected_per_page", selected_index);',
      '    redirect("__MODULE__/manage");',
      "  }",
    ];
  }

  private build_pagination_method(data: GeneratorContext): string[] {
    const lines: string[] = [];
    lines.push("  /** Generate pagination configuration data. */");
    if (data.has_searchable) {
      lines.push(
        '  private get_pagination_data(total_rows: number, limit: number, search_query = "", search_column = ""): Record<string, unknown> {'
      );
      lines.push('    let pagination_query = "";');
      lines.push(
        '    if (search_query !== "" && search_column !== "") {'
      );
      lines.push(
        '      pagination_query = "search_query=" + encodeURIComponent(search_query) + "&search_column=" + encodeURIComponent(search_column);'
      );
      lines.push("    }");
      lines.push("");
    } else {
      lines.push(
        "  private get_pagination_data(total_rows: number, limit: number): Record<string, unknown> {"
      );
    }

    lines.push("    return {");
    lines.push("      total_rows,");
    lines.push("      limit,");
    lines.push('      pagination_root: "__MODULE__/manage",');
    if (data.has_searchable) {
      lines.push("      pagination_query,");
    }
    lines.push(
      `      record_name_plural: ${js(data.record_name_plural.toLowerCase())},`
    );
    lines.push("      include_showing_statement: true,");
    lines.push("    };");
    lines.push("  }");
    return lines;
  }

  private build_back_url_method(): string[] {
    return [
      "  /** Determine appropriate back URL for navigation. */",
      "  private get_back_url(): string {",
      "    const previous = previous_url();",
      '    const expected = this.base_url() + "__MODULE__/manage";',
      "",
      '    if (previous !== "" && previous.startsWith(expected)) {',
      "      return previous;",
      "    }",
      "",
      "    return expected;",
      "  }",
    ];
  }

  private build_not_found_method(data: GeneratorContext): string[] {
    return [
      "  /** Display 404-style not found page for missing records. */",
      "  private async not_found(): Promise<ReactNode> {",
      "    const data: TgTemplateData = {",
      `      headline: ${js(`${ucwords(data.record_name_singular)} Not Found`)},`,
      `      message: ${js(
        `The ${data.record_name_singular.toLowerCase()} you're looking for doesn't exist or has been deleted.`
      )},`,
      "      back_url: this.get_back_url(),",
      '      back_label: "Go Back",',
      "      viewModule: this.module_name,",
      '      viewFile: "not_found",',
      "    };",
      "",
      "    return this.templates.admin(data);",
      "  }",
    ];
  }

  private build_selected_per_page_method(): string[] {
    return [
      "  /** Get selected per-page index from session. */",
      "  private get_selected_per_page(): number {",
      '    return session_get<number>("selected_per_page") ?? 1;',
      "  }",
    ];
  }

  private build_limit_method(): string[] {
    return [
      "  /** Get current pagination limit from session. */",
      "  private get_limit(): number {",
      '    const selected = session_get<number>("selected_per_page");',
      "    if (selected !== undefined && this.per_page_options[selected] !== undefined) {",
      "      return this.per_page_options[selected];",
      "    }",
      "    return this.default_limit;",
      "  }",
    ];
  }

  private build_offset_method(): string[] {
    return [
      "  /** Calculate pagination offset based on page number. */",
      "  private get_offset(): number {",
      '    const page_num = Number(segment(3, "int"));',
      "    return page_num > 1 ? (page_num - 1) * this.get_limit() : 0;",
      "  }",
    ];
  }

  private build_create_data_method(data: GeneratorContext): string[] {
    return [
      "  /** Data for the create/update form view. */",
      "  private build_create_data(",
      "    data: Record<string, unknown>,",
      "    update_id: number",
      "  ): TgTemplateData {",
      "    return {",
      "      ...data,",
      "      update_id,",
      `      headline: update_id > 0 ? ${js(
        `Update ${ucwords(data.record_name_singular)} Record`
      )} : ${js(`Create New ${ucwords(data.record_name_singular)} Record`)},`,
      '      cancel_url: update_id > 0 ? this.base_url() + "__MODULE__/show/" + update_id : this.base_url() + "__MODULE__/manage",',
      '      form_location: this.base_url() + "__MODULE__/submit/" + update_id,',
      "      viewModule: this.module_name,",
      '      viewFile: "create",',
      "    };",
      "  }",
    ];
  }

  private build_submit_search_method(): string[] {
    return [
      "  /** Handle search form submission for filtering records. */",
      "  async submit_search(): Promise<ReactNode> {",
      "    this.security_service().make_sure_allowed();",
      "",
      '    let search_query = String(post("search_query", true) ?? "");',
      '    let search_column = String(post("search_column", true) ?? "");',
      "",
      "    const allowed_columns = this.module_model().get_searchable_columns();",
      "    if (search_column !== \"\" && !allowed_columns.includes(search_column)) {",
      '      search_column = "";',
      "    }",
      "",
      "    search_query = search_query.replace(/\\s+/g, \" \").trim();",
      "",
      "    if (search_query.length < 2) {",
      '      set_flashdata("Search query must be at least 2 characters");',
      '      redirect("__MODULE__/manage");',
      "    }",
      "",
      '    redirect("__MODULE__/manage?search_query=" + encodeURIComponent(search_query) + "&search_column=" + encodeURIComponent(search_column));',
      "  }",
    ];
  }

  private build_search_modal_method(): string[] {
    return [
      "  /** Display the search modal form. */",
      "  async search_modal(): Promise<ReactNode> {",
      "    this.security_service().make_sure_allowed();",
      "    return this.view(\"__MODULE__/search_modal\", {",
      "      viewModule: this.module_name,",
      '      viewFile: "search_modal",',
      "    });",
      "  }",
    ];
  }

  // =========================================================================
  // Generated model source (donor_model.php)
  // =========================================================================

  /** Build the generated `<Controller>_model.ts` source. */
  generate_model_content(data: GeneratorContext): string {
    const lines: string[] = [];
    const searchable_columns = data.searchable_columns
      .map((column) => js(column))
      .join(", ");

    lines.push('import type { Row } from "@/engine/db";');
    lines.push('import { Model } from "@/engine/model";');
    lines.push('import { post } from "@/engine/post";');
    lines.push("");
    lines.push("/**");
    lines.push(
      ` * ${data.class_name}_model - Handles data operations for ${data.record_name_singular.toLowerCase()} records.`
    );
    lines.push(" * Generated by Site Builder (port of donor_model.php).");
    lines.push(" */");
    lines.push(`export class ${data.class_name}_model extends Model {`);
    lines.push(
      `  private table_name = ${js(data.module_folder_name)};`
    );
    lines.push("");
    lines.push("  /** Return the list of searchable column names. */");
    lines.push("  get_searchable_columns(): string[] {");
    lines.push(`    return [${searchable_columns}];`);
    lines.push("  }");
    lines.push("");
    lines.push(
      "  /** Get form data from POST and prepare it for the database. */"
    );
    lines.push("  get_data_from_post(): Record<string, unknown> {");
    lines.push("    return {");
    const posted_data = this.build_dynamic_posted_data(data);
    if (posted_data !== "") lines.push(posted_data);
    lines.push("    };");
    lines.push("  }");
    lines.push("");
    lines.push(
      "  /** Retrieve a single record from the database by ID. */"
    );
    lines.push(
      "  get_data_from_db(update_id: number, prepare_for_display = false): Record<string, unknown> | false {"
    );
    lines.push("    const record = this.db.get_where(update_id, this.table_name);");
    lines.push("");
    lines.push("    if (record === false) {");
    lines.push("      return false;");
    lines.push("    }");
    lines.push("");
    lines.push(
      "    return prepare_for_display ? this.prepare_record_for_display(record) : record;"
    );
    lines.push("  }");
    lines.push("");
    lines.push(
      "  /** Retrieve a record for editing or delete confirmation. */"
    );
    lines.push(
      "  get_data_for_edit(update_id: number): Record<string, unknown> | false {"
    );
    lines.push("    return this.get_data_from_db(update_id, false);");
    lines.push("  }");
    lines.push("");
    lines.push("  /** Find a record by ID. */");
    lines.push("  find_by_id(update_id: number): Row | false {");
    lines.push("    return this.db.get_where(update_id, this.table_name);");
    lines.push("  }");
    lines.push("");
    lines.push(
      `  /** Fetch paginated ${data.record_name_plural.toLowerCase()} records. */`
    );
    lines.push("  fetch_records(limit: number, offset: number): Row[] {");
    lines.push("    return this.db.query_bind(");
    lines.push(
      `      "SELECT * FROM \`${data.module_folder_name}\` ORDER BY ${data.order_by} LIMIT ? OFFSET ?",`
    );
    lines.push("      [limit, offset],");
    lines.push('      "object"');
    lines.push("    ) as Row[];");
    lines.push("  }");
    lines.push("");
    lines.push(
      `  /** Count all ${data.record_name_plural.toLowerCase()} records. */`
    );
    lines.push("  count_all(): number {");
    lines.push("    return this.db.count(this.table_name);");
    lines.push("  }");

    if (data.has_searchable) {
      lines.push("");
      lines.push(
        `  /** Search ${data.record_name_plural.toLowerCase()} records across searchable columns. */`
      );
      lines.push(
        "  search_records(query: string, column: string, limit: number, offset: number): Row[] {"
      );
      lines.push(
        "    const searchable_columns = this.get_searchable_columns();"
      );
      lines.push("");
      lines.push(
        '    if (column !== "" && !searchable_columns.includes(column)) {'
      );
      lines.push('      column = "";');
      lines.push("    }");
      lines.push("");
      lines.push("    const params: unknown[] = [];");
      lines.push("    let where: string;");
      lines.push("");
      lines.push('    if (column !== "") {');
      lines.push('      where = "`" + column + "` LIKE ?";');
      lines.push('      params.push("%" + query + "%");');
      lines.push("    } else {");
      lines.push(
        '      where = "(" + searchable_columns.map((col) => "`" + col + "` LIKE ?").join(" OR ") + ")";'
      );
      lines.push(
        "      for (let i = 0; i < searchable_columns.length; i++) {"
      );
      lines.push('        params.push("%" + query + "%");');
      lines.push("      }");
      lines.push("    }");
      lines.push("");
      lines.push("    params.push(limit, offset);");
      lines.push(
        `    const sql = "SELECT * FROM \`${data.module_folder_name}\` WHERE " + where + " ORDER BY ${data.order_by} LIMIT ? OFFSET ?";`
      );
      lines.push(
        '    return this.db.query_bind(sql, params, "object") as Row[];'
      );
      lines.push("  }");
      lines.push("");
      lines.push(
        `  /** Count search results for ${data.record_name_plural.toLowerCase()} records. */`
      );
      lines.push(
        "  count_search_results(query: string, column: string): number {"
      );
      lines.push(
        "    const searchable_columns = this.get_searchable_columns();"
      );
      lines.push("");
      lines.push(
        '    if (column !== "" && !searchable_columns.includes(column)) {'
      );
      lines.push('      column = "";');
      lines.push("    }");
      lines.push("");
      lines.push("    const params: unknown[] = [];");
      lines.push("    let where: string;");
      lines.push("");
      lines.push('    if (column !== "") {');
      lines.push('      where = "`" + column + "` LIKE ?";');
      lines.push('      params.push("%" + query + "%");');
      lines.push("    } else {");
      lines.push(
        '      where = "(" + searchable_columns.map((col) => "`" + col + "` LIKE ?").join(" OR ") + ")";'
      );
      lines.push(
        "      for (let i = 0; i < searchable_columns.length; i++) {"
      );
      lines.push('        params.push("%" + query + "%");');
      lines.push("      }");
      lines.push("    }");
      lines.push("");
      lines.push(
        `    const sql = "SELECT COUNT(*) as total FROM \`${data.module_folder_name}\` WHERE " + where;`
      );
      lines.push(
        '    const result = this.db.query_bind(sql, params, "object") as Row[];'
      );
      lines.push('    return Number(result[0]?.total ?? 0);');
      lines.push("  }");
    }

    lines.push("");
    lines.push(
      `  /** Prepare multiple ${data.record_name_plural.toLowerCase()} records for display. */`
    );
    lines.push("  prepare_records_for_display(rows: Row[]): Row[] {");
    lines.push(
      "    return rows.map((row) => this.prepare_record_for_display(row));"
    );
    lines.push("  }");
    lines.push("");
    lines.push(
      `  /** Prepare raw ${data.record_name_singular.toLowerCase()} data for display. */`
    );
    lines.push("  prepare_record_for_display(record: Row): Row {");
    const prepared_record = this.build_dynamic_prepared_record(data);
    if (prepared_record !== "") lines.push(prepared_record);
    lines.push("    return record;");
    lines.push("  }");
    lines.push("");
    lines.push(
      `  /** Create a new ${data.record_name_singular.toLowerCase()} record. */`
    );
    lines.push(
      "  create_new_record(data: Record<string, unknown>): number {"
    );
    lines.push("    return this.db.insert(data, this.table_name);");
    lines.push("  }");
    lines.push("");
    lines.push(
      `  /** Update an existing ${data.record_name_singular.toLowerCase()} record. */`
    );
    lines.push(
      "  update_record(update_id: number, data: Record<string, unknown>): void {"
    );
    lines.push("    this.db.update(update_id, data, this.table_name);");
    lines.push("  }");
    lines.push("");
    lines.push(
      `  /** Delete a ${data.record_name_singular.toLowerCase()} record. */`
    );
    lines.push("  delete_record(update_id: number): void {");
    lines.push("    this.db.delete(update_id, this.table_name);");
    lines.push("  }");

    const validation_methods = this.build_dynamic_validation_methods(data);
    if (validation_methods !== "") {
      lines.push("");
      lines.push(validation_methods);
    }

    lines.push("}");
    lines.push("");
    lines.push("export default " + data.class_name + "_model;");
    lines.push("");

    return lines.join("\n").replace(/__MODULE__/g, data.module_folder_name);
  }

  // =========================================================================
  // Generated view source (donor_*.php)
  // =========================================================================

  /**
   * Build one generated view file.
   *
   * Mirrors Site_builder::generate_view_content(): `create`, `manage` and
   * `show` receive their dynamic fragment; every other donor view is copied
   * with the generated copy substituted.
   */
  generate_view_content(view_file: string, data: GeneratorContext): string {
    switch (view_file) {
      case "create":
        return this.build_create_view(data);
      case "manage":
        return this.build_manage_view(data);
      case "show":
        return this.build_show_view(data);
      case "delete_conf":
        return this.build_delete_conf_view(data);
      case "search_modal":
        return this.build_search_modal_view(data);
      case "not_found":
      default:
        return this.build_not_found_view(data);
    }
  }

  private build_create_view(data: GeneratorContext): string {
    const fields = this.build_dynamic_form_fields(data);
    const script = this.build_dynamic_date_constraint_js(data);
    const lines: string[] = [];

    lines.push('import type { TgViewProps } from "@/engine/views-registry";');
    lines.push('import { TgForm } from "@/engine/ui/TgForm";');
    lines.push(
      'import { ValidationErrors } from "@/engine/ui/ValidationErrors";'
    );
    lines.push('import { Button } from "@/components/ui/button";');
    lines.push(
      'import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";'
    );
    lines.push('import { Input } from "@/components/ui/input";');
    lines.push('import { Label } from "@/components/ui/label";');
    lines.push('import { Textarea } from "@/components/ui/textarea";');
    lines.push("");
    lines.push("/**");
    lines.push(
      ` * Create/update ${data.record_name_singular.toLowerCase()} form`
    );
    lines.push(" * Generated by Site Builder (port of donor_create.php).");
    lines.push(" */");
    lines.push("export default function Create({ data }: TgViewProps) {");
    lines.push("  const update_id = Number(data.update_id ?? 0);");
    lines.push("");
    lines.push("  return (");
    lines.push('    <div className="space-y-6">');
    lines.push('      <h1 className="text-lg font-semibold tracking-[-0.01em]">');
    lines.push('        {String(data.headline ?? "")}');
    lines.push("      </h1>");
    lines.push("      <ValidationErrors />");
    lines.push("      <Card>");
    lines.push("        <CardHeader>");
    lines.push(`          <CardTitle>${data.record_name_singular} Details</CardTitle>`);
    lines.push("        </CardHeader>");
    lines.push("        <CardContent>");
    lines.push(`          <TgForm action=${js(
      `${data.module_folder_name}/submit`
    )} params={[update_id]} className="space-y-4">`);
    if (fields !== "") lines.push(fields);
    lines.push('            <div className="flex flex-wrap justify-center gap-2 pt-4">');
    lines.push('              <Button asChild variant="outline">');
    lines.push('                <a href={String(data.cancel_url ?? "")}>Cancel</a>');
    lines.push("              </Button>");
    lines.push('              <Button type="submit" name="submit" value="Submit">Submit</Button>');
    lines.push("            </div>");
    lines.push("          </TgForm>");
    lines.push("        </CardContent>");
    lines.push("      </Card>");
    if (script !== "") {
      lines.push(
        `      <script dangerouslySetInnerHTML={{ __html: ${js(script)} }} />`
      );
    }
    lines.push("    </div>");
    lines.push("  );");
    lines.push("}");
    lines.push("");

    return lines.join("\n");
  }

  private build_manage_view(data: GeneratorContext): string {
    const table = this.build_dynamic_table(data);
    const lines: string[] = [];

    lines.push('import { Flashdata } from "@/engine/ui/Flashdata";');
    if (data.has_searchable) {
      lines.push('import { TgForm } from "@/engine/ui/TgForm";');
    }
    lines.push('import type { TgViewProps } from "@/engine/views-registry";');
    lines.push('import { site_url } from "@/engine/Url";');
    lines.push(
      'import { Pagination } from "@/modules/pagination/PaginationRenderer";'
    );
    lines.push('import { Button } from "@/components/ui/button";');
    lines.push('import { Input } from "@/components/ui/input";');
    lines.push('import { Label } from "@/components/ui/label";');
    lines.push('import { Eye, Pencil, Trash2 } from "lucide-react";');
    lines.push('import { PerPageSelect } from "./PerPageSelect";');
    lines.push("");
    lines.push("/**");
    lines.push(` * Manage ${data.record_name_plural.toLowerCase()}`);
    lines.push(" * Generated by Site Builder (port of donor_manage.php).");
    lines.push(" *");
    lines.push(" * Deviation: the PHP view opened a record-preview modal through");
    lines.push(" * MX; React views link the first summary column to the show page.");
    lines.push(" */");
    lines.push("export default function Manage({ data }: TgViewProps) {");
    lines.push(
      "  const rows = (data.rows ?? []) as Array<Record<string, unknown>>;"
    );
    lines.push(
      "  const pagination_data = (data.pagination_data ?? {}) as Record<string, unknown>;"
    );
    lines.push(
      "  const per_page_options = (data.per_page_options ?? [10, 20, 50, 100]) as number[];"
    );
    lines.push(
      "  const selected_per_page = Number(data.selected_per_page ?? 1);"
    );
    if (data.has_searchable) {
      lines.push(
        '  const search_query = String(data.search_query ?? "");'
      );
      lines.push(
        '  const search_column = String(data.search_column ?? "");'
      );
      lines.push("  const search_active = data.search_active === true;");
    }
    lines.push("");
    lines.push("  return (");
    lines.push('    <div className="space-y-6">');
    lines.push('      <div className="flex flex-wrap items-center justify-between gap-3">');
    lines.push(`        <h1 className="text-lg font-semibold tracking-[-0.01em]">Manage ${ucwords(data.record_name_plural)}</h1>`);
    lines.push("        <Button asChild>");
    lines.push(
      `          <a href={site_url(${js(
        `${data.module_folder_name}/create`
      )})}>Create New ${ucwords(data.record_name_singular)} Record</a>`
    );
    lines.push("        </Button>");
    lines.push("      </div>");
    lines.push("      <Flashdata />");
    if (data.has_searchable) {
      lines.push("      {search_active ? (");
      lines.push('        <p className="text-sm text-muted-foreground">');
      lines.push(
        '          Showing results for <strong className="text-foreground">{search_query}</strong>'
      );
      lines.push("        </p>");
      lines.push("      ) : null}");
    }
    if (data.has_searchable) {
      lines.push('      {rows.length > 9 || search_active ? (');
      lines.push('        <details className="rounded-lg border bg-card p-4 shadow-sm">');
      lines.push(
        `          <summary className="cursor-pointer text-sm font-medium text-primary">Search ${ucwords(
          data.record_name_plural
        )}</summary>`
      );
      lines.push(
        `          <TgForm action=${js(
          `${data.module_folder_name}/submit_search`
        )} id="search-form" className="mt-4 space-y-4">`
      );
      lines.push('            <div className="space-y-2">');
      lines.push('              <Label htmlFor="search_query">Search Query</Label>');
      lines.push(
        '              <Input id="search_query" type="text" name="search_query" placeholder="Enter search term..." defaultValue={search_query} autoComplete="off" />'
      );
      lines.push("            </div>");
      lines.push('            <div className="space-y-2">');
      lines.push('              <Label htmlFor="search_column">Search In</Label>');
      lines.push(
        '              <select id="search_column" name="search_column" defaultValue={search_column} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">'
      );
      lines.push('                <option value="">All searchable fields</option>');
      const options = this.build_searchable_options(data, "                ");
      if (options !== "") lines.push(options);
      lines.push("              </select>");
      lines.push("            </div>");
      lines.push('            <Button type="submit">Search</Button>');
      lines.push("          </TgForm>");
      lines.push("        </details>");
      lines.push("      ) : null}");
    }
    lines.push("      {rows.length === 0 ? (");
    lines.push('        <p className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">There are currently no records to display.</p>');
    lines.push("      ) : (");
    lines.push('        <div className="space-y-4">');
    lines.push("          <Pagination data={pagination_data} />");
    lines.push('          <div className="overflow-x-auto rounded-lg border bg-card">');
    lines.push(table);
    lines.push("          </div>");
    lines.push("          {rows.length > 9 ? (");
    lines.push(
      "            <Pagination data={{ ...pagination_data, include_showing_statement: false }} />"
    );
    lines.push("          ) : null}");
    lines.push("        </div>");
    lines.push("      )}");
    lines.push("    </div>");
    lines.push("  );");
    lines.push("}");
    lines.push("");

    return lines.join("\n");
  }

  private build_show_view(data: GeneratorContext): string {
    const details = this.build_dynamic_details(data);
    const lines: string[] = [];

    lines.push('import { Flashdata } from "@/engine/ui/Flashdata";');
    lines.push('import type { TgViewProps } from "@/engine/views-registry";');
    lines.push('import { site_url } from "@/engine/Url";');
    lines.push('import { Button } from "@/components/ui/button";');
    lines.push(
      'import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";'
    );
    lines.push("");
    lines.push("/**");
    lines.push(` * ${data.record_name_singular} details`);
    lines.push(" * Generated by Site Builder (port of donor_show.php).");
    lines.push(" */");
    lines.push("export default function Show({ data }: TgViewProps) {");
    lines.push("  const update_id = Number(data.update_id ?? 0);");
    lines.push("");
    lines.push("  return (");
    lines.push('    <div className="space-y-6">');
    lines.push('      <h1 className="text-lg font-semibold tracking-[-0.01em]">');
    lines.push('        {String(data.headline ?? "")}');
    lines.push("      </h1>");
    lines.push("      <Flashdata />");
    lines.push("      <Card>");
    lines.push("        <CardHeader>");
    lines.push(`          <CardTitle>${data.record_name_singular} Details</CardTitle>`);
    lines.push("        </CardHeader>");
    lines.push('        <CardContent className="space-y-5">');
    lines.push('          <div className="flex flex-wrap justify-end gap-2">');
    lines.push('            <Button asChild variant="outline">');
    lines.push('              <a href={String(data.back_url ?? "")}>Back</a>');
    lines.push("            </Button>");
    lines.push('            <Button asChild>');
    lines.push(
      `              <a href={site_url(${js(
        `${data.module_folder_name}/create/`
      )} + update_id)}>Edit</a>`
    );
    lines.push("            </Button>");
    lines.push('            <Button asChild variant="destructive">');
    lines.push(
      `              <a href={site_url(${js(
        `${data.module_folder_name}/delete_conf/`
      )} + update_id)}>Delete</a>`
    );
    lines.push("            </Button>");
    lines.push("          </div>");
    lines.push(details);
    lines.push("        </CardContent>");
    lines.push("      </Card>");
    lines.push("    </div>");
    lines.push("  );");
    lines.push("}");
    lines.push("");

    return lines.join("\n");
  }

  private build_delete_conf_view(data: GeneratorContext): string {
    const lines: string[] = [];
    lines.push('import type { TgViewProps } from "@/engine/views-registry";');
    lines.push('import { TgForm } from "@/engine/ui/TgForm";');
    lines.push('import { Button } from "@/components/ui/button";');
    lines.push(
      'import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";'
    );
    lines.push("");
    lines.push("/**");
    lines.push(` * Delete ${data.record_name_singular.toLowerCase()} confirmation`);
    lines.push(" * Generated by Site Builder (port of donor_delete_conf.php).");
    lines.push(" */");
    lines.push("export default function DeleteConf({ data }: TgViewProps) {");
    lines.push("  const update_id = Number(data.update_id ?? 0);");
    lines.push("");
    lines.push("  return (");
    lines.push('    <div className="space-y-6">');
    lines.push('      <h1 className="text-lg font-semibold tracking-[-0.01em]">');
    lines.push('        {String(data.headline ?? "")}');
    lines.push("      </h1>");
    lines.push('      <Card className="border-destructive/40">');
    lines.push("        <CardHeader>");
    lines.push("          <CardTitle>Confirmation Required</CardTitle>");
    lines.push("        </CardHeader>");
    lines.push('        <CardContent className="space-y-4">');
    lines.push('          <p className="font-medium">Are you sure?</p>');
    lines.push(
      `          <p className="text-sm text-muted-foreground">You are about to delete a ${data.record_name_singular.toLowerCase()} record. This cannot be undone. Do you really want to do this?</p>`
    );
    lines.push(`          <TgForm action=${js(
      `${data.module_folder_name}/submit_delete`
    )} params={[update_id]}>`);
    lines.push('            <div className="flex flex-wrap justify-center gap-2 pt-2">');
    lines.push('              <Button asChild variant="outline">');
    lines.push('                <a href={String(data.cancel_url ?? "")}>Cancel</a>');
    lines.push("              </Button>");
    lines.push(
      '              <Button type="submit" name="submit" value="Yes - Delete Now" variant="destructive">Yes - Delete Now</Button>'
    );
    lines.push("            </div>");
    lines.push("          </TgForm>");
    lines.push("        </CardContent>");
    lines.push("      </Card>");
    lines.push("    </div>");
    lines.push("  );");
    lines.push("}");
    lines.push("");
    return lines.join("\n");
  }

  private build_not_found_view(data: GeneratorContext): string {
    return [
      'import type { TgViewProps } from "@/engine/views-registry";',
      'import { Button } from "@/components/ui/button";',
      'import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";',
      "",
      "/**",
      ` * ${data.record_name_singular} not found`,
      " * Generated by Site Builder (port of donor_not_found.php).",
      " */",
      "export default function NotFound({ data }: TgViewProps) {",
      "  return (",
      '    <div className="space-y-6">',
      '      <h1 className="text-lg font-semibold tracking-[-0.01em]">',
      '        {String(data.headline ?? "")}',
      "      </h1>",
      "      <Card>",
      "        <CardHeader>",
      '          <CardTitle>{String(data.headline ?? "")}</CardTitle>',
      "        </CardHeader>",
      '        <CardContent className="space-y-4">',
      '          <p className="text-sm text-muted-foreground">{String(data.message ?? "")}</p>',
      '          <div className="text-center">',
      '            <Button asChild variant="outline">',
      '              <a href={String(data.back_url ?? "")}>',
      '                {String(data.back_label ?? "Go Back")}',
      "              </a>",
      "            </Button>",
      "          </div>",
      "        </CardContent>",
      "      </Card>",
      "    </div>",
      "  );",
      "}",
      "",
    ].join("\n");
  }

  private build_search_modal_view(data: GeneratorContext): string {
    const options = this.build_searchable_options(data, "              ");
    const lines: string[] = [];
    lines.push('import type { TgViewProps } from "@/engine/views-registry";');
    lines.push('import { TgForm } from "@/engine/ui/TgForm";');
    lines.push('import { Button } from "@/components/ui/button";');
    lines.push('import { Input } from "@/components/ui/input";');
    lines.push('import { Label } from "@/components/ui/label";');
    lines.push("");
    lines.push("/**");
    lines.push(
      ` * Search modal form for filtering ${data.record_name_plural.toLowerCase()}.`
    );
    lines.push(" * Generated by Site Builder (port of donor_search_modal.php).");
    lines.push(" */");
    lines.push("export default function SearchModal(_props: TgViewProps) {");
    lines.push("  return (");
    lines.push(`    <TgForm action=${js(
      `${data.module_folder_name}/submit_search`
    )} id="search-form" className="space-y-4">`);
    lines.push('      <div className="space-y-2">');
    lines.push('        <Label htmlFor="search_query">Search Query</Label>');
    lines.push(
      '        <Input id="search_query" type="text" name="search_query" placeholder="Enter search term..." autoComplete="off" />'
    );
    lines.push("      </div>");
    lines.push('      <div className="space-y-2">');
    lines.push('        <Label htmlFor="search_column">Search In</Label>');
    lines.push(
      '        <select id="search_column" name="search_column" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">'
    );
    lines.push('          <option value="">All searchable fields</option>');
    if (options !== "") lines.push(options);
    lines.push("        </select>");
    lines.push("      </div>");
    lines.push('      <Button type="submit">Search</Button>');
    lines.push("    </TgForm>");
    lines.push("  );");
    lines.push("}");
    lines.push("");
    return lines.join("\n");
  }

  /** Generated client component for the records-per-page dropdown. */
  build_per_page_select(): string {
    return [
      '"use client";',
      "",
      'import { BASE_URL } from "@/engine/config";',
      "",
      "/**",
      " * Records-per-page selector — port of the inline setPerPage() script",
      " * from donor_manage.php.",
      " */",
      "export function PerPageSelect({",
      "  options,",
      "  selected,",
      "  module,",
      "}: {",
      "  options: number[];",
      "  selected: number;",
      "  module: string;",
      "}) {",
      '  const base = BASE_URL.endsWith("/") ? BASE_URL : BASE_URL + "/";',
      "",
      "  return (",
      "    <select",
      '      name="per_page"',
      "      defaultValue={String(selected)}",
      "      onChange={(event) => {",
      '        window.location.href = base + module + "/set_per_page/" + event.target.value;',
      "      }}",
      '      className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"',
      "    >",
      "      {options.map((option, index) => (",
      "        <option key={index} value={index}>",
      "          {option}",
      "        </option>",
      "      ))}",
      "    </select>",
      "  );",
      "}",
      "",
    ].join("\n");
  }

  /** Generated view registration map. */
  build_views_index(data: GeneratorContext): string {
    const view_files = [
      "manage",
      "create",
      "show",
      "delete_conf",
      "not_found",
    ];
    if (data.has_searchable) view_files.push("search_modal");

    const lines: string[] = [];
    lines.push('import type { TgViewComponent } from "@/engine/views-registry";');
    lines.push('import Manage from "./manage";');
    lines.push('import Create from "./create";');
    lines.push('import Show from "./show";');
    lines.push('import DeleteConf from "./delete_conf";');
    lines.push('import NotFound from "./not_found";');
    if (data.has_searchable) {
      lines.push('import SearchModal from "./search_modal";');
    }
    lines.push("");
    lines.push("/**");
    lines.push(
      ` * View registration map for the generated ${data.module_folder_name} module.`
    );
    lines.push(" */");
    lines.push("export const views: Record<string, TgViewComponent> = {");
    for (const view_file of view_files) {
      const component =
        view_file === "manage"
          ? "Manage"
          : view_file === "create"
            ? "Create"
            : view_file === "show"
              ? "Show"
              : view_file === "delete_conf"
                ? "DeleteConf"
                : view_file === "search_modal"
                  ? "SearchModal"
                  : "NotFound";
      lines.push(
        `  ${js(`${data.module_folder_name}/${view_file}`)}: ${component},`
      );
    }
    lines.push("};");
    lines.push("");
    return lines.join("\n");
  }

  // =========================================================================
  // Generated SQL (Site_builder::generate_table_sql)
  // =========================================================================

  /**
   * Build the SQLite table definition.
   *
   * Deviation from the PHP original (MySQL): `AUTO_INCREMENT` is expressed as
   * `INTEGER PRIMARY KEY AUTOINCREMENT`; all other column types are accepted
   * by SQLite's type affinity system. The generated file carries a comment
   * explaining the deviation.
   */
  generate_table_sql(data: GeneratorContext): string {
    const columns: string[] = [];
    columns.push("    `id` INTEGER PRIMARY KEY AUTOINCREMENT");

    for (const property of data.posted_properties) {
      const field_name = property.form_field_name;
      const col_type = this.map_property_type_to_sql(property);
      const is_required = property.validation_rules.includes("required");
      const null_clause = is_required
        ? " NOT NULL"
        : NUMERIC_SQL_TYPES.includes(col_type)
          ? " DEFAULT 0"
          : " DEFAULT NULL";

      columns.push(`    \`${field_name}\` ${col_type}${null_clause}`);
    }

    const lines: string[] = [];
    lines.push("-- Generated by Site Builder (Eterc).");
    lines.push("--");
    lines.push(
      "-- SQLite dialect. Deviation from the PHP original (MySQL):"
    );
    lines.push(
      "--   * INT PRIMARY KEY AUTO_INCREMENT -> INTEGER PRIMARY KEY AUTOINCREMENT"
    );
    lines.push(
      "--   * optional numeric columns default to 0 (no-NULL sentinel convention)"
    );
    lines.push("--   * identifiers use backticks, which SQLite accepts");
    lines.push("");
    lines.push(`CREATE TABLE \`${data.module_folder_name}\` (`);
    lines.push(columns.join(",\n"));
    lines.push(");");
    lines.push("");
    return lines.join("\n");
  }

  private map_property_type_to_sql(property: PostedProperty): string {
    switch (property.property_type) {
      case "varchar": {
        const max_length = this.extract_max_length(property.validation_rules);
        return `VARCHAR(${max_length})`;
      }
      case "textarea":
        return "TEXT";
      case "int":
        return "INT";
      case "decimal":
        return "DECIMAL(10,2)";
      case "boolean":
        return "TINYINT(1)";
      case "email":
        return "VARCHAR(255)";
      case "date":
        return "DATE";
      case "time":
        return "TIME";
      case "date and time":
        return "DATETIME";
      default:
        return "VARCHAR(255)";
    }
  }

  /** PHP: extract_max_length(). */
  private extract_max_length(rules: string[]): number {
    for (const rule of rules) {
      if (rule.startsWith("max length[")) {
        const value = extractRuleValue(rule);
        if (value !== "" && /^\d+$/.test(value)) {
          return Number(value);
        }
      }
    }
    return 255;
  }

  // =========================================================================
  // Navigation settings (Site_builder_model::add_nav_menu_link)
  // =========================================================================

  /**
   * Record a navigation link for a newly generated module.
   *
   * The PHP original edited `modules/templates/views/admin.php` directly. The
   * port's admin template is a React component and must not be rewritten by a
   * generator, so the links are appended to
   * `data/settings/site_builder/nav_links.json` instead. The AdminTemplate can
   * read that file to render the entries (external wiring gap).
   *
   * Rules preserved: an empty label adds nothing; an existing link (same
   * module/href) is not duplicated.
   */
  add_nav_menu_link(module_name: string, nav_label: string): boolean {
    if (nav_label === "") return false;

    try {
      const settings_path = data_path(
        "settings",
        "site_builder",
        "nav_links.json"
      );

      let links: Array<Record<string, unknown>> = [];
      if (fs.existsSync(settings_path)) {
        try {
          const parsed: unknown = JSON.parse(
            fs.readFileSync(settings_path, "utf8")
          );
          if (Array.isArray(parsed)) {
            links = parsed.filter(
              (entry): entry is Record<string, unknown> =>
                entry !== null &&
                typeof entry === "object" &&
                !Array.isArray(entry)
            );
          }
        } catch {
          links = [];
        }
      }

      const href = `${module_name}/manage`;
      const exists = links.some(
        (entry) => entry.module === module_name || entry.href === href
      );
      if (exists) return false;

      links.push({
        module: module_name,
        label: nav_label,
        href,
        created_at: new Date().toISOString(),
      });

      fs.writeFileSync(settings_path, JSON.stringify(links, null, 2) + "\n");
      return true;
    } catch {
      return false;
    }
  }
}
