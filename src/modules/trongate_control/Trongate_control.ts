import * as fs from "node:fs";
import * as path from "node:path";
import type { ReactNode } from "react";
import { Trongate } from "@/engine/controller";
import { BASE_URL, ENV } from "@/engine/config";
import { GENERATED_MODULES_DIR, MODULES_DIR } from "@/engine/paths";
import { current_url, get_context, has_context } from "@/engine/request-context";
import { session_get, session_unset } from "@/engine/session";
import { TgHttpError } from "@/engine/signals";
import type { TgTemplateData } from "@/engine/Templates";
import { redirect, segment, site_url } from "@/engine/Url";
import type { Trongate_security } from "@/modules/trongate_security/Trongate_security";
import { Trongate_control_model } from "./Trongate_control_model";
import type { ControlPanelLink, SqlFileInfo } from "./types";

/** Maximum allowed SQL file size in kilobytes (PHP: MAX_SQL_FILE_SIZE_KB). */
const MAX_SQL_FILE_SIZE_KB = 1000;

/**
 * Trongate_control - port of modules/trongate_control/Trongate_control.php.
 *
 * The PHP original is the "Trongate Module Import Wizard": Core.php detects
 * SQL files inside a freshly imported module, stores tg_target_module +
 * tg_return_url in the session and redirects to this module, which lists the
 * SQL files (view / run / delete) through the transferer.js AJAX protocol.
 *
 * Port notes:
 *  - the whole module is dev-mode only (PHP: only manifests() stays available
 *    in any environment). The PHP original loaded the trongate_control-evo
 *    child module and rendered its "disabled" response; evo has not been
 *    ported yet, so the port raises the equivalent 403 response;
 *  - the original view is a standalone HTML document with no child links;
 *    the port also renders a control-panel dashboard (port-only) that links
 *    to the child modules. The dashboard is shown whenever no module import
 *    is pending;
 *  - PHP has no auth guard on this module; every ported admin method calls
 *    trongate_security->make_sure_allowed() like the other admin modules;
 *  - PHP built HTML strings (build_file_list + button helpers) and echoed
 *    them; the port computes SqlFileInfo records and lets views/main.tsx
 *    render the identical markup;
 *  - HTTP responses are transported by the port's JSON API route
 *    (/api/xhr/trongate_control/process); the client reads the `http` field
 *    as the equivalent of the PHP http_response_code().
 */
export default class Trongate_control extends Trongate {
  constructor(moduleName?: string | null) {
    super(moduleName);

    this.model = new Trongate_control_model(this.module_name || "trongate_control");

    // PHP: the manifests() method is accessible in any environment; every
    // other method only runs when ENV is 'dev'.
    if (has_context()) {
      const current_method = String(segment(2) ?? "").toLowerCase();
      if (ENV.toLowerCase() !== "dev" && current_method !== "manifests") {
        throw new TgHttpError(
          403,
          "This feature is only available when the application is running in development mode."
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // Service accessors (PHP: $this->model, $this->trongate_security)
  // -------------------------------------------------------------------------

  /** The module model (PHP: $this->model). */
  private controlModel(): Trongate_control_model {
    return this.model as Trongate_control_model;
  }

  /**
   * The synchronously-registered security service
   * (PHP: $this->trongate_security).
   */
  private securityService(): Trongate_security {
    return (this as unknown as { trongate_security: Trongate_security })
      .trongate_security;
  }

  // -------------------------------------------------------------------------
  // Public controller methods (PHP parity)
  // -------------------------------------------------------------------------

  /**
   * Main entry point (PHP: index()).
   *
   * When a module import is pending (session tg_target_module) the faithful
   * SQL import wizard is rendered; with no SQL files left the original clears
   * the session and redirects to the finish URL, so the port does the same.
   * Otherwise the control-panel dashboard is rendered (port-only; see the
   * class docblock).
   */
  async index(): Promise<ReactNode> {
    this.securityService().make_sure_allowed();
    return this.renderControlPanel();
  }

  /**
   * Port-only alias of index(), so the panel is also reachable as
   * /trongate_control/main.
   */
  async main(): Promise<ReactNode> {
    return this.index();
  }

  /**
   * Output all module manifests as raw JSON (PHP: manifests()).
   *
   * Scans the modules directory for manifest.json files in root module
   * folders (excluding child modules). Stays publicly accessible in any
   * environment so package-management systems can discover modules.
   *
   * PHP echoed the JSON body with a JSON content type; the port returns the
   * pretty-printed JSON string, which the page renderer emits as text.
   */
  manifests(): string {
    const manifests = this.scanForManifests();
    return JSON.stringify(manifests, null, 4);
  }

  /**
   * Handle AJAX POST requests for SQL file operations (PHP: process()).
   *
   * Actions: viewSql, deleteFile, runSql, checkFinish. A request without an
   * action answers 400, exactly like the PHP original.
   */
  async process(): Promise<unknown> {
    this.securityService().make_sure_allowed();

    const data = this.getPostData();

    if (data.action === undefined || data.action === null) {
      throw new TgHttpError(400, "");
    }

    return this.routeAction(data);
  }

  // -------------------------------------------------------------------------
  // Panel / wizard rendering
  // -------------------------------------------------------------------------

  /**
   * Compose the admin page data for views/main.tsx. PHP: index()'s
   * $data assignments (files / current_url / base_url / first_file) plus the
   * dashboard data used by this port.
   */
  private renderControlPanel(): Promise<ReactNode> {
    const target_module = this.getTargetModule();
    const files = target_module === "" ? [] : this.getSqlFiles();

    // PHP parity: no SQL files left -> clear the session and redirect to the
    // finish URL (tg_return_url or BASE_URL). With no pending import the port
    // shows the dashboard instead of redirecting to BASE_URL.
    if (target_module !== "" && files.length === 0) {
      this.finishAndRedirect();
    }

    const import_pending = target_module !== "";

    const data: TgTemplateData = {
      viewModule: this.module_name,
      viewFile: "main",
      pageTitle: import_pending
        ? "Eterc Module Import Wizard"
        : "Eterc Control Panel",
      import_pending,
      target_module,
      files: this.buildFileInfos(files),
      links: this.getControlPanelLinks(),
      api_url: this.getApiUrl(),
      base_url: BASE_URL,
      current_url: current_url(),
      node_version: process.version,
      env: ENV,
    };

    return this.templates.admin(data);
  }

  /**
   * Dashboard data: the control-panel child modules (port-only; the PHP
   * parent module has no dashboard).
   */
  private getControlPanelLinks(): ControlPanelLink[] {
    return [
      {
        href: site_url("trongate_control-flo"),
        label: "Flo",
        description:
          "AI-powered code generator that builds Eterc modules and features.",
      },
      {
        href: site_url("trongate_control-evo"),
        label: "Evo",
        description:
          "The Flo shell - module manager menus and shared code-generation utilities.",
      },
      {
        href: site_url("trongate_control-module_builder"),
        label: "Module Builder",
        description: "Interactive wizard for creating a brand new module.",
      },
      {
        href: site_url("trongate_control-query_builder"),
        label: "Query Builder",
        description:
          "Visual SQL query builder for constructing SELECT queries with joins.",
      },
      {
        href: site_url("trongate_control-site_builder"),
        label: "Site Builder",
        description:
          "Code-generation engine that writes new modules and site sections.",
      },
      {
        href: site_url("trongate_control-module_relations_builder"),
        label: "Module Relations Builder",
        description:
          "Wizard for generating one-to-one, one-to-many and many-to-many relations.",
      },
      {
        href: site_url("trongate_control-image_uploader_builder"),
        label: "Image Uploader Builder",
        description: "Installs a single-image uploader into an existing module.",
      },
      {
        href: site_url("trongate_control-properties_builder"),
        label: "Properties Builder",
        description:
          "Editor for a module's property set (fields, validation rules and SQL columns).",
      },
      {
        href: site_url("trongate_control-plural_maker"),
        label: "Plural Maker",
        description:
          "English pluralisation engine used when naming database tables.",
      },
    ];
  }

  /** API endpoint used by the import wizard's fetch() calls. */
  private getApiUrl(): string {
    const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
    return `${base}api/xhr/trongate_control/process`;
  }

  // -------------------------------------------------------------------------
  // SQL file discovery (PHP: get_sql_files)
  // -------------------------------------------------------------------------

  /** The module whose import is pending (session tg_target_module). */
  private getTargetModule(): string {
    const value = session_get<string>("tg_target_module");
    return typeof value === "string" ? value : "";
  }

  /**
   * Get SQL files from the original module directory.
   *
   * PHP: APPPATH + 'modules/' + $module_name + '/', with the parent/child
   * split when the name holds exactly one hyphen. The port adds a fallback
   * for generated modules (src/modules/generated/<name>), which is where the
   * control panel's generators write new modules.
   */
  private getSqlFiles(): string[] {
    const module_name = this.getTargetModule();

    if (module_name === "") {
      return [];
    }

    const module_path = this.resolveModulePath(module_name);

    if (!fs.existsSync(module_path) || !fs.statSync(module_path).isDirectory()) {
      return [];
    }

    // PHP: glob($module_path . '*.sql') - glob returns sorted matches.
    return fs
      .readdirSync(module_path)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((name) => path.join(module_path, name));
  }

  /** Resolve the directory for a module name (PHP: get_sql_files' path logic). */
  private resolveModulePath(module_name: string): string {
    let module_path = path.join(MODULES_DIR, module_name);

    // Child modules use the "parent-child" form (exactly two bits).
    if (module_name.includes("-")) {
      const bits = module_name.split("-");
      if (bits.length === 2) {
        module_path = path.join(MODULES_DIR, bits[0], bits[1]);
      }
    }

    if (!fs.existsSync(module_path)) {
      const generated_path = path.join(GENERATED_MODULES_DIR, module_name);
      if (fs.existsSync(generated_path)) {
        return generated_path;
      }
    }

    return module_path;
  }

  /**
   * Build the file data consumed by views/main.tsx.
   *
   * PHP: build_file_list() + get_file_action_button(), which read each file,
   * rounded its size to two decimals and ran the model's safety scan. Files
   * above MAX_SQL_FILE_SIZE_KB get the "TOO BIG!" treatment and are never
   * read.
   */
  private buildFileInfos(files: string[]): SqlFileInfo[] {
    const infos: SqlFileInfo[] = [];

    for (const file of files) {
      const filename = path.basename(file);
      const filesize_kb = Math.round((fs.statSync(file).size / 1024) * 100) / 100;
      const too_big = filesize_kb > MAX_SQL_FILE_SIZE_KB;
      const safe = too_big
        ? false
        : this.controlModel().check_sql_safety(fs.readFileSync(file, "utf8"));

      infos.push({ path: file, filename, filesize_kb, safe, too_big });
    }

    return infos;
  }

  // -------------------------------------------------------------------------
  // process() helpers (PHP: get_post_data, route_action, handle_*)
  // -------------------------------------------------------------------------

  /**
   * Read the JSON request body (PHP: file_get_contents('php://input') +
   * json_decode()).
   */
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

  /** Route to the matching action handler (PHP: route_action). */
  private routeAction(data: Record<string, unknown>): unknown {
    switch (data.action) {
      case "viewSql":
        return this.handleViewSql(data);

      case "deleteFile":
        return this.handleDeleteFile(data);

      case "runSql":
        return this.handleRunSql(data);

      case "checkFinish":
        return this.handleCheckFinish();

      default:
        throw new TgHttpError(400, "");
    }
  }

  /**
   * Return the contents of a SQL file for viewing (PHP: handle_view_sql).
   * The response is a plain string (PHP: readfile()).
   */
  private handleViewSql(data: Record<string, unknown>): string {
    if (data.controllerPath === undefined || data.controllerPath === null) {
      throw new TgHttpError(400, "");
    }

    const file_path = String(data.controllerPath);

    if (!fs.existsSync(file_path)) {
      throw new TgHttpError(404, "");
    }

    return fs.readFileSync(file_path, "utf8");
  }

  /**
   * Delete a SQL file (PHP: handle_delete_file). Success answers
   * "Finished."; a failed delete answers 403 with the file path, exactly
   * like the PHP model.
   */
  private handleDeleteFile(data: Record<string, unknown>): string {
    if (data.targetFile === undefined || data.targetFile === null) {
      throw new TgHttpError(400, "");
    }

    const target_file = String(data.targetFile);
    const result = this.controlModel().delete_sql_file(target_file);

    if (result === true) {
      return "Finished.";
    }

    throw new TgHttpError(403, target_file);
  }

  /**
   * Execute SQL code and delete the source file (PHP: handle_run_sql).
   *
   * A database error is returned as text so the client renders it under the
   * "SQL ERROR" heading (PHP surfaced the raw error output the same way).
   * When the SQL ran but the file could not be deleted the original set 403
   * and echoed "Finished." + the file path.
   */
  private handleRunSql(data: Record<string, unknown>): string {
    if (
      data.sqlCode === undefined ||
      data.sqlCode === null ||
      data.targetFile === undefined ||
      data.targetFile === null
    ) {
      throw new TgHttpError(400, "");
    }

    const target_file = String(data.targetFile);

    try {
      this.controlModel().execute_sql(String(data.sqlCode));
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }

    const deleted = this.controlModel().delete_sql_file(target_file);

    if (!deleted) {
      throw new TgHttpError(403, `Finished.${target_file}`);
    }

    return "Finished.";
  }

  /**
   * Report whether more SQL files remain (PHP: handle_check_finish).
   * "reload" keeps the wizard open; otherwise the finish URL is returned.
   */
  private handleCheckFinish(): string {
    const files = this.getSqlFiles();

    if (files.length > 0) {
      return "reload";
    }

    return this.getFinishUrl();
  }

  // -------------------------------------------------------------------------
  // Session helpers (PHP: get_return_url, get_finish_url, finish_and_redirect)
  // -------------------------------------------------------------------------

  /** The URL to return to after processing (session tg_return_url). */
  private getReturnUrl(): string {
    const value = session_get<string>("tg_return_url");
    return typeof value === "string" ? value : "";
  }

  /** tg_return_url when set, otherwise BASE_URL (PHP: get_finish_url). */
  private getFinishUrl(): string {
    const return_url = this.getReturnUrl();

    if (return_url !== "") {
      return return_url;
    }

    return BASE_URL;
  }

  /** Clear the session and redirect (PHP: finish_and_redirect). */
  private finishAndRedirect(): never {
    const finish_url = this.getFinishUrl();

    session_unset("tg_return_url");

    redirect(finish_url);
  }

  // -------------------------------------------------------------------------
  // manifests() helper (PHP: scan_for_manifests)
  // -------------------------------------------------------------------------

  /**
   * Scan module directories for manifest.json files.
   *
   * PHP scans APPPATH + 'modules/' and skips child modules (names containing
   * a hyphen). The port scans the same directory and, additionally, the
   * generated-modules directory (keys are prefixed with "generated/").
   * Invalid JSON is stored with an error message and the raw content, exactly
   * like the PHP original (the message text differs: JS parse errors).
   */
  private scanForManifests(): Record<string, unknown> {
    const manifests: Record<string, unknown> = {};

    const scan_dir = (dir: string, prefix: string): void => {
      if (!fs.existsSync(dir)) return;

      for (const item of fs.readdirSync(dir).sort()) {
        const item_path = path.join(dir, item);

        // Skip non-directories (PHP: is_dir()).
        if (!fs.statSync(item_path).isDirectory()) continue;

        // Skip child modules (those containing a hyphen).
        if (item.includes("-")) continue;

        const manifest_path = path.join(item_path, "manifest.json");

        if (!fs.existsSync(manifest_path)) continue;

        const manifest_content = fs.readFileSync(manifest_path, "utf8");

        try {
          manifests[`${prefix}${item}`] = JSON.parse(manifest_content);
        } catch (error) {
          manifests[`${prefix}${item}`] = {
            error: `Invalid JSON: ${
              error instanceof Error ? error.message : String(error)
            }`,
            raw_content: manifest_content,
          };
        }
      }
    };

    scan_dir(MODULES_DIR, "");
    scan_dir(GENERATED_MODULES_DIR, "generated/");

    return manifests;
  }
}
