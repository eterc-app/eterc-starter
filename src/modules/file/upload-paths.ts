import * as fs from "node:fs";
import * as path from "node:path";
import { PROJECT_ROOT, UPLOADS_DIR } from "@/engine/paths";

/**
 * Upload path resolution shared by the file and image modules.
 *
 * The PHP originals placed uploads relative to the application root
 * (e.g. `uploads/images/...`) or inside a module folder when
 * `upload_to_module` was true. The port keeps the same configuration keys
 * but resolves them to publicly-served locations:
 *
 *   - default destinations resolve beneath public/uploads/ (UPLOADS_DIR);
 *   - a destination that already starts with "uploads/" resolves beneath
 *     public/ so callers may pass the PHP-style path unchanged;
 *   - `upload_to_module === true` resolves beneath
 *     public/{target_module}_module/ — the port's module-assets folder,
 *     matching the public URLs the image uploader builds.
 *
 * Directory traversal and absolute paths are rejected.
 */

const MODULE_NAME = /^[a-z0-9_]+$/;

function normalizeDestination(destination: string): string {
  const normalized = destination
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .replace(/\/+$/, "");

  if (normalized === "" || path.isAbsolute(destination)) {
    throw new Error("Invalid upload destination");
  }

  const parts = normalized.split("/").filter((part) => part !== "");
  if (parts.includes("..") || parts.includes(".")) {
    throw new Error("Invalid upload destination");
  }

  return parts.join("/");
}

/** Public module-assets folder: public/{module}_module. */
export function moduleAssetsDir(module: string): string {
  const name = module.toLowerCase();
  if (!MODULE_NAME.test(name)) {
    throw new Error(`Invalid module name: '${module}'`);
  }
  return path.join(PROJECT_ROOT, "public", `${name}_module`);
}

/** Resolve a file-upload destination to an absolute directory. */
export function resolveUploadDirectory(
  destination: string,
  upload_to_module = false,
  target_module = ""
): string {
  if (!destination) {
    throw new Error("Upload destination not specified");
  }

  const normalized = normalizeDestination(destination);

  if (upload_to_module === true) {
    if (!MODULE_NAME.test(target_module.toLowerCase())) {
      throw new Error("Invalid upload destination");
    }
    return path.join(moduleAssetsDir(target_module), normalized);
  }

  if (normalized === "uploads" || normalized.startsWith("uploads/")) {
    return path.join(PROJECT_ROOT, "public", normalized);
  }

  if (normalized === "public" || normalized.startsWith("public/")) {
    return path.join(PROJECT_ROOT, normalized);
  }

  return path.join(UPLOADS_DIR, normalized);
}

/** Create a directory (recursively). Returns the absolute path. */
export function ensureDirectory(directory: string): string {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
  return directory;
}
