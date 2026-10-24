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
import Image from "@/modules/image/Image";
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

/**
 * Media library administration.
 *
 * Files are stored under public/uploads/media and indexed in
 * data/settings/media_library/index.json. The upload route dispatches here so
 * authentication, CSRF checks and image validation stay in one place.
 */
export default class Media extends Eterc {
  private principal(): CmsPrincipal {
    try {
      return require_admin_user();
    } catch (error) {
      if (error instanceof EtHttpError && error.status === 401) {
        set_flashdata("Please sign in with an administrator account.");
        redirect(admin_login_path());
      }
      throw error;
    }
  }

  private library_data(): Record<string, unknown> {
    const media = listMedia();
    return {
      media,
      stats: mediaStats(media),
      csrf_token: csrf_token(),
      upload_url: "/api/media/upload",
      api_root: "/api/xhr/media",
    };
  }

  async index() {
    this.principal();
    return this.templates.admin({
      viewModule: "media",
      viewFile: "library",
      pageTitle: "Media library",
      ...this.library_data(),
    });
  }

  async list_media(): Promise<Record<string, unknown>> {
    this.principal();
    const media = listMedia();
    return { ok: true, media, stats: mediaStats(media) };
  }

  async upload_media(): Promise<Record<string, unknown>> {
    this.principal();
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
      rollbackMedia(snapshot);
      throw new EtHttpError(400, this.mediaError(error));
    }
  }

  async delete_media(): Promise<Record<string, unknown>> {
    this.principal();
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

  async update_media(): Promise<Record<string, unknown>> {
    this.principal();
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
}
