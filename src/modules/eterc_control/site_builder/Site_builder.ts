import * as fs from "node:fs";
import * as path from "node:path";
import type { ReactNode } from "react";
import { Eterc } from "@/engine/controller";
import { ENV } from "@/engine/config";
import { csrf_check, csrf_token } from "@/engine/csrf";
import { post } from "@/engine/post";
import {
  DATA_DIR,
  GENERATED_MODULES_DIR,
  MODULES_DIR,
  ensure_dir,
} from "@/engine/paths";
import { get_context } from "@/engine/request-context";
import { EtHttpError } from "@/engine/signals";
import type { EtTemplateData } from "@/engine/Templates";
import { site_url } from "@/engine/Url";
import { Site_builder_model } from "./Site_builder_model";
import { FloGenerator } from "../flo/FloGenerator";
import {
  deletePage,
  duplicatePage,
  ensureStarterPage,
  getPage,
  listPages,
  savePage,
} from "./page-store";
import type {
  GenerateModuleInput,
  GenerateModuleResult,
  GeneratorContext,
} from "./types";
import type { Eterc_security } from "@/modules/eterc_security/Eterc_security";

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

export default class Site_builder extends Eterc {
  constructor(moduleName?: string | null) {
    super(moduleName);
    this.model = new Site_builder_model(this.module_name || "site_builder");

    if (ENV.toLowerCase() !== "dev") {
      throw new EtHttpError(
        403,
        "The site builder is only available when the application is running in development mode."
      );
    }
  }

  private builderModel(): Site_builder_model {
    return this.model as Site_builder_model;
  }
  async index(): Promise<ReactNode> {
    this.securityService().make_sure_allowed();

    const all_pages = ensureStarterPage();
    const initial_page =
      [...all_pages].sort(
        (left, right) =>
          Date.parse(right.updated_at) - Date.parse(left.updated_at)
      )[0] ?? all_pages[0];

    const data: EtTemplateData = {
      viewModule: "site_builder",
      viewFile: "studio",
      pageTitle: "Site Builder",
      pages: listPages(),
      page: initial_page,
      csrf_token: csrf_token(),
      api_root: "/api/xhr/eterc_control-site_builder",
      public_base: "/pages",
      media_api_root: "/api/xhr/eterc_control-image_uploader_builder",
      media_library_url: site_url("eterc_control-image_uploader_builder"),
      module_generator_url: site_url(
        "eterc_control-site_builder/module_generator"
      ),
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

  /** The original module-generator status page, kept as a secondary view. */
  async module_generator(): Promise<ReactNode> {
    this.securityService().make_sure_allowed();

    const data: EtTemplateData = {
      viewModule: "site_builder",
      viewFile: "status",
      pageTitle: "Module Generator",
      generated_modules_dir: GENERATED_MODULES_DIR,
      nav_links_path: path.join(
        DATA_DIR,
        "settings",
        "site_builder",
        "nav_links.json"
      ),
      studio_url: site_url("eterc_control-site_builder"),
    };
    return this.templates.admin(data);
  }

  // =========================================================================
  // Visual page builder API
  // =========================================================================

  async pages(): Promise<Record<string, unknown>> {
    this.securityService().make_sure_allowed();
    const all_pages = ensureStarterPage();
    return {
      ok: true,
      pages: listPages(),
      page: all_pages[0] ?? null,
    };
  }

  async load_page(): Promise<Record<string, unknown>> {
    this.securityService().make_sure_allowed();

    const id = String(post("id") ?? "");
    const page = id === "" ? null : getPage(id);
    if (page === null) {
      throw new EtHttpError(404, "That page could not be found.");
    }

    return { ok: true, page };
  }

  async save_page(): Promise<Record<string, unknown>> {
    this.securityService().make_sure_allowed();
    this.assertCsrf();

    const input = post("page");
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      throw new EtHttpError(400, "The page is not valid.");
    }

    let saved;
    try {
      saved = savePage(input);
    } catch (error) {
      throw new EtHttpError(
        400,
        error instanceof Error ? error.message : "The page could not be saved."
      );
    }

    return { ok: true, page: saved, pages: listPages() };
  }

  async duplicate_page(): Promise<Record<string, unknown>> {
    this.securityService().make_sure_allowed();
    this.assertCsrf();

    const id = String(post("id") ?? "");
    const copy = id === "" ? null : duplicatePage(id);
    if (copy === null) {
      throw new EtHttpError(404, "That page could not be found.");
    }

    return { ok: true, page: copy, pages: listPages() };
  }

  async delete_page(): Promise<Record<string, unknown>> {
    this.securityService().make_sure_allowed();
    this.assertCsrf();

    const id = String(post("id") ?? "");
    if (id === "" || !deletePage(id)) {
      throw new EtHttpError(404, "That page could not be found.");
    }

    const remaining = ensureStarterPage();
    return {
      ok: true,
      pages: listPages(),
      page: remaining[0] ?? null,
    };
  }

  private assertCsrf(): void {
    const token = String(post("csrf_token") ?? "");
    if (!csrf_check(token)) {
      throw new EtHttpError(403, "CSRF token validation failed");
    }
  }

  private securityService(): Eterc_security {
    return (this as unknown as { eterc_security: Eterc_security })
      .eterc_security;
  }

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

    ensure_dir(GENERATED_MODULES_DIR);

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
      ensure_dir(settings_dir);
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
      ensure_dir(target_module_path);
      written_files = this.write_files(target_module_path, files);
    } catch {
      this.remove_directory(target_module_path);

      return this.error(
        "Directory Error",
        "Module could not be created because the generated files could not be written into the modules directory.",
        "file-permissions"
      );
    }

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
    const json = get_context().json;

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
      ensure_dir(path.dirname(full_path));
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
      result.more_info_url = `${site_url(
        "eterc_control-site_builder/module_generator"
      )}#troubleshooting-${topic}`;
    }

    return result;
  }
}
