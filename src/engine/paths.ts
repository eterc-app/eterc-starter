import * as fs from "node:fs";
import * as path from "node:path";

/** Project root (works from `next dev`, `next start` and CLI scripts). */
export const PROJECT_ROOT = process.cwd();

/** SQLite database file used by Prisma and the framework Db layer. */
const configuredSqliteFile = process.env.ET_SQLITE_FILE?.trim();
export const DB_FILE = configuredSqliteFile
  ? path.resolve(/* turbopackIgnore: true */ PROJECT_ROOT, configuredSqliteFile)
  : path.join(PROJECT_ROOT, "prisma", "dev.db");

/** Internal runtime state (properties JSON, settings, generated artifacts). */
const configuredDataDir = process.env.ET_DATA_DIR?.trim();
export const DATA_DIR = configuredDataDir
  ? path.resolve(/*turbopackIgnore: true*/ PROJECT_ROOT, configuredDataDir)
  : path.join(PROJECT_ROOT, "data");

/** Uploaded / generated files that must be publicly accessible. */
const configuredUploadsDir = process.env.ET_UPLOADS_DIR?.trim();
export const UPLOADS_DIR = configuredUploadsDir
  ? path.resolve(/*turbopackIgnore: true*/ PROJECT_ROOT, configuredUploadsDir)
  : path.join(PROJECT_ROOT, "public", "uploads");

/** Private uploads are never served by the static /uploads route. */
export const PRIVATE_UPLOADS_DIR = path.join(DATA_DIR, "private-uploads");

/** Staging area for streamed uploads before the atomic publish rename. */
export const UPLOAD_TMP_DIR = path.join(DATA_DIR, "tmp", "uploads");

/** Source modules directory for framework modules. */
export const MODULES_DIR = path.join(PROJECT_ROOT, "src", "modules");

/** Directory where code generators write new Next.js modules. */
export const GENERATED_MODULES_DIR = path.join(MODULES_DIR, "generated");

export function ensure_dir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function data_path(...parts: string[]): string {
  const dir = ensure_dir(path.join(DATA_DIR, ...parts.slice(0, -1)));
  return parts.length === 1 ? path.join(dir, parts[0]) : path.join(dir, ...parts);
}

export function ensure_data_dirs(): void {
  ensure_dir(DATA_DIR);
  ensure_dir(path.join(DATA_DIR, "properties"));
  ensure_dir(path.join(DATA_DIR, "settings"));
  ensure_dir(path.join(DATA_DIR, "generated"));
  ensure_dir(UPLOADS_DIR);
  ensure_dir(PRIVATE_UPLOADS_DIR);
  ensure_dir(UPLOAD_TMP_DIR);
  ensure_dir(GENERATED_MODULES_DIR);
}
