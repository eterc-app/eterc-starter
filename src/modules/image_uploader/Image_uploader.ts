import * as fs from "node:fs";
import * as path from "node:path";
import type { ReactNode } from "react";
import { Eterc } from "@/engine/controller";
import { BASE_URL } from "@/engine/config";
import { csrf_token } from "@/engine/csrf";
import { set_flashdata } from "@/engine/Flashdata";
import { post } from "@/engine/post";
import { PROJECT_ROOT } from "@/engine/paths";
import { get_context, segment } from "@/engine/request-context";
import { make_rand_str } from "@/engine/String_service";
import { EtHttpError } from "@/engine/signals";
import { redirect } from "@/engine/Url";
import { block_url } from "@/modules/utilities/Utilities";
import { moduleAssetsDir } from "@/modules/file/upload-paths";
import Image, { type ImageUploadConfig, type ImageUploadInfo } from "@/modules/image/Image";
import {
  Image_uploader_model,
  type UploaderSettings,
} from "./Image_uploader_model";
import type { Eterc_security } from "@/modules/eterc_security/Eterc_security";

/**
 * Image_uploader controller — runtime for generated single-image features.
 * Port of modules/image_uploader/Image_uploader.php.
 *
 * Surface (same public method names as PHP):
 *   draw_panel        — renders the show-page "Picture" card (block_url'd);
 *   render_panel_body — renders the card's live region from X-* headers;
 *   upload_form       — dedicated upload page (plain multipart form);
 *   submit_upload     — POST handler: validates, uploads, updates the row;
 *   remove_picture    — removes the picture in place (CSRF-gated);
 *   delete_files      — delete hook helper (block_url'd, internal only).
 *
 * Port adaptations (documented):
 *   - the PHP MX live fetch of the panel body does not exist in the port;
 *     draw_panel renders the full card server-side, and remove_picture
 *     re-renders the same region for the client component that posts it;
 *   - `http_response_code(400/422) + echo` becomes EtHttpError, which the
 *     dispatcher renders with the equivalent status (the 422 JSON bodies
 *     become the standard error reply of the etSubmit server action);
 *   - the upload POST is submitted through <EtForm> (multipart server
 *     action), the port's equivalent of the dedicated multipart page.
 */

/** Allowed stored extensions for each sniffed image MIME type. */
const IMAGE_EXTENSIONS: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/jpg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/gif": ["gif"],
  "image/webp": ["webp"],
};

export default class Image_uploader extends Eterc {
  constructor(moduleName?: string | null) {
    super(moduleName);
    this.model = new Image_uploader_model(this.module_name || "image_uploader");
  }

  // -------------------------------------------------------------------------
  // Service accessors (PHP: $this->model, $this->eterc_security)
  // -------------------------------------------------------------------------

  private uploaderModel(): Image_uploader_model {
    return this.model as Image_uploader_model;
  }

  private securityService(): Eterc_security {
    return (this as unknown as { eterc_security: Eterc_security })
      .eterc_security;
  }

  // =========================================================================
  // Show-page panel (Modules::run from the target module's show view)
  // =========================================================================

  /**
   * Render the "Picture" card on a generated show page.
   *
   * Renders nothing when no uploader is configured for that module, when
   * there is no record id in the URL, or when the record does not exist —
   * the show page must look exactly as if this call had never been made.
   */
  async draw_panel(module_name?: string | null): Promise<ReactNode> {
    block_url("image_uploader/draw_panel");

    const module = String(module_name ?? segment(1) ?? "").toLowerCase();
    const update_id = Number(segment(3, "int"));

    const settings = this.uploaderModel().get_uploader_settings(module);

    if (settings === null || update_id === 0) {
      return null; // No uploader configured — render nothing.
    }

    const panel_id = make_rand_str(16);
    const data = this.panel_data(settings, module, update_id, panel_id);

    if (data === null) {
      return null; // The record does not exist — render nothing.
    }

    return this.view("image_uploader/picture_panel", data);
  }

  /**
   * Render the panel's live region (picture state + actions).
   *
   * Session-authenticated like every admin page. The X-* custom headers
   * carry the panel context (module, record id, panel id). Responds with
   * HTTP 400 (PHP set the status and rendered nothing) when required
   * context is missing or malformed, or when no uploader is configured.
   */
  async render_panel_body(): Promise<ReactNode> {
    this.securityService().make_sure_allowed();

    const headers = get_context().headers;
    const module = String(headers.get("x-module") ?? "").toLowerCase();
    const update_id_header = headers.get("x-update-id");
    const update_id =
      update_id_header !== null ? Number.parseInt(update_id_header, 10) || 0 : 0;
    const panel_id = String(headers.get("x-panel-id") ?? "");

    if (module === "" || update_id === 0 || !this.valid_panel_id(panel_id)) {
      throw new EtHttpError(400, "Invalid panel request.");
    }

    const settings = this.uploaderModel().get_uploader_settings(module);

    if (settings === null) {
      throw new EtHttpError(400, "Invalid panel request.");
    }

    const data = this.panel_data(settings, module, update_id, panel_id);

    if (data === null) {
      throw new EtHttpError(400, "Invalid panel request.");
    }

    return this.view("image_uploader/panel_body", data);
  }

  // =========================================================================
  // Dedicated upload page + POST handler
  // =========================================================================

  /**
   * Dedicated upload page for one record:
   * image_uploader/upload_form/{module}/{update_id}
   */
  async upload_form(): Promise<ReactNode> {
    this.securityService().make_sure_allowed();

    const module = String(segment(3) ?? "").toLowerCase();
    const update_id = Number(segment(4, "int"));

    return this.render_upload_form(module, update_id, true);
  }

  /**
   * Handle the multipart upload POST.
   *
   * Validates the submitted file against the settings caps (required,
   * max_size, max_width, max_height), uploads through the Image module
   * (content-sniffed MIME, downscale-to, optional thumbnail, extension
   * decided from the sniffed MIME), re-asserts the extension policy via
   * enforce_file_extension() and stores the file name in the target column.
   *
   * Replacing: the old main + thumb files are deleted only AFTER the new
   * upload has fully succeeded — a failed upload never destroys the
   * existing picture.
   */
  async submit_upload(): Promise<ReactNode> {
    this.securityService().make_sure_allowed();

    const module = String(post("module") ?? "").toLowerCase();
    const update_id = Number(post("update_id") ?? 0);

    const settings = this.uploaderModel().get_uploader_settings(module);

    if (settings === null || update_id === 0) {
      this.not_configured();
    }

    await this.validation.set_rules(
      "picture",
      "picture",
      `required|max_size[${settings.max_size}]|max_width[${settings.max_width}]|max_height[${settings.max_height}]`
    );

    if ((await this.validation.run()) !== true) {
      // PHP re-rendered the full upload page; the port re-renders the bare
      // view so <EtForm> can swap its own subtree while showing the errors.
      return this.render_upload_form(module, update_id, false);
    }

    const old_file_name = this.uploaderModel().get_picture_file_name(
      module,
      settings.column,
      update_id
    );

    if (old_file_name === null) {
      redirect(`${module}/manage`);
    }

    // No-partial-state guarantee: remember exactly what is in the record's
    // folder before the upload starts, so a failure at ANY later point can
    // remove precisely what this attempt created.
    const folder = this.record_folder(settings, module, update_id);
    const before = this.folder_contents(folder);

    const config: ImageUploadConfig = {
      destination: `${settings.destination}/${update_id}`,
      upload_to_module: true,
      target_module: module,
      max_width: settings.resize_max_width,
      max_height: settings.resize_max_height,
      make_rand_name: true,
    };

    if (settings.thumbnails === true) {
      config.thumbnail_dir = `${settings.destination}/${update_id}/thumbs`;
      config.thumbnail_max_width = settings.thumbnail_max_width;
      config.thumbnail_max_height = settings.thumbnail_max_height;
    }

    let file_info: ImageUploadInfo;

    try {
      const image = new Image();
      file_info = await image.upload(config);
    } catch (error) {
      this.upload_failed(module, update_id, folder, before, this.public_message(error));
    }

    // Extension policy: the stored file must carry an extension that
    // matches the MIME type sniffed from its CONTENT (main + thumbnail
    // together), or the upload fails and the files are removed.
    const enforced = this.enforce_file_extension(file_info);
    const new_file_name = enforced.name;

    if (new_file_name === "") {
      this.upload_failed(module, update_id, folder, before, enforced.error);
    }

    this.uploaderModel().set_picture_file_name(
      module,
      settings.column,
      update_id,
      new_file_name
    );

    // Replace: old files are removed only now that the new upload has fully
    // succeeded and been recorded.
    if (old_file_name !== "" && old_file_name !== new_file_name) {
      this.delete_recorded_files(settings, module, update_id, old_file_name);
    }

    set_flashdata("The picture was successfully uploaded");
    redirect(`${module}/show/${update_id}`);
  }

  // =========================================================================
  // Remove (CSRF-gated)
  // =========================================================================

  /**
   * Remove the record's picture in place.
   *
   * Session-authenticated + CSRF-gated via validation.run(). The recorded
   * main + thumb files are deleted (exact recorded names only) and the
   * column is cleared to ''. The response is the re-rendered panel region,
   * which the client component swaps in without a page reload.
   *
   * Business-rule failures raise EtHttpError(422) — the PHP original
   * responded with a 422 JSON {ok, message} body; the port's server action
   * surfaces the same status and message to the client.
   */
  async remove_picture(): Promise<ReactNode> {
    this.securityService().make_sure_allowed();
    await this.validation.run(); // CSRF gate

    const module = String(post("module") ?? "").toLowerCase();
    const update_id = Number(post("update_id") ?? 0);
    const panel_id = String(post("panel_id") ?? "");

    if (!this.valid_panel_id(panel_id)) {
      throw new EtHttpError(422, "Invalid panel identifier.");
    }

    const settings = this.uploaderModel().get_uploader_settings(module);

    if (settings === null || update_id === 0) {
      throw new EtHttpError(422, "Invalid removal parameters.");
    }

    const file_name = this.uploaderModel().get_picture_file_name(
      module,
      settings.column,
      update_id
    );

    if (file_name === null) {
      throw new EtHttpError(422, "The record could not be found.");
    }

    if (file_name !== "") {
      this.delete_recorded_files(settings, module, update_id, file_name);
      this.uploaderModel().set_picture_file_name(module, settings.column, update_id, "");
    }

    const data = this.panel_data(settings, module, update_id, panel_id);

    if (data === null) {
      throw new EtHttpError(422, "The panel could not be rendered.");
    }

    return this.view("image_uploader/panel_body", data);
  }

  // =========================================================================
  // Delete hook (Modules::run from the target module's delete flow)
  // =========================================================================

  /**
   * Delete the recorded picture files for a deleted record.
   *
   * Internal endpoint: public + block_url() + Modules::run only, so a
   * direct URL hit is rejected. No-op (silent) when the file name is empty
   * or the settings no longer exist.
   */
  delete_files(params: Record<string, unknown> = {}): void {
    block_url("image_uploader/delete_files");

    const module = String(params.module_name ?? "").toLowerCase();
    const update_id = Number(params.update_id ?? 0);
    const file_name = String(params.file_name ?? "");

    if (module === "" || update_id === 0 || file_name === "") {
      return;
    }

    const settings = this.uploaderModel().get_uploader_settings(module);

    if (settings === null) {
      return;
    }

    this.delete_recorded_files(settings, module, update_id, file_name);
  }

  // =========================================================================
  // Internal helpers
  // =========================================================================

  /**
   * Assemble the view data for the panel's live region. Returns null when
   * the record no longer exists.
   */
  private panel_data(
    settings: UploaderSettings,
    module: string,
    update_id: number,
    panel_id: string
  ): Record<string, unknown> | null {
    let file_name: string | null = this.uploaderModel().get_picture_file_name(
      module,
      settings.column,
      update_id
    );

    if (file_name === null) {
      return null;
    }

    // A recorded name that is not a plain, safe basename cannot belong to a
    // file this runtime wrote (and cannot be addressed safely in a URL).
    // Treat it as "no picture"; the column is never rewritten here.
    if (file_name !== "" && !this.is_safe_file_name(file_name)) {
      file_name = "";
    }

    const data: Record<string, unknown> = {
      view_module: "image_uploader",
      module: module,
      update_id: update_id,
      panel_id: panel_id,
      csrf_token: csrf_token(),
      file_name: file_name,
      thumbnails: settings.thumbnails,
      upload_url: `${BASE_URL}image_uploader/upload_form/${module}/${update_id}`,
    };

    if (file_name !== "") {
      data.picture_url = this.picture_url(settings, module, update_id, file_name, false);
      data.thumbnail_url = this.picture_url(settings, module, update_id, file_name, true);
    } else {
      data.picture_url = "";
      data.thumbnail_url = "";
    }

    return data;
  }

  /**
   * Render the dedicated upload page for one record.
   *
   * @param full_page true for the admin-templated page (GET endpoint);
   *                  false for the bare view (EtForm subtree replacement on
   *                  a validation failure).
   */
  private async render_upload_form(
    module: string,
    update_id: number,
    full_page: boolean
  ): Promise<ReactNode> {
    const settings = this.uploaderModel().get_uploader_settings(module);

    if (settings === null || update_id === 0) {
      this.not_configured();
    }

    const current_file_name = this.uploaderModel().get_picture_file_name(
      module,
      settings.column,
      update_id
    );

    if (current_file_name === null) {
      redirect(`${module}/manage`);
    }

    const safe_file_name =
      current_file_name !== "" && !this.is_safe_file_name(current_file_name)
        ? ""
        : current_file_name;

    const data = this.page_data(module, update_id, "Upload Picture");
    data.current_file_name = safe_file_name;
    data.current_picture_url =
      safe_file_name === ""
        ? ""
        : this.picture_url(settings, module, update_id, safe_file_name, false);
    data.cancel_url = `${BASE_URL}${module}/show/${update_id}`;

    return full_page
      ? this.templates.admin(data)
      : this.view("image_uploader/upload_form", data);
  }

  /** Assemble the view data for the dedicated upload page. */
  private page_data(
    module: string,
    update_id: number,
    headline: string
  ): Record<string, unknown> {
    return {
      headline: headline,
      module: module,
      update_id: update_id,
      form_location: `${BASE_URL}image_uploader/submit_upload`,
      view_module: "image_uploader",
      view_file: "upload_form",
      // The port's Templates addresses views with camelCase keys.
      viewModule: "image_uploader",
      viewFile: "upload_form",
    };
  }

  /**
   * Build the public URL for a stored picture file. Module-owned files are
   * served through the standard module-assets folder ({module}_module/...)
   * with the settings destination as the first path segment.
   */
  private picture_url(
    settings: UploaderSettings,
    module: string,
    update_id: number,
    file_name: string,
    thumbnail: boolean
  ): string {
    let url_path = `${settings.destination}/${update_id}`;

    if (thumbnail) {
      url_path += "/thumbs";
    }

    return `${BASE_URL}${module}_module/${url_path}/${file_name}`;
  }

  /** The per-record storage folder for a record (no trailing slash). */
  private record_folder(
    settings: UploaderSettings,
    module: string,
    update_id: number
  ): string {
    return path.join(moduleAssetsDir(module), settings.destination, String(update_id));
  }

  /**
   * List every file under a folder, as paths relative to that folder.
   * Returns [] when the folder does not exist.
   */
  private folder_contents(folder: string): string[] {
    if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
      return [];
    }

    const found: string[] = [];

    const walk = (current: string, prefix: string): void => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
        const absolute = path.join(current, entry.name);

        if (entry.isDirectory()) {
          walk(absolute, relative);
        } else if (entry.isFile()) {
          found.push(relative);
        }
      }
    };

    walk(folder, "");
    found.sort();

    return found;
  }

  /**
   * Remove everything an upload attempt added, then prune empty folders.
   * Anything present before the attempt is left exactly as it was.
   */
  private rollback_upload(folder: string, before: string[]): void {
    const after = this.folder_contents(folder);
    const before_set = new Set(before);

    for (const relative of after) {
      if (before_set.has(relative)) continue;

      const target = path.join(folder, ...relative.split("/"));

      try {
        if (fs.statSync(target).isFile()) {
          fs.unlinkSync(target);
        }
      } catch {
        /* ignore — best effort, like PHP's @unlink */
      }
    }

    this.prune_empty_folders(folder);
  }

  /**
   * Remove empty subfolders under a folder, then the folder itself.
   * rmdir() only ever removes an EMPTY directory, so a concurrent upload
   * into the same record can never be clobbered.
   */
  private prune_empty_folders(folder: string): void {
    if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
      return;
    }

    const dirs: string[] = [];

    const walk = (current: string): void => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const child = path.join(current, entry.name);
          walk(child);
          dirs.push(child);
        }
      }
    };

    walk(folder);

    for (const dir of dirs) {
      try {
        fs.rmdirSync(dir);
      } catch {
        /* not empty — leave it */
      }
    }

    try {
      fs.rmdirSync(folder);
    } catch {
      /* not empty — leave it */
    }
  }

  /**
   * Re-assert the extension policy on a completed upload: the sniffed MIME
   * must be an accepted image type, the stored name must be a safe bare
   * basename, and the extension must agree with that MIME. Anything else is
   * renamed (main file + thumbnail together) to the canonical extension, or
   * refused — in which case the caller removes what the attempt created.
   */
  private enforce_file_extension(file_info: ImageUploadInfo): {
    name: string;
    error: string;
  } {
    const mime = String(file_info.file_type ?? "").toLowerCase();
    const allowed = IMAGE_EXTENSIONS[mime] ?? null;

    if (allowed === null) {
      return { name: "", error: "that file type is not a supported image" };
    }

    const file_name = path.basename(String(file_info.file_name ?? ""));

    if (file_name === "") {
      return { name: "", error: "no file was produced" };
    }

    if (!this.is_safe_file_name(file_name)) {
      return { name: "", error: "the uploaded file name was rejected" };
    }

    const extension = path.extname(file_name).replace(/^\./, "").toLowerCase();

    if (allowed.includes(extension)) {
      return { name: file_name, error: "" };
    }

    const canonical = allowed[0];
    const stem =
      extension === ""
        ? file_name.replace(/\.+$/, "")
        : file_name.slice(0, -(extension.length + 1));
    const new_name = `${stem}.${canonical}`;

    if (stem === "" || !this.is_safe_file_name(new_name)) {
      return { name: "", error: "the uploaded file name was rejected" };
    }

    const moves: Array<[string, string]> = [
      [String(file_info.file_path ?? ""), new_name],
    ];

    const thumbnail_path = String(file_info.thumbnail_path ?? "");

    if (thumbnail_path !== "") {
      moves.push([thumbnail_path, new_name]);
    }

    for (const [old_path, target_name] of moves) {
      const target_path = path.join(path.dirname(old_path), target_name);

      if (!fs.existsSync(old_path) || !fs.statSync(old_path).isFile()) {
        return { name: "", error: "the uploaded file could not be secured" };
      }

      if (target_path === old_path) {
        continue;
      }

      if (fs.existsSync(target_path)) {
        return { name: "", error: "the uploaded file could not be secured" };
      }

      try {
        fs.renameSync(old_path, target_path);
      } catch {
        return { name: "", error: "the uploaded file could not be secured" };
      }
    }

    return { name: new_name, error: "" };
  }

  /**
   * Is this file name one the runtime is willing to store or serve?
   * Bare basename only, a conservative charset, no dot-runs.
   */
  private is_safe_file_name(file_name: string): boolean {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(file_name)) {
      return false;
    }

    return path.basename(file_name) === file_name && !file_name.includes("..");
  }

  /**
   * Fail an upload attempt: undo its partial state, then redirect back.
   * Always throws (redirect()).
   */
  private upload_failed(
    module: string,
    update_id: number,
    folder: string,
    before: string[],
    message: string
  ): never {
    this.rollback_upload(folder, before);
    set_flashdata(`The picture could not be uploaded: ${message}.`);
    redirect(`image_uploader/upload_form/${module}/${update_id}`);
  }

  /**
   * Turn a caught error into a message safe to show a user: absolute paths
   * are stripped, whitespace is collapsed and the result is length-capped.
   */
  private public_message(error: unknown): string {
    let message = error instanceof Error ? error.message : String(error);
    message = message.split(PROJECT_ROOT).join("");
    message = message.split(BASE_URL).join("");
    message = message.replace(/\s+/g, " ").trim();

    if (message.length > 200) {
      message = `${message.slice(0, 197)}...`;
    }

    return message === "" ? "the upload failed" : message;
  }

  /**
   * Delete the recorded main + thumb files for one record. Deletes ONLY the
   * exact file names recorded in the database, treated as bare basenames.
   * Missing files are ignored silently (idempotent).
   */
  private delete_recorded_files(
    settings: UploaderSettings,
    module: string,
    update_id: number,
    file_name: string
  ): void {
    const safe = path.basename(file_name);

    if (safe === "" || safe === "." || safe === "..") {
      return;
    }

    const base_dir = this.record_folder(settings, module, update_id);
    const main_path = path.join(base_dir, safe);

    try {
      if (fs.statSync(main_path).isFile()) {
        fs.unlinkSync(main_path);
      }
    } catch {
      /* ignore */
    }

    const thumb_path = path.join(base_dir, "thumbs", safe);

    try {
      if (fs.statSync(thumb_path).isFile()) {
        fs.unlinkSync(thumb_path);
      }
    } catch {
      /* ignore */
    }

    this.prune_empty_folders(base_dir);
  }

  /** Validate a panel identifier (the ids draw_panel() generates). */
  private valid_panel_id(panel_id: string): boolean {
    return /^[A-Za-z0-9]{8,32}$/.test(panel_id);
  }

  /** A request for a module with no configured uploader answers 404. */
  private not_configured(): never {
    throw new EtHttpError(404, "No image uploader is configured for that module.");
  }
}
