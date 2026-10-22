import * as fs from "node:fs";
import * as path from "node:path";
import type { ReactNode } from "react";
import { Eterc } from "@/engine/controller";
import { BASE_URL, ENV } from "@/engine/config";
import { GENERATED_MODULES_DIR, MODULES_DIR } from "@/engine/paths";
import { current_url, get_context, has_context } from "@/engine/request-context";
import { session_get, session_unset } from "@/engine/session";
import { EtHttpError } from "@/engine/signals";
import type { EtTemplateData } from "@/engine/Templates";
import { redirect, segment, site_url } from "@/engine/Url";
import type { Eterc_security } from "@/modules/eterc_security/Eterc_security";
import { Eterc_control_model } from "./Eterc_control_model";
import type { ControlPanelLink, SqlFileInfo } from "./types";
const MAX_SQL_FILE_SIZE_KB = 1000;
export default class Eterc_control extends Eterc {
  constructor(moduleName?: string | null) {
    super(moduleName);

    this.model = new Eterc_control_model(this.module_name || "eterc_control");

    if (has_context()) {
      const current_method = String(segment(2) ?? "").toLowerCase();
      if (ENV.toLowerCase() !== "dev" && current_method !== "manifests") {
        throw new EtHttpError(
          403,
          "This feature is only available when the application is running in development mode."
        );
      }
    }
  }

  private controlModel(): Eterc_control_model {
    return this.model as Eterc_control_model;
  }
  private securityService(): Eterc_security {
    return (this as unknown as { eterc_security: Eterc_security })
      .eterc_security;
  }

  async index(): Promise<ReactNode> {
    this.securityService().make_sure_allowed();
    return this.renderControlPanel();
  }

  /**
   * Convenience alias of index(), so the panel is also reachable as
   * /eterc_control/main.
   */
  async main(): Promise<ReactNode> {
    return this.index();
  }
  manifests(): string {
    const manifests = this.scanForManifests();
    return JSON.stringify(manifests, null, 4);
  }
  async process(): Promise<unknown> {
    this.securityService().make_sure_allowed();

    const data = this.getPostData();

    if (data.action === undefined || data.action === null) {
      throw new EtHttpError(400, "");
    }

    return this.routeAction(data);
  }

  // -------------------------------------------------------------------------
  // Panel / wizard rendering
  // -------------------------------------------------------------------------
  private renderControlPanel(): Promise<ReactNode> {
    const target_module = this.getTargetModule();
    const files = target_module === "" ? [] : this.getSqlFiles();

    if (target_module !== "" && files.length === 0) {
      this.finishAndRedirect();
    }

    const import_pending = target_module !== "";

    const data: EtTemplateData = {
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
  private getControlPanelLinks(): ControlPanelLink[] {
    return [
      {
        href: site_url("eterc_control-flo"),
        label: "Flo",
        description:
          "AI-powered code generator that builds Eterc modules and features.",
      },
      {
        href: site_url("eterc_control-evo"),
        label: "Evo",
        description:
          "The Flo shell - module manager menus and shared code-generation utilities.",
      },
      {
        href: site_url("eterc_control-module_builder"),
        label: "Module Builder",
        description: "Interactive wizard for creating a brand new module.",
      },
      {
        href: site_url("eterc_control-query_builder"),
        label: "Query Builder",
        description:
          "Visual SQL query builder for constructing SELECT queries with joins.",
      },
      {
        href: site_url("eterc_control-site_builder"),
        label: "Site Builder",
        description:
          "Visual block editor for composing and publishing Next.js pages.",
      },
      {
        href: site_url("eterc_control-module_relations_builder"),
        label: "Module Relations Builder",
        description:
          "Wizard for generating one-to-one, one-to-many and many-to-many relations.",
      },
      {
        href: site_url("eterc_control-image_uploader_builder"),
        label: "Image Uploader Builder",
        description:
          "Standalone media library plus an optional uploader installer for generated modules.",
      },
      {
        href: site_url("eterc_control-properties_builder"),
        label: "Properties Builder",
        description:
          "Editor for a module's property set (fields, validation rules and SQL columns).",
      },
      {
        href: site_url("eterc_control-plural_maker"),
        label: "Plural Maker",
        description:
          "Pluralizer and phrasebook for localizing generated labels and validation messages.",
      },
    ];
  }

  /** API endpoint used by the import wizard's fetch() calls. */
  private getApiUrl(): string {
    const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
    return `${base}api/xhr/eterc_control/process`;
  }


  /** The module whose import is pending (session et_target_module). */
  private getTargetModule(): string {
    const value = session_get<string>("et_target_module");
    return typeof value === "string" ? value : "";
  }
  private getSqlFiles(): string[] {
    const module_name = this.getTargetModule();

    if (module_name === "") {
      return [];
    }

    const module_path = this.resolveModulePath(module_name);

    if (!fs.existsSync(module_path) || !fs.statSync(module_path).isDirectory()) {
      return [];
    }

    return fs
      .readdirSync(module_path)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((name) => path.join(module_path, name));
  }
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
        throw new EtHttpError(400, "");
    }
  }
  private handleViewSql(data: Record<string, unknown>): string {
    if (data.controllerPath === undefined || data.controllerPath === null) {
      throw new EtHttpError(400, "");
    }

    const file_path = String(data.controllerPath);

    if (!fs.existsSync(file_path)) {
      throw new EtHttpError(404, "");
    }

    return fs.readFileSync(file_path, "utf8");
  }
  private handleDeleteFile(data: Record<string, unknown>): string {
    if (data.targetFile === undefined || data.targetFile === null) {
      throw new EtHttpError(400, "");
    }

    const target_file = String(data.targetFile);
    const result = this.controlModel().delete_sql_file(target_file);

    if (result === true) {
      return "Finished.";
    }

    throw new EtHttpError(403, target_file);
  }
  private handleRunSql(data: Record<string, unknown>): string {
    if (
      data.sqlCode === undefined ||
      data.sqlCode === null ||
      data.targetFile === undefined ||
      data.targetFile === null
    ) {
      throw new EtHttpError(400, "");
    }

    const target_file = String(data.targetFile);

    try {
      this.controlModel().execute_sql(String(data.sqlCode));
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }

    const deleted = this.controlModel().delete_sql_file(target_file);

    if (!deleted) {
      throw new EtHttpError(403, `Finished.${target_file}`);
    }

    return "Finished.";
  }
  private handleCheckFinish(): string {
    const files = this.getSqlFiles();

    if (files.length > 0) {
      return "reload";
    }

    return this.getFinishUrl();
  }


  /** The URL to return to after processing (session et_return_url). */
  private getReturnUrl(): string {
    const value = session_get<string>("et_return_url");
    return typeof value === "string" ? value : "";
  }
  private getFinishUrl(): string {
    const return_url = this.getReturnUrl();

    if (return_url !== "") {
      return return_url;
    }

    return BASE_URL;
  }
  private finishAndRedirect(): never {
    const finish_url = this.getFinishUrl();

    session_unset("et_return_url");

    redirect(finish_url);
  }

  private scanForManifests(): Record<string, unknown> {
    const manifests: Record<string, unknown> = {};

    const scan_dir = (dir: string, prefix: string): void => {
      if (!fs.existsSync(dir)) return;

      for (const item of fs.readdirSync(dir).sort()) {
        const item_path = path.join(dir, item);

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
