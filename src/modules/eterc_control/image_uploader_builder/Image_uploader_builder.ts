import * as fs from "node:fs";
import * as path from "node:path";
import type { ReactNode } from "react";
import ts from "typescript";
import { Eterc } from "@/engine/controller";
import { ENV } from "@/engine/config";
import { csrf_check, csrf_token } from "@/engine/csrf";
import { PROJECT_ROOT } from "@/engine/paths";
import { post, uploaded_files } from "@/engine/post";
import { get_context } from "@/engine/request-context";
import { session_get, session_set, session_unset } from "@/engine/session";
import { EtHttpError } from "@/engine/signals";
import type { EtTemplateData } from "@/engine/Templates";
import { segment, site_url } from "@/engine/Url";
import { register_views } from "@/engine/views-registry";
import Image from "@/modules/image/Image";
import type { Eterc_security } from "@/modules/eterc_security/Eterc_security";
import {
  MAX_MEDIA_BYTES,
  deleteMedia,
  getMedia,
  listMedia,
  mediaFolderSnapshot,
  mediaStats,
  mediaUrl,
  rollbackMedia,
  titleFromName,
  updateMedia,
  upsertMedia,
  type MediaItem,
} from "./media-store";
import {
  deleteCaptureBlock,
  deleteHookBlock,
  panelDataBlock,
  panelExpression,
  panelFetchBlock,
} from "./code_templates";
import {
  Image_uploader_builder_model,
  ucfirst,
  ucwords,
} from "./Image_uploader_builder_model";
import {
  UPLOADER_DEFAULTS,
  type UploaderInjectionItem,
  type UploaderInjectionPlan,
  type UploaderModuleChoice,
  type UploaderWizard,
} from "./types";
import { views } from "./views";

register_views(views);

const WIZARD_SESSION_KEY = "evo_wizard";

const SHOW_FETCH_ANCHOR =
  "    const data = this.moduleModel().get_data_from_db(update_id, true);";

const SHOW_DATA_TAIL_ANCHOR = [
  "      back_url: this.get_back_url(),",
  "      viewModule: this.module_name,",
  '      viewFile: "show",',
].join("\n");

const SHOW_FRAGMENT_END = "\n    </>";

const DELETE_ANCHOR = "    this.moduleModel().delete_record(update_id);";

const RECORD_LOAD_ANCHOR =
  "    const record = this.moduleModel().find_by_id(update_id);";

export default class Image_uploader_builder extends Eterc {
  constructor(moduleName?: string | null) {
    super(moduleName);
    this.model = new Image_uploader_builder_model(
      this.module_name || "image_uploader_builder"
    );

    if (ENV.toLowerCase() !== "dev") {
      throw new EtHttpError(
        403,
        "The image uploader builder is only available when the application is running in development mode."
      );
    }
  }

  // ============================================
  // Shared helpers
  // ============================================

  private uploaderModel(): Image_uploader_builder_model {
    return this.model as Image_uploader_builder_model;
  }

  private securityService(): Eterc_security {
    return (this as unknown as { eterc_security: Eterc_security })
      .eterc_security;
  }

  private isAjax(): boolean {
    return get_context().isAjax;
  }

  private getWizard(): UploaderWizard {
    const wizard = session_get<UploaderWizard>(WIZARD_SESSION_KEY);
    return wizard && typeof wizard === "object" ? wizard : {};
  }

  private saveWizard(wizard: UploaderWizard): void {
    session_set(WIZARD_SESSION_KEY, wizard);
  }

  private renderStep(
    step: string,
    data: Record<string, unknown> = {}
  ): Promise<ReactNode> {
    const templateData: EtTemplateData = {
      ...data,
      viewModule: "image_uploader_builder",
      viewFile: step,
    };
    return this.templates.admin(templateData);
  }

  private moduleLabel(module: string): string {
    return ucwords(module.replace(/_/g, " "));
  }

  private chooseData(error?: string): Record<string, unknown> {
    const data: Record<string, unknown> = {
      modules: this.uploaderModel().get_crud_modules(),
    };
    if (error !== undefined && error !== "") data.error = error;
    return data;
  }

  /** Render or return a step failure, depending on the request type. */
  private failure(
    step: string,
    message: string,
    data: Record<string, unknown> = {}
  ): Promise<ReactNode> | Record<string, unknown> {
    if (this.isAjax()) return { ok: false, error: message };
    return this.renderStep(step, { ...data, error: message });
  }

  // ============================================
  // Wizard entry point
  // ============================================

  /** Convenience route: `/eterc_control-image_uploader_builder`. */
  async index(): Promise<ReactNode | Record<string, unknown>> {
    this.securityService().make_sure_allowed();
    return this.renderStep("media_library", this.mediaLibraryData());
  }

  // ============================================
  // Standalone media library
  // ============================================

  private mediaLibraryData(): Record<string, unknown> {
    const media = listMedia();

    return {
      media,
      stats: mediaStats(media),
      modules: this.uploaderModel().get_crud_modules(),
      csrf_token: csrf_token(),
      upload_url: "/api/media/upload",
      api_root: "/api/xhr/eterc_control-image_uploader_builder",
      uploader_details_url: site_url(
        "eterc_control-image_uploader_builder/uploader_details/web"
      ),
    };
  }

  /** List media for the library's client-side refresh. */
  async list_media(): Promise<Record<string, unknown>> {
    this.securityService().make_sure_allowed();
    const media = listMedia();
    return { ok: true, media, stats: mediaStats(media) };
  }

  /**
   * Upload one image into the standalone library. This is intentionally
   * independent of any CRUD module: it bootstraps the reusable media store
   * that generated modules and the visual site builder can both use.
   */
  async upload_media(): Promise<Record<string, unknown>> {
    this.securityService().make_sure_allowed();
    this.assertCsrf();

    const files = await uploaded_files();
    const uploaded = Object.values(files)[0];

    if (uploaded === undefined) {
      throw new EtHttpError(400, "Choose an image to upload.");
    }

    if (uploaded.size > MAX_MEDIA_BYTES) {
      throw new EtHttpError(
        400,
        `The image is too large. The limit is ${Math.round(
          MAX_MEDIA_BYTES / (1024 * 1024)
        )} MB.`
      );
    }

    const snapshot = mediaFolderSnapshot();

    try {
      const image = new Image();
      const info = await image.upload({
        destination: "uploads/media",
        upload_to_module: false,
        max_width: 2400,
        max_height: 2400,
        thumbnail_dir: "uploads/media/thumbs",
        thumbnail_max_width: 480,
        thumbnail_max_height: 480,
        make_rand_name: true,
      });

      const file_path = info.file_path;
      const stat = fs.statSync(file_path);
      const created_at = new Date().toISOString();

      const item: MediaItem = {
        file: info.file_name,
        original_name: uploaded.originalName,
        title: titleFromName(uploaded.originalName),
        alt: "",
        mime: info.file_type,
        size: stat.size,
        width: 0,
        height: 0,
        created_at,
        url: mediaUrl(info.file_name),
        thumbnail_url: info.thumbnail_path
          ? mediaUrl(info.file_name, true)
          : mediaUrl(info.file_name),
        has_thumbnail: Boolean(info.thumbnail_path),
      };

      upsertMedia(item);
      const saved = getMedia(info.file_name) ?? item;

      return {
        ok: true,
        media: saved,
        stats: mediaStats(),
      };
    } catch (error) {
      rollbackMedia(snapshot);
      throw new EtHttpError(400, this.mediaError(error));
    }
  }

  /** Delete a library image and its thumbnail. */
  async delete_media(): Promise<Record<string, unknown>> {
    this.securityService().make_sure_allowed();
    this.assertCsrf();

    const file = String(post("file") ?? "");
    if (file === "") {
      throw new EtHttpError(400, "No image was specified.");
    }

    if (!deleteMedia(file)) {
      throw new EtHttpError(404, "That image no longer exists.");
    }

    return { ok: true, stats: mediaStats() };
  }

  /** Edit display metadata (title and alternative text). */
  async update_media(): Promise<Record<string, unknown>> {
    this.securityService().make_sure_allowed();
    this.assertCsrf();

    const file = String(post("file") ?? "");
    if (file === "") {
      throw new EtHttpError(400, "No image was specified.");
    }

    const item = updateMedia(file, {
      title: String(post("title") ?? ""),
      alt: String(post("alt") ?? ""),
    });

    if (item === null) {
      throw new EtHttpError(404, "That image no longer exists.");
    }

    return { ok: true, media: item };
  }

  private assertCsrf(): void {
    const token = String(post("csrf_token") ?? "");
    if (!csrf_check(token)) {
      throw new EtHttpError(403, "CSRF token validation failed");
    }
  }

  private mediaError(error: unknown): string {
    let message = error instanceof Error ? error.message : String(error);
    message = message.split(PROJECT_ROOT).join("");
    message = message.replace(/\s+/g, " ").trim();

    if (message.length > 240) {
      message = `${message.slice(0, 237)}...`;
    }

    return message === "" ? "The image could not be uploaded." : message;
  }

  /** Step 1: choose a module; clears stale wizard state. */
  async choose_mod(): Promise<ReactNode | Record<string, unknown>> {
    this.securityService().make_sure_allowed();
    session_unset(WIZARD_SESSION_KEY);

    const data = this.chooseData();

    if (this.isAjax()) {
      return { ok: true, next_step: "choose_mod", modules: data.modules };
    }

    return this.renderStep("choose_mod", data);
  }

  // ============================================
  // Step 2: module -> confirmation
  // ============================================

  async submit_mod(): Promise<ReactNode | Record<string, unknown>> {
    this.securityService().make_sure_allowed();

    const selected = String(post("selected", true) ?? "");
    const module_name = this.uploaderModel().get_eligible_module(selected);

    if (module_name === null) {
      return this.failure(
        "choose_mod",
        "Please choose a module that is ready for an image uploader.",
        this.chooseData()
      );
    }

    if (this.uploaderModel().uploader_exists(module_name)) {
      return this.failure(
        "choose_mod",
        `${this.moduleLabel(module_name)} Already Has an Image Uploader`,
        this.chooseData()
      );
    }

    const wizard: UploaderWizard = {
      module: module_name,
      table: module_name,
      ...UPLOADER_DEFAULTS,
    };
    this.saveWizard(wizard);

    const data = this.confirmationData();
    const modules = this.uploaderModel().get_crud_modules() as UploaderModuleChoice[];

    if (this.isAjax()) {
      return {
        ok: true,
        next_step: "conf_generate_uploader",
        ...data,
        modules,
      };
    }

    return this.renderStep("conf_generate_uploader", {
      ...data,
      modules,
    });
  }

  private confirmationData(): Record<string, unknown> {
    const wizard = this.getWizard();
    const module_name = String(wizard.module ?? "");

    return {
      wizard,
      module_label: this.moduleLabel(module_name),
      uploader_details_url: site_url(
        "eterc_control-image_uploader_builder/uploader_details/web"
      ),
    };
  }

  async conf_generate_uploader(): Promise<
    ReactNode | Record<string, unknown>
  > {
    this.securityService().make_sure_allowed();

    const wizard = this.getWizard();

    if (String(wizard.module ?? "") === "") {
      return this.choose_mod();
    }

    const data = this.confirmationData();

    if (this.isAjax()) {
      return { ok: true, ...data };
    }

    return this.renderStep("conf_generate_uploader", data);
  }

  // ============================================
  // Read-only details overlay
  // ============================================

  async uploader_details(): Promise<ReactNode> {
    this.securityService().make_sure_allowed();

    const wizard = this.getWizard();
    const module_name = String(wizard.module ?? "");

    const after_close_url = site_url(
      "eterc_control-image_uploader_builder/conf_generate_uploader"
    );

    const data: EtTemplateData = {
      viewModule: "image_uploader_builder",
      viewFile: "conf_uploader_details",
      pageTitle: "Image Uploader Details",
      wizard,
      module_label: this.moduleLabel(module_name),
      after_close_url,
      after_close_width: 800,
      after_close_height: 600,
    };

    if (String(segment(3)) === "web") {
      return this.templates.module_details(data);
    }

    return this.templates.admin(data);
  }

  // ============================================
  // Generation
  // ============================================

  async run_gen(): Promise<ReactNode | Record<string, unknown>> {
    this.securityService().make_sure_allowed();

    const wizard = this.getWizard();
    const module_name = String(wizard.module ?? "");

    if (
      module_name === "" ||
      String(wizard.table ?? "") === "" ||
      String(wizard.column ?? "") === ""
    ) {
      return this.generationFailure(
        "The image uploader could not be created because the wizard data is incomplete.",
        wizard
      );
    }

    if (this.uploaderModel().uploader_exists(module_name)) {
      return this.generationFailure(
        `${this.moduleLabel(module_name)} Already Has an Image Uploader`,
        wizard
      );
    }

    let settings_written = false;
    let alter_message: string | null = null;

    try {
      // 1. Guards + injection preflight: every check before any write.
      this.uploaderModel().guard_uploader_ready(wizard);
      const plan = this.preflight(wizard);

      // 2. Idempotent schema change.
      alter_message = this.uploaderModel().apply_column(wizard);

      // 3. Settings only after the column is in place.
      this.uploaderModel().write_settings_file(wizard);
      settings_written = true;

      // 4. Code injection last.
      this.commit(plan);
    } catch (error) {
      if (settings_written) {
        this.uploaderModel().delete_settings_file(module_name);
      }
      const message = error instanceof Error ? error.message : String(error);
      return this.generationFailure(
        `${message}${this.partial_state_note(alter_message)}`,
        wizard
      );
    }

    const settings_path = this.uploaderModel().settings_path(module_name);
    const data = {
      ok: true,
      wizard,
      alter_message,
      settings_path: this.uploaderModel().relative_path(settings_path),
      module_label: this.moduleLabel(module_name),
      module_url: site_url(`${module_name}/manage`),
    };

    if (this.isAjax()) return data;
    return this.renderStep("generate_result", data);
  }

  private generationFailure(
    message: string,
    wizard: UploaderWizard = {}
  ): Promise<ReactNode> | Record<string, unknown> {
    const headline = "Generation Error";
    if (this.isAjax()) return { ok: false, headline, message };
    return this.renderStep("generate_result", {
      error: message,
      headline,
      wizard,
    });
  }

  /**
   * Honest footnote for a failure after the ALTER TABLE. Dropping a column is
   * more dangerous than leaving an unused one; the ALTER is idempotent, so a
   * re-run skips it.
   */
  private partial_state_note(alter_message: string | null): string {
    if (alter_message === null) return "";
    return " The schema step had already run, so the picture column is left in place - that is harmless, and re-running the wizard skips it.";
  }

  // ============================================
  // Injection plan
  // ============================================

  private modulePath(module: string, relative: string): string {
    const dir = this.uploaderModel().get_module_dir(module);
    if (dir === null) {
      throw new Error(
        `Injection aborted: the '${module}' module folder could not be found.`
      );
    }
    return path.join(dir, relative);
  }

  private planItem(
    module: string,
    relative: string,
    item: Omit<UploaderInjectionItem, "path" | "displayPath">
  ): UploaderInjectionItem {
    const absolute = this.modulePath(module, relative);
    return {
      ...item,
      path: absolute,
      displayPath: this.uploaderModel().relative_path(absolute),
    };
  }

  /**
   * Build the injection plan: the picture panel (fetch + data + view call) and
   * the delete capture/removal hooks.
   */
  private build_plan(wizard: UploaderWizard): UploaderInjectionItem[] {
    const module_name = String(wizard.module ?? "");
    const column = String(wizard.column ?? "");
    const controller = `${ucfirst(module_name)}.ts`;
    const show_view = path.join("views", "show.tsx");
    const expression = panelExpression();

    return [
      this.planItem(module_name, controller, {
        anchorKind: "exact",
        anchor: SHOW_FETCH_ANCHOR,
        insert: "after",
        block: panelFetchBlock(module_name),
        marker: "// image_uploader: picture panel fetch",
      }),
      this.planItem(module_name, controller, {
        anchorKind: "exact",
        anchor: SHOW_DATA_TAIL_ANCHOR,
        insert: "after",
        block: panelDataBlock(),
        marker: "// image_uploader: picture panel data",
      }),
      this.planItem(module_name, show_view, {
        anchorKind: "show-tail",
        anchor: "",
        insert: "after",
        block: expression,
        marker: expression,
      }),
      this.planItem(module_name, controller, {
        anchorKind: "exact",
        anchor: DELETE_ANCHOR,
        insert: "before",
        block: deleteCaptureBlock(column),
        marker: "// Image uploader delete hook: capture the picture file name",
        needsRecord: true,
      }),
      this.planItem(module_name, controller, {
        anchorKind: "exact",
        anchor: DELETE_ANCHOR,
        insert: "after",
        block: deleteHookBlock(module_name),
        marker: "// Image uploader delete hook: remove the recorded files",
      }),
    ];
  }

  // ============================================
  // Injection preflight / apply
  // ============================================

  private preflight(wizard: UploaderWizard): UploaderInjectionPlan {
    const items = this.build_plan(wizard);
    const originals: Record<string, string> = {};
    const updates: Record<string, string> = {};

    for (const item of items) {
      if (!fs.existsSync(item.path) || !fs.statSync(item.path).isFile()) {
        throw new Error(
          `Injection aborted: target file does not exist - ${item.displayPath}`
        );
      }

      if (originals[item.path] === undefined) {
        try {
          fs.accessSync(item.path, fs.constants.W_OK);
        } catch {
          throw new Error(
            `Injection aborted: target file is not writable - ${item.displayPath}`
          );
        }

        originals[item.path] = fs.readFileSync(item.path, "utf8");
        updates[item.path] = this.normalize_line_endings(
          originals[item.path]
        );
      }

      const content = originals[item.path];

      if (item.anchorKind === "show-tail") {
        if (item.marker !== "" && content.includes(item.marker)) {
          throw new Error(
            `Injection refused: "${this.excerpt(item.marker)}" is already present in ${item.displayPath} - never double-inject.`
          );
        }
        if (!this.view_tail_is_panel_calls(content)) {
          throw new Error(
            `Injection aborted: the show view does not end with the details card - ${item.displayPath}. The panel belongs after that card; adjust the view or wire the panel manually.`
          );
        }
      } else {
        const count = this.countOccurrences(content, item.anchor);
        if (count !== 1) {
          throw new Error(
            `Injection aborted: anchor "${this.excerpt(item.anchor)}" found ${count} time(s) in ${item.displayPath} (expected exactly 1).`
          );
        }
      }

      if (item.marker !== "" && content.includes(item.marker)) {
        throw new Error(
          `Injection refused: "${this.excerpt(item.marker)}" is already present in ${item.displayPath} - never double-inject.`
        );
      }

      if (item.needsRecord === true) {
        const count = this.countOccurrences(content, RECORD_LOAD_ANCHOR);
        if (count !== 1) {
          throw new Error(
            `Injection aborted: the delete flow in ${item.displayPath} does not match the supported scaffold - expected exactly one record-load line, found ${count}. Wire the delete hook manually.`
          );
        }
      }

      updates[item.path] = this.applyItem(updates[item.path], item);
    }

    for (const [file_path, new_content] of Object.entries(updates)) {
      this.assert_parses(
        new_content,
        this.uploaderModel().relative_path(file_path)
      );
    }

    return { items, originals, updates };
  }

  /**
   * A view straight from the module builder ends with the details card. When a
   * sibling wizard has already appended its own panel expression there, this
   * wizard's expression belongs after it. Anything else in the tail aborts.
   */
  private view_tail_is_panel_calls(content: string): boolean {
    const trimmed = content.trimEnd();
    const card_end = trimmed.lastIndexOf("</div>");
    if (card_end === -1) return false;

    const tail = trimmed.slice(card_end + 6);
    const closing = "\n    </>\n  );\n}";

    if (!tail.endsWith(closing)) return false;

    const between = tail.slice(0, tail.length - closing.length);
    const panel_pattern =
      /^\{data\.[A-Za-z0-9_]+ as import\("react"\)\.ReactNode\}$/;

    for (const line of between.split("\n")) {
      const value = line.trim();
      if (value === "") continue;
      if (!panel_pattern.test(value)) return false;
    }

    return true;
  }

  private applyItem(
    content: string,
    item: UploaderInjectionItem
  ): string {
    if (item.anchorKind === "show-tail") {
      const position = content.lastIndexOf(SHOW_FRAGMENT_END);
      if (position === -1) {
        throw new Error(
          `Injection aborted: fragment closing tag not found in ${item.displayPath}.`
        );
      }
      return (
        content.slice(0, position) +
        "\n" +
        item.block.trimEnd() +
        content.slice(position)
      );
    }

    if (item.insert === "after") {
      return content.replace(
        item.anchor,
        `${item.anchor}\n${item.block.trimEnd()}`
      );
    }

    const position = content.indexOf(item.anchor);
    if (position === -1) {
      throw new Error(
        `Injection aborted: anchor not found in ${item.displayPath}.`
      );
    }

    const line_start = content.lastIndexOf("\n", position - 1) + 1;
    return (
      content.slice(0, line_start) +
      item.block.trimEnd() +
      "\n" +
      content.slice(line_start)
    );
  }

  private commit(plan: UploaderInjectionPlan): void {
    const written: string[] = [];

    try {
      for (const [file_path, new_content] of Object.entries(plan.updates)) {
        fs.writeFileSync(file_path, new_content, "utf8");
        written.push(file_path);
      }
    } catch {
      for (const file_path of written) {
        try {
          fs.writeFileSync(file_path, plan.originals[file_path], "utf8");
        } catch {
          /* best effort rollback */
        }
      }
      throw new Error(
        "Injection failed: a target file could not be written. Every file written by this run has been restored."
      );
    }
  }

  private assert_parses(code: string, file: string): void {
    const result = ts.transpileModule(code, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
      fileName: file.endsWith(".tsx") ? file : `${file}.ts`,
      reportDiagnostics: true,
    });

    const errors = (result.diagnostics ?? []).filter(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
    );

    if (errors.length > 0) {
      const message = ts.flattenDiagnosticMessageText(
        errors[0].messageText,
        " "
      );
      throw new Error(
        `Injection aborted: the generated code for ${file} would not parse (${message}). No files were changed.`
      );
    }
  }

  private normalize_line_endings(content: string): string {
    return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  private countOccurrences(content: string, anchor: string): number {
    if (anchor === "") return 0;
    let count = 0;
    let position = 0;

    while (true) {
      const found = content.indexOf(anchor, position);
      if (found === -1) break;
      count += 1;
      position = found + anchor.length;
    }

    return count;
  }

  private excerpt(value: string): string {
    const one_line = value.replace(/\n/g, " ");
    return one_line.length > 60
      ? `${one_line.slice(0, 57)}...`
      : one_line;
  }
}
