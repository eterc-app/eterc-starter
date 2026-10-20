import * as fs from "node:fs";
import * as path from "node:path";
import { Model } from "@/engine/model";
import { DATA_DIR, MODULES_DIR } from "@/engine/paths";

/**
 * Image_uploader_model — data layer for the image uploader runtime.
 * Port of modules/image_uploader/Image_uploader_model.php.
 *
 * Serves the runtime needs of modules already equipped with a single-image
 * feature: read + validate the per-module settings JSON, read/update the
 * target module's picture column (filename only — paths and URLs are always
 * constructed server-side, never stored) and answer whether a record exists
 * (the null return from get_picture_file_name()).
 *
 * Settings file lookup: the port reads the settings JSON from
 * data/settings/image_uploader/{module}.json first and falls back to
 * src/modules/image_uploader/settings/{module}.json (the module-local copy,
 * versioned alongside the runtime — the PHP original's location).
 *
 * Settings JSON shape:
 *   module                  — the target module name (== its table name)
 *   column                  — the picture column on the target table
 *   destination             — module-relative storage dir (default 'uploads')
 *   max_size                — upload size cap in KB (validation rule)
 *   max_width/max_height    — source dimension caps (validation rules)
 *   resize_max_width/height — downscale-to dimensions (image->upload)
 *   thumbnails              — bool; whether a thumbnail is generated
 *   thumbnail_max_width     — thumbnail max width in px
 *   thumbnail_max_height    — thumbnail max height in px
 *
 * Storage layout (per record id):
 *   public/{module}_module/{destination}/{id}/{filename}          ← main
 *   public/{module}_module/{destination}/{id}/thumbs/{filename}   ← thumb
 *
 * Trust boundary — identifiers in SQL: queries concatenate the table name
 * (module) and column name from the settings file, because SQL cannot bind
 * identifiers. This is safe ONLY because those values are validated against
 * `^[a-z0-9_]+$` on every read (see get_uploader_settings()).
 */

export interface UploaderSettings {
  module: string;
  column: string;
  destination: string;
  max_size: number;
  max_width: number;
  max_height: number;
  resize_max_width: number;
  resize_max_height: number;
  thumbnails: boolean;
  thumbnail_max_width: number;
  thumbnail_max_height: number;
  [key: string]: unknown;
}

const IDENTIFIER = /^[a-z0-9_]+$/;

const STRING_KEYS = ["module", "column", "destination"] as const;

const INT_KEYS = [
  "max_size",
  "max_width",
  "max_height",
  "resize_max_width",
  "resize_max_height",
  "thumbnail_max_width",
  "thumbnail_max_height",
] as const;

export class Image_uploader_model extends Model {
  /**
   * Read and validate the uploader settings for a given module.
   *
   * Returns the settings object when a settings file exists and every field
   * passes schema + charset validation; null otherwise (no uploader
   * configured, or a corrupt/hostile file — both treated identically).
   */
  get_uploader_settings(module: string): UploaderSettings | null {
    const target = module.toLowerCase();

    if (!IDENTIFIER.test(target)) {
      return null;
    }

    const settings_path = this.find_settings_path(target);

    if (settings_path === null) {
      return null;
    }

    let json: string;
    try {
      json = fs.readFileSync(settings_path, "utf8");
    } catch {
      return null;
    }

    let settings: unknown;
    try {
      settings = JSON.parse(json);
    } catch {
      return null;
    }

    if (settings === null || typeof settings !== "object" || Array.isArray(settings)) {
      return null;
    }

    return this.validate_settings(settings as Record<string, unknown>, target);
  }

  /**
   * Validate a decoded settings object against the schema contract.
   *
   * Every identifier (module, column, destination) must match the strict
   * `^[a-z0-9_]+$` charset — no slashes, dots or dashes — so table, column
   * and directory names are safe to concatenate into SQL and paths. Numeric
   * settings must be non-negative integers. The decoded module field must
   * equal the filename-derived $module.
   */
  private validate_settings(
    settings: Record<string, unknown>,
    module: string
  ): UploaderSettings | null {
    for (const key of STRING_KEYS) {
      const value = settings[key] ?? "";
      if (typeof value !== "string" || !IDENTIFIER.test(value)) {
        return null;
      }
    }

    if (settings.module !== module) {
      return null;
    }

    for (const key of INT_KEYS) {
      const value = settings[key] ?? null;
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
        return null;
      }
    }

    if (typeof settings.thumbnails !== "boolean") {
      return null;
    }

    return settings as unknown as UploaderSettings;
  }

  /** Locate the settings JSON: data/settings/... first, module dir second. */
  private find_settings_path(module: string): string | null {
    const candidates = [
      path.join(DATA_DIR, "settings", "image_uploader", `${module}.json`),
      path.join(MODULES_DIR, "image_uploader", "settings", `${module}.json`),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(/*turbopackIgnore: true*/ candidate) && fs.statSync(/*turbopackIgnore: true*/ candidate).isFile()) {
        return candidate;
      }
    }

    return null;
  }

  /**
   * Fetch the current picture file name for a record.
   *
   * @returns The stored file name ('' = no picture), or null when the
   *          record itself does not exist.
   */
  get_picture_file_name(
    module: string,
    column: string,
    update_id: number
  ): string | null {
    if (update_id === 0) {
      return null;
    }

    const sql = `SELECT \`${column}\` FROM \`${module}\` WHERE id = :update_id`;
    const rows = this.db.query_bind(sql, { update_id }, "object") as Array<
      Record<string, unknown>
    > | null;

    if (rows === null || rows.length === 0) {
      return null;
    }

    return String(rows[0]?.[column] ?? "");
  }

  /** Set (or clear — '') the picture file name on a record. */
  set_picture_file_name(
    module: string,
    column: string,
    update_id: number,
    file_name: string
  ): void {
    if (update_id === 0) {
      return;
    }

    const sql = `UPDATE \`${module}\` SET \`${column}\` = :file_name WHERE id = :update_id`;
    this.db.query_bind(sql, { file_name, update_id });
  }
}

export default Image_uploader_model;
