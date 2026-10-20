import * as fs from "node:fs";
import * as path from "node:path";
import type { ReactNode } from "react";
import { Trongate } from "@/engine/controller";
import { ENV } from "@/engine/config";
import { post } from "@/engine/post";
import {
  DATA_DIR,
  GENERATED_MODULES_DIR,
  MODULES_DIR,
  ensureDir,
} from "@/engine/paths";
import { getContext } from "@/engine/request-context";
import { TgHttpError } from "@/engine/signals";
import type { TgTemplateData } from "@/engine/templates";
import { siteUrl } from "@/engine/url";
import { Site_builder_model } from "./Site_builder_model";
import { FloGenerator } from "../flo/FloGenerator";
import type {
  GenerateModuleInput,
  GenerateModuleResult,
  GeneratorContext,
} from "./types";

/**
 * Site_builder — port of
 * modules/trongate_control/site_builder/Site_builder.php.
 *
 * The PHP controller staged generated files under `site_builder/factory`,
 * renamed the staged directory into `modules/`, executed the generated SQL and
 * removed the one-shot .sql file. The port writes directly into
 * `src/modules/generated/<module>/` (the framework's generated-modules
 * directory), rolls that directory back on unexpected errors, and keeps the
 * .sql file when SQL execution fails so it can be run manually.
 *
 * The generated artifacts are Next.js modules:
 *   <Name>.ts            controller
 *   <Name>_model.ts      model
 *   views/*.tsx          manage / create / show / delete_conf / not_found
 *                        (+ search_modal when a property is searchable)
 *   views/index.ts       view registration map
 *   manifest.json        metadata used by the generated-module index
 *   <module>.sql         SQLite CREATE TABLE (deleted after a clean run)
 *
 * A successful run also rewrites `src/modules/generated/index.ts` and writes a
 * manifest, so the module becomes routable without any hand-edited registry
 * entry (the PHP original relied on its module autoloader).
 *
 * Error result shape mirrors Site_builder::submit_generate_mod():
 *   {status:'error', headline, message, more_info_url?}
 * The troubleshooting URLs intentionally point at the port-only Site Builder
 * status page anchors: the React module-builder wizard surfaces these errors as
 * JSON rather than through Evo's HTML error page.
 */

const POSTED_FIELDS = [
  "module_folder_name",
  "record_name_singular",
  "record_name_plural",
  "nav_label",
  "urlColumn",
  "orderBy",
  "properties",
  "icon_id",
  "icon_code",
  "tempParams",
  "run_sql",
] as const;

export default class Site_builder extends Trongate {
  constructor(moduleName?: string | null) {
    super(moduleName);
    this.model = new Site_builder_model(this.module_name || "site_builder");

    if (ENV.toLowerCase() !== "dev") {
      throw new TgHttpError(
        403,
        "The site builder is only available when the application is running in development mode."
      );
    }
  }

  private builderModel(): Site_builder_model {
    return this.model as Site_builder_model;
  }

  /**
   * Port-only landing page.
   *
   * The PHP module had no page entry point (it is a generation service used by
   * Evo/Flo). The control-panel dashboard links here, so the port renders a
   * short status/help page instead of a 404.
   */
  async index(): Promise<ReactNode> {
    const data: TgTemplateData = {
      viewModule: "site_builder",
      viewFile: "status",
      pageTitle: "Site Builder",
      generated_modules_dir: GENERATED_MODULES_DIR,
      nav_links_path: path.join(
        DATA_DIR,
        "settings",
        "site_builder",
        "nav_links.json"
      ),
    };
    return this.templates.admin(data);
  }

  /**
   * Generate a new module.
   *
   * Accepts a pre-built data array (called by module_builder::run_gen()) or a
   * direct POST/JSON body (backward compatibility with the PHP URL endpoint).
   */
  async submit_generate_mod(
    posted_values: GenerateModuleInput | null = null
  ): Promise<GenerateModuleResult> {
    const posted = posted_values ?? this.get_posted_values();

    // ---------------------------------------------------------------------
    // Validate the request before touching the filesystem.
    // ---------------------------------------------------------------------
    const properties_error = this.builderModel().validate_properties_input(
      posted.properties
    );
    if (properties_error !== null) {
      return this.error("Invalid Request", properties_error);
    }

    let context: GeneratorContext;
    try {
      context = this.builderModel().normalize_input(posted);
    } catch (error) {
      return this.error(
        "Invalid Request",
        error instanceof Error ? error.message : String(error)
      );
    }

    const context_error = this.builderModel().validate_context(context);
    if (context_error !== null) {
      return this.error("Invalid Request", context_error);
    }

    const module_name = context.module_folder_name;

    // ---------------------------------------------------------------------
    // Directory / table / permission checks (PHP parity).
    // ---------------------------------------------------------------------
    ensureDir(GENERATED_MODULES_DIR);

    const target_module_path = context.module_folder_path;
    const source_module_path = path.join(MODULES_DIR, module_name);

    if (
      fs.existsSync(target_module_path) ||
      fs.existsSync(source_module_path)
    ) {
      return this.error(
        "Module Already Exists",
        `A module named '${module_name}' already exists.`,
        "module-already-exists"
      );
    }

    if (this.db.table_exists(module_name)) {
      return this.error(
        "Database Table Already Exists",
        `A database table named '${module_name}' already exists.`,
        "table-already-exists"
      );
    }

    const settings_dir = path.join(DATA_DIR, "settings", "site_builder");
    const wants_nav_link = context.nav_label !== "";

    if (wants_nav_link) {
      ensureDir(settings_dir);
    }

    const additional_paths = wants_nav_link ? [settings_dir] : [];
    if (!this.builderModel().check_write_permissions(additional_paths)) {
      return this.error(
        "Permissions Error",
        wants_nav_link
          ? "Module could not be created because the navigation settings file is not writable. A navigation link for this module cannot be added."
          : "Module could not be created because of insufficient file permissions.",
        "file-permissions"
      );
    }

    // ---------------------------------------------------------------------
    // Generate every source file in memory, then write the module.
    // ---------------------------------------------------------------------
    const files = new Map<string, string>();
    files.set(
      `${context.class_name}.ts`,
      this.builderModel().generate_controller_content(context)
    );
    files.set(
      `${context.class_name}_model.ts`,
      this.builderModel().generate_model_content(context)
    );

    const view_files = ["manage", "create", "show", "delete_conf", "not_found"];
    if (context.has_searchable) view_files.push("search_modal");

    for (const view_file of view_files) {
      files.set(
        `views/${view_file}.tsx`,
        this.builderModel().generate_view_content(view_file, context)
      );
    }

    files.set("views/PerPageSelect.tsx", this.builderModel().build_per_page_select());
    files.set("views/index.ts", this.builderModel().build_views_index(context));
    files.set(`${module_name}.sql`, this.builderModel().generate_table_sql(context));

    let written_files: string[] = [];

    try {
      ensureDir(target_module_path);
      written_files = this.write_files(target_module_path, files);
    } catch (error) {
      // The target directory was created by this request; remove it so a
      // retry can run cleanly (PHP removed its staging directory).
      this.remove_directory(target_module_path);

      return this.error(
        "Directory Error",
        "Module could not be created because the generated files could not be written into the modules directory.",
        "file-permissions"
      );
    }

    // Record the navigation link in the port's settings file. Failure is not
    // fatal (PHP: add_nav_menu_link() returns false and is ignored).
    if (wants_nav_link) {
      this.builderModel().add_nav_menu_link(module_name, context.nav_label);
    }

    // ---------------------------------------------------------------------
    // Execute the generated SQL unless explicitly skipped.
    // ---------------------------------------------------------------------
    if (this.bool_value(posted.run_sql, true)) {
      const sql_file_path = path.join(
        target_module_path,
        `${module_name}.sql`
      );

      try {
        this.db.query(files.get(`${module_name}.sql`) ?? "");
      } catch (error) {
        // Keep the .sql file so it can be run manually (PHP parity). The
        // generated module files remain in place.
        return this.error(
          "SQL Execution Error",
          `Module files were generated, but the database table could not be created: ${
            error instanceof Error ? error.message : String(error)
          }`,
          "sql-execution"
        );
      }

      // SQL ran cleanly: consume the one-shot SQL file.
      try {
        fs.unlinkSync(sql_file_path);
        written_files = written_files.filter(
          (file) => file !== sql_file_path
        );
      } catch {
        /* leaving the file in place is harmless */
      }
    }

    // Persist a manifest so the generated-module index keeps this module's
    // metadata (Flo writes the same file; site_builder originally relied on
    // the PHP autoloader and therefore had no manifest).
    const manifest = {
      module_name,
      class_name: context.class_name,
      record_name_singular: context.record_name_singular,
      record_name_plural: context.record_name_plural,
      nav_label: context.nav_label,
      url_column: context.url_column,
      order_by: context.order_by,
      has_searchable: context.has_searchable,
      view_files,
      generated_by: "site_builder",
      generated_at: new Date().toISOString(),
    };
    const manifest_path = path.join(target_module_path, "manifest.json");
    fs.writeFileSync(manifest_path, JSON.stringify(manifest, null, 2), "utf8");
    written_files.push(manifest_path);

    // Register the module with the static generated index. The PHP original
    // relied on its autoloader scanning modules/; in the port the index must be
    // rewritten or the new module is on disk but not routable.
    try {
      new FloGenerator().rebuild_generated_index(GENERATED_MODULES_DIR);
    } catch (error) {
      return this.error(
        "Registration Error",
        `The module was generated, but src/modules/generated/index.ts could not be rebuilt: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "registration"
      );
    }

    return {
      status: "success",
      message: "Module generated successfully.",
      module_name,
      files: written_files,
    };
  }

  // =========================================================================
  // Request helpers
  // =========================================================================

  /** Read the posted values (JSON body first, then named form fields). */
  private get_posted_values(): GenerateModuleInput {
    const values: Record<string, unknown> = {};
    const json = getContext().json;

    if (json !== null && typeof json === "object" && !Array.isArray(json)) {
      for (const [key, value] of Object.entries(
        json as Record<string, unknown>
      )) {
        if (key !== "csrf_token") values[key] = value;
      }
      return values as GenerateModuleInput;
    }

    for (const field of POSTED_FIELDS) {
      const value = post(field);
      if (value !== "") values[field] = value;
    }

    return values as GenerateModuleInput;
  }

  /**
   * PHP truthiness for `run_sql`: absent defaults to true; "0", "false",
   * "no", "off" and an empty string disable it.
   */
  private bool_value(value: unknown, fallback: boolean): boolean {
    if (value === undefined || value === null) return fallback;
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
      return !["", "0", "false", "no", "off"].includes(value.toLowerCase());
    }
    return fallback;
  }

  // =========================================================================
  // File helpers
  // =========================================================================

  /** Write a map of relative path → content, returning absolute paths. */
  private write_files(target: string, files: Map<string, string>): string[] {
    const written: string[] = [];

    for (const [relative, content] of files) {
      const full_path = path.join(target, relative);
      ensureDir(path.dirname(full_path));
      fs.writeFileSync(full_path, content, "utf8");
      written.push(full_path);
    }

    return written;
  }

  /** Recursively remove a directory (only used for rollback). */
  private remove_directory(directory: string): void {
    try {
      fs.rmSync(directory, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }

  /** Build the PHP-compatible error result. */
  private error(
    headline: string,
    message: string,
    topic?: string
  ): GenerateModuleResult {
    const result: GenerateModuleResult = {
      status: "error",
      headline,
      message,
    };

    if (topic !== undefined) {
      result.more_info_url = `${siteUrl(
        "trongate_control-site_builder"
      )}#troubleshooting-${topic}`;
    }

    return result;
  }
}
