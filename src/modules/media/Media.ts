import * as crypto from "node:crypto";
import * as fs from "node:fs";
import { admin_login_path } from "@/engine/config";
import { Eterc } from "@/engine/controller";
import { csrf_check, csrf_token } from "@/engine/csrf";
import { set_flashdata } from "@/engine/Flashdata";
import { PROJECT_ROOT } from "@/engine/paths";
import { post, uploaded_files } from "@/engine/post";
import { EtHttpError } from "@/engine/signals";
import { redirect } from "@/engine/Url";
import { require_admin_user } from "@/modules/cms/cms-access";
import type { CmsPrincipal } from "@/modules/cms/cms-types";
import { activeStorageProvider } from "@/engine/active/storage-provider";
import Image from "@/modules/image/Image";
import {
  MAX_MEDIA_BYTES,
  assertLocalMediaStorage,
  deleteMedia,
  getMedia,
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
  ALLOWED_UPLOAD_EXTENSIONS,
  createUploadFolder,
  ensureUploadFolder,
  normalizeUploadFolder,
} from "./upload-assets";
import {
  cleanup_pending_uploads,
  complete_upload,
  delete_upload,
  ensure_uploads_ready,
  init_upload,
  reconcile_uploads,
} from "./upload-service";
import {
  asset_to_item,
  find_asset_by_file,
  format_bytes,
  get_asset,
  get_asset_row,
  list_assets,
  list_media_items,
  update_asset_metadata,
} from "./media-registry";

const MAX_FILE_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Media library administration.
 *
 * Files are stored under public/uploads/media and indexed in
 * data/settings/media_library/index.json. The upload route dispatches here so
 * authentication, CSRF checks and image validation stay in one place.
 */
export default class Media extends Eterc {
  private async principal(): Promise<CmsPrincipal> {
    try {
      return await require_admin_user();
    } catch (error) {
      if (error instanceof EtHttpError && error.status === 401) {
        set_flashdata("Please sign in with an administrator account.");
        redirect(admin_login_path());
      }
      throw error;
    }
  }

  private async library_data(): Promise<Record<string, unknown>> {
    await ensure_uploads_ready();
    const media = await list_media_items("image");
    const total_bytes = media.reduce((total, item) => total + item.size, 0);
    return {
      media,
      stats: {
        count: media.length,
        total_bytes,
        total_label: format_bytes(total_bytes),
      },
      csrf_token: csrf_token(),
      upload_url: "/api/media/upload",
      api_root: "/api/xhr/media",
    };
  }

  async index() {
    await this.principal();
    return this.templates.admin({
      viewModule: "media",
      viewFile: "library",
      pageTitle: "Media library",
      ...(await this.library_data()),
    });
  }

  async list_media(): Promise<Record<string, unknown>> {
    await this.principal();
    await ensure_uploads_ready();
    const media = await list_media_items("image");
    const total_bytes = media.reduce((total, item) => total + item.size, 0);
    return {
      ok: true,
      media,
      stats: {
        count: media.length,
        total_bytes,
        total_label: format_bytes(total_bytes),
      },
    };
  }

  async list_upload_assets(): Promise<Record<string, unknown>> {
    await this.principal();
    await ensure_uploads_ready();
    const assets = await list_assets({ limit: 5000 });
    return {
      ok: true,
      assets: assets
        .filter((asset) => asset.status === "ready")
        .map((asset) => ({
          id: asset.id,
          url: asset.url,
          thumbnail_url: asset.thumbnail_url,
          name: asset.original_name,
          folder: asset.folder,
          size: asset.size,
          kind: asset.kind,
          visibility: asset.visibility,
        })),
      folders: [...new Set(assets.map((asset) => asset.folder).filter(Boolean))].sort(),
      truncated: false,
    };
  }

  async asset_init(): Promise<Record<string, unknown>> {
    const principal = await this.principal();
    this.assertCsrf();
    const result = await init_upload({
      principal,
      kind: String(post("kind") ?? "image"),
      filename: String(post("name") ?? post("filename") ?? ""),
      content_type: String(post("content_type") ?? ""),
      size: Number(post("size") ?? 0),
      folder: String(post("folder") ?? ""),
      visibility: String(post("visibility") ?? "public"),
    });
    return { ok: true, ...result };
  }

  async asset_complete(): Promise<Record<string, unknown>> {
    const principal = await this.principal();
    this.assertCsrf();
    const result = await complete_upload({
      principal,
      asset_id: String(post("asset_id") ?? ""),
    });
    return {
      ok: true,
      media: asset_to_item(result.asset),
      asset: result.asset,
      deduplicated: result.deduplicated,
    };
  }

  async asset_delete(): Promise<Record<string, unknown>> {
    const principal = await this.principal();
    this.assertCsrf();
    await delete_upload({
      principal,
      asset_id: String(post("asset_id") ?? ""),
      file: String(post("file") ?? ""),
    });
    await ensure_uploads_ready();
    const media = await list_media_items("image");
    const total_bytes = media.reduce((total, item) => total + item.size, 0);
    return {
      ok: true,
      stats: {
        count: media.length,
        total_bytes,
        total_label: format_bytes(total_bytes),
      },
    };
  }

  async asset_download(): Promise<Record<string, unknown>> {
    await this.principal();
    const asset_id = String(post("asset_id") ?? "");
    const asset = await get_asset(asset_id);
    if (!asset || asset.status === "deleted") {
      throw new EtHttpError(404, "That media asset no longer exists.");
    }
    return { ok: true, media: asset_to_item(asset), url: asset.url };
  }

  async asset_cleanup(): Promise<Record<string, unknown>> {
    await this.principal();
    this.assertCsrf();
    await ensure_uploads_ready();
    return { ok: true, ...(await cleanup_pending_uploads()) };
  }

  async asset_reconcile(): Promise<Record<string, unknown>> {
    const principal = await this.principal();
    if (!principal.role.admin_access) {
      throw new EtHttpError(403, "Only administrators can reconcile media storage.");
    }
    this.assertCsrf();
    await ensure_uploads_ready();
    return { ok: true, ...(await reconcile_uploads()) };
  }

  async create_upload_folder(): Promise<Record<string, unknown>> {
    await this.principal();
    this.assertCsrf();

    try {
      const parent = normalizeUploadFolder(post("folder"));
      const name = String(post("name") ?? "").trim();
      if (
        !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(name) ||
        name.toLowerCase() === "thumbs"
      ) {
        throw new Error("Use a folder name with letters, numbers, dots, dashes, or underscores.");
      }
      const folder = normalizeUploadFolder(
        [parent, name].filter(Boolean).join("/")
      );
      if (activeStorageProvider.id === "local") {
        createUploadFolder(parent, name);
      }
      return { ok: true, folder };
    } catch (error) {
      throw new EtHttpError(
        400,
        error instanceof Error ? error.message : "The folder could not be created."
      );
    }
  }

  async upload_media(): Promise<Record<string, unknown>> {
    await this.principal();
    this.assertCsrf();
    assertLocalMediaStorage();

    const kind = String(post("kind") || "image");
    if (kind !== "image" && kind !== "file") {
      throw new EtHttpError(400, "Choose an image or file to upload.");
    }
    let folder: string;
    try {
      folder = normalizeUploadFolder(
        post("folder"),
        kind === "image" ? "media" : "files"
      );
      ensureUploadFolder(folder);
    } catch (error) {
      throw new EtHttpError(
        400,
        error instanceof Error
          ? error.message
          : "Choose a valid upload folder inside uploads."
      );
    }
    const files = await uploaded_files();
    const uploaded = Object.values(files)[0];

    if (uploaded === undefined) {
      throw new EtHttpError(400, `Choose a ${kind} to upload.`);
    }

    if (kind === "file") {
      if (uploaded.size > MAX_FILE_UPLOAD_BYTES) {
        throw new EtHttpError(400, "The file is too large. The limit is 25 MB.");
      }
      const extension =
        uploaded.originalName.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
      if (!ALLOWED_UPLOAD_EXTENSIONS.has(extension)) {
        throw new EtHttpError(
          400,
          "This file type is not supported. Choose a document, archive, audio, or video file."
        );
      }
      const saved = await activeStorageProvider.upload(
        uploaded.bytes ?? Buffer.alloc(0),
        {
          filename: `${crypto.randomUUID()}${extension}`,
          folder,
          contentType: uploaded.mimeType,
          isPublic: true,
        }
      );
      return {
        ok: true,
        file: {
          url: saved.url,
          name: uploaded.originalName,
          size: saved.size,
          contentType: saved.contentType,
        },
      };
    }

    if (uploaded.size > MAX_MEDIA_BYTES) {
      throw new EtHttpError(
        400,
        `The image is too large. The limit is ${Math.round(
          MAX_MEDIA_BYTES / (1024 * 1024)
        )} MB.`
      );
    }

    const libraryUpload = folder === "media";
    const snapshot = libraryUpload ? mediaFolderSnapshot() : null;

    try {
      ensureUploadFolder(`${folder}/thumbs`, true);
      const image = new Image();
      const info = await image.upload({
        destination: `uploads/${folder}`,
        upload_to_module: false,
        max_width: 2400,
        max_height: 2400,
        thumbnail_dir: `uploads/${folder}/thumbs`,
        thumbnail_max_width: 480,
        thumbnail_max_height: 480,
        make_rand_name: true,
      });

      const folderUrl = folder
        .split("/")
        .map(encodeURIComponent)
        .join("/");
      const baseUrl = `/uploads/${folderUrl}/${encodeURIComponent(info.file_name)}`;
      if (!libraryUpload) {
        return {
          ok: true,
          media: {
            file: info.file_name,
            original_name: uploaded.originalName,
            title: titleFromName(uploaded.originalName),
            alt: "",
            mime: info.file_type,
            size: fs.statSync(info.file_path).size,
            url: baseUrl,
            thumbnail_url: info.thumbnail_path
              ? `/uploads/${folderUrl}/thumbs/${encodeURIComponent(info.file_name)}`
              : baseUrl,
          },
        };
      }

      const stat = fs.statSync(info.file_path);
      const item: MediaItem = {
        file: info.file_name,
        original_name: uploaded.originalName,
        title: titleFromName(uploaded.originalName),
        alt: "",
        mime: info.file_type,
        size: stat.size,
        width: 0,
        height: 0,
        created_at: new Date().toISOString(),
        url: mediaUrl(info.file_name),
        thumbnail_url: info.thumbnail_path
          ? mediaUrl(info.file_name, true)
          : mediaUrl(info.file_name),
        has_thumbnail: Boolean(info.thumbnail_path),
      };

      upsertMedia(item);
      const saved = getMedia(info.file_name) ?? item;
      return { ok: true, media: saved, stats: mediaStats() };
    } catch (error) {
      if (snapshot) rollbackMedia(snapshot);
      throw new EtHttpError(400, this.mediaError(error));
    }
  }

  async delete_media(): Promise<Record<string, unknown>> {
    const principal = await this.principal();
    this.assertCsrf();

    const file = String(post("file") ?? "");
    const asset_id = String(post("asset_id") ?? "");
    if (file === "" && asset_id === "") {
      throw new EtHttpError(400, "No image was specified.");
    }

    await ensure_uploads_ready();
    if (asset_id !== "") {
      await delete_upload({ principal, asset_id });
    } else {
      const asset = await find_asset_by_file(file);
      if (asset) {
        await delete_upload({ principal, asset_id: asset.id });
      } else if (!deleteMedia(file)) {
        throw new EtHttpError(404, "That image no longer exists.");
      }
    }

    const media = await list_media_items("image");
    const total_bytes = media.reduce((total, item) => total + item.size, 0);
    return {
      ok: true,
      stats: {
        count: media.length,
        total_bytes,
        total_label: format_bytes(total_bytes),
      },
    };
  }

  async update_media(): Promise<Record<string, unknown>> {
    await this.principal();
    this.assertCsrf();

    const file = String(post("file") ?? "");
    const asset_id = String(post("asset_id") ?? "");
    if (file === "" && asset_id === "") {
      throw new EtHttpError(400, "No image was specified.");
    }

    await ensure_uploads_ready();
    if (asset_id !== "") {
      const row = await get_asset_row(asset_id);
      if (row) {
        const updated = await update_asset_metadata(row, {
          title: String(post("title") ?? ""),
          alt: String(post("alt") ?? ""),
        });
        return { ok: true, media: asset_to_item(updated) };
      }
    }

    const asset = await find_asset_by_file(file);
    if (asset) {
      const updated = await update_asset_metadata(asset, {
        title: String(post("title") ?? ""),
        alt: String(post("alt") ?? ""),
      });
      return { ok: true, media: asset_to_item(updated) };
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
}
