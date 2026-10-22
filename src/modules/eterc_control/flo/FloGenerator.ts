import * as fs from "node:fs";
import * as path from "node:path";
import { db as sharedDb, type Db } from "@/engine/db";
import {
  DATA_DIR,
  GENERATED_MODULES_DIR,
  MODULES_DIR,
  ensure_dir,
} from "@/engine/paths";
import { url_title } from "@/engine/String_service";
import { site_url } from "@/engine/Url";
import type {
  FloArtifacts,
  GeneratedModuleManifest,
  GenerationData,
  GenerationResult,
  PostedProperty,
  PropertyInput,
  TemplateContext,
} from "./FloTypes";
import { renderTemplate, type TemplateData } from "./templates/renderer";
import { js, ucfirst, ucwords } from "./templates/helpers";
import { DONOR_CONTROLLER_TEMPLATE } from "./templates/donor_controller";
import { DONOR_MODEL_TEMPLATE } from "./templates/donor_model";
import { DONOR_MANAGE_TEMPLATE } from "./templates/donor_manage";
import { DONOR_CREATE_TEMPLATE } from "./templates/donor_create";
import { DONOR_SHOW_TEMPLATE } from "./templates/donor_show";
import { DONOR_DELETE_CONF_TEMPLATE } from "./templates/donor_delete_conf";
import { DONOR_NOT_FOUND_TEMPLATE } from "./templates/donor_not_found";
import { DONOR_SEARCH_MODAL_TEMPLATE } from "./templates/donor_search_modal";
import { VIEWS_INDEX_TEMPLATE } from "./templates/views_index";
import { PER_PAGE_SELECT_TEMPLATE } from "./templates/per_page_select";
import { buildValidationTests } from "./templates/dynamic_validation_tests";
import { buildCallbackMethods } from "./templates/dynamic_callback_methods";
import { buildPostedData } from "./templates/dynamic_posted_data";
import { buildPreparedRecord } from "./templates/dynamic_prepared_record";
import { buildValidationMethods } from "./templates/dynamic_validation_methods";
import { buildFormFields } from "./templates/dynamic_form_fields";
import { buildTable } from "./templates/dynamic_table";
import { buildDetails } from "./templates/dynamic_details";
import {
  buildDateConstraintJs,
  needsDateConstraintJs,
} from "./templates/dynamic_date_constraint_js";
import { buildTableSql } from "./templates/table_sql";
import { buildManifest, renderManifest } from "./templates/manifest";
import { buildGeneratedIndex } from "./templates/generated_index";

/**
 * Flo's code-generation engine.
 *
 * Flo is the independent Next.js successor of the PHP site_builder donor
 * pipeline: it normalises the wizard data, renders the donor templates into
 * TypeScript/TSX, writes a complete module under
 * `src/modules/generated/<module>/`, applies the SQLite schema and rebuilds
 * the generated-module index.
 *
 * The generator deliberately does not subclass `Model`: it has no database
 * ownership and is safe to instantiate from tests. A `Db`-compatible object
 * may be injected for schema checks and SQL execution.
 */

export interface FloGeneratorDb {
  table_exists(table: string): boolean;
  query(sql: string, returnType?: "object" | "array" | null): unknown;
}

export interface FloGeneratorOptions {
  /** Root directory for generated modules (defaults to src/modules/generated). */
  target_dir?: string;
  /** Database used for the table-exists check and SQL execution. */
  db?: FloGeneratorDb;
  /** Write the artifacts to disk (default true). */
  write?: boolean;
  /** Execute the generated schema (default: the posted run_sql value). */
  run_sql?: boolean;
  /** Skip the table-exists check (useful for dry runs and tests). */
  check_table?: boolean;
  /** Deterministic timestamp for manifest/index output. */
  now?: Date;
}

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

const MODULE_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;
const ORDER_BY_PATTERN = /^[a-z0-9_]+( DESC)?$/;
const FIELD_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

const RESERVED_NAMES = [
  "config",
  "system",
  "engine",
  "public",
  "templates",
  "assets",
  "modules",
  "welcome",
  "generated",
];

interface RangeProperty {
  start: PostedProperty;
  end: PostedProperty;
}

export class FloGenerator {
  /** Parse the `properties` posted value (JSON string or array). */
  parse_properties(value: unknown): PropertyInput[] {
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
        /* validated separately */
      }
    }

    return [];
  }

  /** Validate the raw properties value before it is normalised. */
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
      if (
        typeof record.propertyName !== "string" ||
        record.propertyName.trim() === ""
      ) {
        return `Item at index ${index} is missing propertyName.`;
      }
      if (
        typeof record.propertyType !== "string" ||
        record.propertyType.trim() === ""
      ) {
        return `Item at index ${index} is missing propertyType.`;
      }
      if (
        record.validationRules !== undefined &&
        !Array.isArray(record.validationRules)
      ) {
        return `Item at index ${index} has an invalid validationRules value.`;
      }
    }

    return null;
  }

  /**
   * Flatten the posted property list, splitting date/time ranges into
   * `<base>_start` / `<base>_end` columns.
   */
  est_posted_properties(
    properties: PropertyInput[] | string | null | undefined
  ): PostedProperty[] {
    const list = this.parse_properties(properties);
    const posted_properties: PostedProperty[] = [];

    for (const property of list) {
      const property_type = asString(property.propertyType).trim();

      if (property_type === "date range" || property_type === "time range") {
        const split = this.splitRangeProperty(
          property,
          property_type === "date range" ? "date" : "time"
        );
        posted_properties.push(split.start, split.end);
        continue;
      }

      posted_properties.push({
        property_name: asString(property.propertyName),
        property_type,
        on_form: asString(property.onForm, "yes"),
        is_searchable: asString(property.isSearchable, "no"),
        on_summary_table: asString(property.onSummaryTable, "no"),
        validation_rules: asStringArray(property.validationRules),
        form_field_name: this.buildFormFieldName(
          asString(property.propertyName)
        ),
      });
    }

    return posted_properties;
  }

  buildFormFieldName(property_name: string): string {
    return url_title(property_name).replace(/-/g, "_");
  }

  private splitRangeProperty(
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
    const labels = this.deriveRangeLabels(base_name);

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

    return {
      start: {
        property_name: labels.start,
        property_type: field_type,
        on_form,
        is_searchable,
        on_summary_table,
        validation_rules: start_rules,
        form_field_name: `${base_field}_start`,
      },
      end: {
        property_name: labels.end,
        property_type: field_type,
        on_form,
        is_searchable,
        on_summary_table,
        validation_rules: end_rules,
        form_field_name: `${base_field}_end`,
      },
    };
  }

  private deriveRangeLabels(name: string): { start: string; end: string } {
    const match = name.match(/^(.+)\s+and\s+(.+)$/i);
    if (match) {
      return { start: match[1].trim(), end: match[2].trim() };
    }
    return { start: `${name} Start`, end: `${name} End` };
  }

  /** Resolve a friendly order-by value to a database column. */
  resolveOrderBy(value: string, posted_properties: PostedProperty[]): string {
    const cleaned = value.trim();
    if (cleaned === "") return "id";

    const descending = cleaned.endsWith(" DESC");
    const base = descending ? cleaned.slice(0, -5).trim() : cleaned;

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

  /** Build the full template context for a generation request. */
  build_context(input: GenerationData): TemplateContext {
    const module_folder_name = String(input.module_folder_name ?? "").trim();
    const properties = this.parse_properties(input.properties);
    const posted_properties = this.est_posted_properties(properties);

    const record_name_singular = String(
      input.record_name_singular ?? module_folder_name
    ).trim() || module_folder_name;
    const record_name_plural = String(
      input.record_name_plural ?? module_folder_name
    ).trim() || record_name_singular;

    const has_searchable = posted_properties.some(
      (property) => property.is_searchable === "yes"
    );
    const searchable_columns = posted_properties
      .filter((property) => property.is_searchable === "yes")
      .map((property) => property.form_field_name);
    const searchable_column_labels: Record<string, string> = {};
    for (const property of posted_properties) {
      if (property.is_searchable === "yes") {
        searchable_column_labels[property.form_field_name] =
          property.property_name;
      }
    }

    const order_by = this.resolveOrderBy(
      String(input.orderBy ?? ""),
      posted_properties
    );
    const url_column = String(input.urlColumn ?? "").trim();
    const table_properties = posted_properties.filter(
      (property) => property.on_summary_table === "yes"
    );

    const controller_name = ucfirst(module_folder_name);
    const model_name = `${controller_name}_model`;
    const singular_comment = record_name_singular.toLowerCase();
    const plural_comment = record_name_plural.toLowerCase();
    const view_files = ["manage", "create", "show", "delete_conf", "not_found"];
    if (has_searchable) view_files.push("search_modal");

    const context: TemplateContext = {
      controller_name,
      model_name,
      module_folder_name,
      record_name_singular,
      record_name_plural,
      record_name_singular_lower: singular_comment,
      record_name_plural_lower: plural_comment,
      singular_comment,
      plural_comment,
      nav_label: String(input.nav_label ?? "").trim(),
      has_searchable,
      has_callbacks: false,
      has_validation_tests: false,
      needs_date_constraint_js: false,
      order_by,
      url_column,
      searchable_columns,
      searchable_columns_literal: searchable_columns.map((c) => js(c)).join(", "),
      searchable_column_labels,
      searchable_options: "",
      posted_properties,
      table_properties,
      dynamic_validation_tests: "",
      dynamic_callback_methods: "",
      dynamic_posted_data: "",
      dynamic_prepared_record: "",
      dynamic_validation_methods: "",
      dynamic_form_fields: "",
      dynamic_table: "",
      dynamic_details: "",
      dynamic_date_constraint_js: "",
      date_constraint_js_literal: '""',
      created_flash_literal: js(
        `${ucfirst(record_name_singular)} created successfully`
      ),
      updated_flash_literal: js(
        `${ucfirst(record_name_singular)} updated successfully`
      ),
      create_headline_literal: js(
        `Create New ${ucwords(record_name_singular)} Record`
      ),
      update_headline_literal: js(
        `Update ${ucwords(record_name_singular)} Record`
      ),
      details_headline_literal: js(
        `${ucwords(record_name_singular)} Details`
      ),
      delete_headline_literal: js(
        `Delete ${ucwords(record_name_singular)} Record`
      ),
      not_found_headline_literal: js(
        `${ucwords(record_name_singular)} Not Found`
      ),
      not_found_message_literal: js(
        `The ${singular_comment} you're looking for doesn't exist or has been deleted.`
      ),
      plural_lower_literal: js(plural_comment),
      view_files,
      client_directive: "",
      properties_json: JSON.stringify(properties),
    };

    // -----------------------------------------------------------------------
    // Precomputed dynamic fragments (PHP: $dynamic_* variables)
    // -----------------------------------------------------------------------
    context.dynamic_validation_tests = buildValidationTests(context);
    context.dynamic_callback_methods = buildCallbackMethods(context);
    context.has_callbacks = context.dynamic_callback_methods !== "";
    context.has_validation_tests = context.dynamic_validation_tests !== "";
    context.dynamic_posted_data = buildPostedData(context);
    context.dynamic_prepared_record = buildPreparedRecord(context);
    context.dynamic_validation_methods = buildValidationMethods(context);
    context.dynamic_form_fields = buildFormFields(context);
    context.dynamic_table = buildTable(context);
    context.dynamic_details = buildDetails(context);
    context.needs_date_constraint_js = needsDateConstraintJs(context);
    context.dynamic_date_constraint_js = buildDateConstraintJs(context);
    context.date_constraint_js_literal =
      context.dynamic_date_constraint_js !== ""
        ? js(context.dynamic_date_constraint_js)
        : '""';
    context.searchable_options = this.buildSearchableOptions(context);

    return context;
  }

  private buildSearchableOptions(context: TemplateContext): string {
    return context.posted_properties
      .filter((property) => property.is_searchable === "yes")
      .map(
        (property) =>
          `              <option value=${js(
            property.form_field_name
          )}>${property.property_name}</option>`
      )
      .join("\n");
  }

  /** Validate a normalised context before any file is written. */
  validate_context(context: TemplateContext): string | null {
    if (context.module_folder_name === "") {
      return "Module could not be generated because no module name was provided.";
    }

    if (!MODULE_NAME_PATTERN.test(context.module_folder_name)) {
      return "Module folder names must start with a lowercase letter and contain only lowercase letters, numbers and underscores.";
    }

    if (RESERVED_NAMES.includes(context.module_folder_name)) {
      return "This module name is reserved and cannot be used.";
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

  /** Convenience validator for a raw request. */
  validate(input: GenerationData): string | null {
    const properties_error = this.validate_properties_input(input.properties);
    if (properties_error !== null) return properties_error;

    let context: TemplateContext;
    try {
      context = this.build_context(input);
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }

    return this.validate_context(context);
  }

  /**
   * Render every artifact in memory.
   *
   * @throws Error when the request is invalid.
   */
  render(input: GenerationData, now = new Date()): FloArtifacts {
    const properties_error = this.validate_properties_input(input.properties);
    if (properties_error !== null) {
      throw new Error(properties_error);
    }

    const context = this.build_context(input);
    const context_error = this.validate_context(context);
    if (context_error !== null) {
      throw new Error(context_error);
    }

    const data = context as unknown as TemplateData;
    const files = new Map<string, string>();

    files.set(
      `${context.controller_name}.ts`,
      renderTemplate(DONOR_CONTROLLER_TEMPLATE, data)
    );
    files.set(
      `${context.model_name}.ts`,
      renderTemplate(DONOR_MODEL_TEMPLATE, data)
    );

    const view_templates: Record<string, string> = {
      manage: DONOR_MANAGE_TEMPLATE,
      create: DONOR_CREATE_TEMPLATE,
      show: DONOR_SHOW_TEMPLATE,
      delete_conf: DONOR_DELETE_CONF_TEMPLATE,
      not_found: DONOR_NOT_FOUND_TEMPLATE,
      search_modal: DONOR_SEARCH_MODAL_TEMPLATE,
    };

    for (const view_file of context.view_files) {
      const template = view_templates[view_file];
      if (template !== undefined) {
        files.set(
          `views/${view_file}.tsx`,
          renderTemplate(template, data)
        );
      }
    }

    files.set(
      "views/PerPageSelect.tsx",
      renderTemplate(PER_PAGE_SELECT_TEMPLATE, data)
    );
    files.set("views/index.ts", renderTemplate(VIEWS_INDEX_TEMPLATE, data));

    const sql = buildTableSql(context);
    files.set(`${context.module_folder_name}.sql`, sql);

    const manifest = buildManifest(context, now.toISOString());
    files.set("manifest.json", renderManifest(manifest));

    return { context, files, sql };
  }

  /**
   * Generate and write a module.
   *
   * The artifacts are first written to a staging directory and moved into
   * place with a single rename, so a partially written module never becomes
   * visible. Existing module directories are never deleted or overwritten.
   */
  generate(
    input: GenerationData,
    options: FloGeneratorOptions = {}
  ): GenerationResult {
    const now = options.now ?? new Date();
    const target_root = options.target_dir ?? GENERATED_MODULES_DIR;
    const write = options.write !== false;

    let artifacts: FloArtifacts;
    try {
      artifacts = this.render(input, now);
    } catch (error) {
      return this.error(
        "Invalid Request",
        error instanceof Error ? error.message : String(error)
      );
    }

    const context = artifacts.context;
    const module_name = context.module_folder_name;
    const target_module_path = path.join(/*turbopackIgnore: true*/ target_root, module_name);
    const source_module_path = path.join(MODULES_DIR, module_name);

    if (fs.existsSync(/*turbopackIgnore: true*/ target_module_path) || fs.existsSync(/*turbopackIgnore: true*/ source_module_path)) {
      return this.error(
        "Module Already Exists",
        `A module named '${module_name}' already exists.`,
        "module-already-exists"
      );
    }

    const run_sql =
      options.run_sql ?? boolValue(input.run_sql, true);
    const check_table = options.check_table !== false;

    if (check_table) {
      const database = options.db ?? (sharedDb as unknown as Db);
      try {
        if (database.table_exists(module_name)) {
          return this.error(
            "Database Table Already Exists",
            `A database table named '${module_name}' already exists.`,
            "table-already-exists"
          );
        }
      } catch (error) {
        return this.error(
          "Database Error",
          `The database could not be inspected: ${
            error instanceof Error ? error.message : String(error)
          }`,
          "database-error"
        );
      }
    }

    if (!write) {
      return {
        status: "success",
        message: "Module rendered successfully (dry run, no files written).",
        module_name,
        files: [...artifacts.files.keys()],
      };
    }

    if (!this.check_write_permissions([target_root])) {
      return this.error(
        "Permissions Error",
        "Module could not be generated because of insufficient file permissions.",
        "file-permissions"
      );
    }

    const staging_path = path.join(
      target_root,
      `.flo-${module_name}-${process.pid}-${now.getTime()}`
    );

    try {
      ensure_dir(target_root);
      ensure_dir(staging_path);
      this.write_files(staging_path, artifacts.files);
      fs.renameSync(staging_path, target_module_path);
    } catch {
      this.remove_directory(staging_path);
      return this.error(
        "Directory Error",
        "Module could not be generated because the generated files could not be written into the modules directory.",
        "file-permissions"
      );
    }

    let written_files = [...artifacts.files.keys()];
    let sql_executed = false;

    if (run_sql) {
      const database = options.db ?? (sharedDb as unknown as Db);
      try {
        database.query(artifacts.sql);
        sql_executed = true;
      } catch (error) {
        return {
          status: "error",
          headline: "SQL Execution Error",
          message: `Module files were generated, but the database table could not be created: ${
            error instanceof Error ? error.message : String(error)
          }`,
          more_info_url: this.moreInfoUrl("sql-execution"),
          module_name,
          files: written_files,
        };
      }

      // SQL ran cleanly: consume the one-shot SQL file.
      try {
        fs.unlinkSync(
          path.join(target_module_path, `${module_name}.sql`)
        );
        written_files = written_files.filter(
          (file) => file !== `${module_name}.sql`
        );
      } catch {
        /* leaving the file in place is harmless */
      }
    }

    // Navigation link (PHP: Site_builder_model::add_nav_menu_link()).
    if (context.nav_label !== "") {
      this.add_nav_menu_link(module_name, context.nav_label);
    }

    // Rebuild the generated-module index so the orchestrator never needs a
    // hand-edited registry entry for each new module.
    try {
      this.rebuild_generated_index(target_root);
    } catch (error) {
      return {
        status: "error",
        headline: "Registration Error",
        message: `The module was generated, but src/modules/generated/index.ts could not be rebuilt: ${
          error instanceof Error ? error.message : String(error)
        }`,
        more_info_url: this.moreInfoUrl("registration"),
        module_name,
        files: written_files,
      };
    }

    return {
      status: "success",
      message:
        "Module generated successfully. Restart the dev server (or wait for it to recompile) before using the generated controller and views." +
        (sql_executed ? "" : " The SQL schema was left in place; run it manually."),
      module_name,
      files: written_files,
    };
  }

  /** List generated modules from their manifests, newest first. */
  list_modules(target_root = GENERATED_MODULES_DIR): GeneratedModuleManifest[] {
    if (!fs.existsSync(target_root)) return [];

    const modules: GeneratedModuleManifest[] = [];
    for (const entry of fs.readdirSync(target_root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

      const manifest_path = path.join(target_root, entry.name, "manifest.json");
      if (fs.existsSync(manifest_path)) {
        try {
          const parsed = JSON.parse(
            fs.readFileSync(manifest_path, "utf8")
          ) as GeneratedModuleManifest;
          if (parsed && typeof parsed === "object") {
            modules.push(parsed);
            continue;
          }
        } catch {
          /* fall through to the folder-derived record */
        }
      }

      const class_name = ucfirst(entry.name);
      if (
        fs.existsSync(path.join(/*turbopackIgnore: true*/ target_root, entry.name, `${class_name}.ts`))
      ) {
        modules.push({
          module_name: entry.name,
          class_name,
          record_name_singular: entry.name,
          record_name_plural: entry.name,
          nav_label: "",
          url_column: "",
          order_by: "id",
          has_searchable: false,
          view_files: ["manage", "create", "show", "delete_conf", "not_found"],
          generated_by: "flo",
          generated_at: "",
        });
      }
    }

    return modules.sort((a, b) =>
      String(b.generated_at).localeCompare(String(a.generated_at))
    );
  }

  /** Rebuild src/modules/generated/index.ts from the modules on disk. */
  rebuild_generated_index(target_root = GENERATED_MODULES_DIR): string {
    ensure_dir(target_root);
    const index_path = path.join(target_root, "index.ts");
    const content = buildGeneratedIndex(this.list_modules(target_root));
    const existing = fs.existsSync(index_path)
      ? fs.readFileSync(index_path, "utf8")
      : "";
    if (existing !== content) {
      fs.writeFileSync(index_path, content, "utf8");
    }
    return index_path;
  }

  /** Check that every path is writable (PHP: check_write_permissions). */
  check_write_permissions(additional_paths: string[] = []): boolean {
    const paths = [MODULES_DIR, GENERATED_MODULES_DIR, ...additional_paths];

    for (const target of paths) {
      if (!fs.existsSync(target)) {
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

  /**
   * Append a navigation link to the port's settings file.
   *
   * The PHP generator edited the admin template directly. The React admin
   * template is code and must not be rewritten by a generator, so links are
   * recorded in the same JSON file site_builder uses. An existing link is not
   * duplicated and an empty label adds nothing.
   */
  add_nav_menu_link(module_name: string, nav_label: string): boolean {
    if (nav_label === "") return false;

    try {
      const settings_dir = path.join(DATA_DIR, "settings", "site_builder");
      ensure_dir(settings_dir);
      const settings_path = path.join(settings_dir, "nav_links.json");

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

  // =========================================================================
  // File helpers
  // =========================================================================

  private write_files(target: string, files: Map<string, string>): void {
    for (const [relative, content] of files) {
      const full_path = path.join(target, relative);
      ensure_dir(path.dirname(full_path));
      fs.writeFileSync(full_path, content, "utf8");
    }
  }

  private remove_directory(directory: string): void {
    try {
      fs.rmSync(directory, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }

  private moreInfoUrl(topic: string): string {
    return `${site_url("eterc_control-flo/home")}#troubleshooting-${topic}`;
  }

  private error(
    headline: string,
    message: string,
    topic?: string
  ): GenerationResult {
    const result: GenerationResult = {
      status: "error",
      headline,
      message,
    };
    if (topic !== undefined) {
      result.more_info_url = this.moreInfoUrl(topic);
    }
    return result;
  }
}

/** PHP truthiness for `run_sql`: absent defaults to true. */
function boolValue(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    return !["", "0", "false", "no", "off"].includes(value.toLowerCase());
  }
  return fallback;
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

export default FloGenerator;
