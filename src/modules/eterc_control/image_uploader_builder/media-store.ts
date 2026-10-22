import * as fs from "node:fs";
import * as path from "node:path";
import { DATA_DIR, UPLOADS_DIR } from "@/engine/paths";
import { ensureDirectory } from "@/modules/file/upload-paths";
import {
  FORMAT_MIME,
  detectSupportedFormat,
  readDimensions,
} from "@/modules/image/image-utils";

/**
 * Standalone media library storage.
 *
 * Files live under public/uploads/media so Next.js can serve them directly.
 * A small JSON index keeps the original name and editable metadata; the
 * filesystem remains the source of truth for which files exist.
 */

export const MEDIA_DIR = path.join(UPLOADS_DIR, "media");
export const MEDIA_THUMB_DIR = path.join(MEDIA_DIR, "thumbs");
export const MEDIA_INDEX_PATH = path.join(
  DATA_DIR,
  "settings",
  "media_library",
  "index.json"
);

export const MAX_MEDIA_BYTES = 12 * 1024 * 1024;
export const MAX_MEDIA_DIMENSION = 12000;

const SAFE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/;

export interface MediaItem {
  /** Stored file name (the stable identifier). */
  file: string;
  original_name: string;
  title: string;
  alt: string;
  mime: string;
  size: number;
  width: number;
  height: number;
  created_at: string;
  /** Public URL of the main image. */
  url: string;
  /** Public URL of the thumbnail, or the main image when none exists. */
  thumbnail_url: string;
  has_thumbnail: boolean;
}

export interface MediaStats {
  count: number;
  total_bytes: number;
  total_label: string;
}

interface StoredMediaItem {
  file: string;
  original_name?: string;
  title?: string;
  alt?: string;
  mime?: string;
  size?: number;
  width?: number;
  height?: number;
  created_at?: string;
}

function isSafeFile(file: string): boolean {
  return (
    SAFE_FILE.test(file) &&
    path.basename(file) === file &&
    !file.includes("..") &&
    !file.startsWith(".")
  );
}

function extensionOf(file: string): string {
  return path.extname(file).replace(/^\./, "").toLowerCase();
}

function isAcceptedExtension(file: string): boolean {
  return ["jpg", "jpeg", "png", "gif", "webp"].includes(extensionOf(file));
}

export function mediaUrl(file: string, thumbnail = false): string {
  const folder = thumbnail ? "media/thumbs" : "media";
  return `/uploads/${folder}/${encodeURIComponent(file)}`;
}

export function titleFromName(name: string): string {
  const without_extension = name.replace(/\.[^.]+$/, "");
  const spaced = without_extension.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  const title = spaced === "" ? name : spaced;
  return title.slice(0, 120);
}

function readStoredIndex(): StoredMediaItem[] {
  try {
    if (!fs.existsSync(MEDIA_INDEX_PATH)) return [];
    const parsed: unknown = JSON.parse(fs.readFileSync(MEDIA_INDEX_PATH, "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is StoredMediaItem =>
        item !== null &&
        typeof item === "object" &&
        typeof (item as StoredMediaItem).file === "string" &&
        isSafeFile((item as StoredMediaItem).file as string)
    );
  } catch {
    return [];
  }
}

function writeStoredIndex(items: StoredMediaItem[]): void {
  ensureDirectory(path.dirname(MEDIA_INDEX_PATH));
  fs.writeFileSync(
    MEDIA_INDEX_PATH,
    JSON.stringify(items, null, 2) + "\n",
    "utf8"
  );
}

function imageMetadata(file_path: string): {
  mime: string;
  width: number;
  height: number;
} {
  try {
    const bytes = fs.readFileSync(file_path);
    const format = detectSupportedFormat(bytes);
    if (format === null) {
      return { mime: "application/octet-stream", width: 0, height: 0 };
    }
    const dimensions = readDimensions(bytes, format);
    return {
      mime: FORMAT_MIME[format],
      width: dimensions?.width ?? 0,
      height: dimensions?.height ?? 0,
    };
  } catch {
    return { mime: "application/octet-stream", width: 0, height: 0 };
  }
}

function toItem(
  file: string,
  stored: StoredMediaItem | undefined,
  stat: fs.Stats
): MediaItem {
  const file_path = path.join(MEDIA_DIR, file);
  const metadata = imageMetadata(file_path);
  const thumb_path = path.join(MEDIA_THUMB_DIR, file);
  const has_thumbnail =
    fs.existsSync(thumb_path) && fs.statSync(thumb_path).isFile();
  const original_name = String(stored?.original_name ?? file);
  const title =
    String(stored?.title ?? "").trim() || titleFromName(original_name);

  return {
    file,
    original_name,
    title: title.slice(0, 120),
    alt: String(stored?.alt ?? "").slice(0, 240),
    mime: metadata.mime,
    size: stat.size,
    width: metadata.width,
    height: metadata.height,
    created_at:
      String(stored?.created_at ?? "") || stat.mtime.toISOString(),
    url: mediaUrl(file),
    thumbnail_url: has_thumbnail ? mediaUrl(file, true) : mediaUrl(file),
    has_thumbnail,
  };
}

function storedFromItem(item: MediaItem): StoredMediaItem {
  return {
    file: item.file,
    original_name: item.original_name,
    title: item.title,
    alt: item.alt,
    mime: item.mime,
    size: item.size,
    width: item.width,
    height: item.height,
    created_at: item.created_at,
  };
}

/** All media, newest first, reconciled with the filesystem. */
export function listMedia(): MediaItem[] {
  ensureDirectory(MEDIA_DIR);
  ensureDirectory(MEDIA_THUMB_DIR);

  const stored = readStoredIndex();
  const by_file = new Map(stored.map((item) => [item.file, item]));
  const files = fs
    .readdirSync(MEDIA_DIR, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        !entry.name.startsWith(".") &&
        isAcceptedExtension(entry.name)
    )
    .map((entry) => entry.name);

  const items: MediaItem[] = [];
  for (const file of files) {
    const file_path = path.join(MEDIA_DIR, file);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(file_path);
      if (!stat.isFile()) continue;
    } catch {
      continue;
    }
    items.push(toItem(file, by_file.get(file), stat));
  }

  items.sort((a, b) => {
    const left = Date.parse(a.created_at);
    const right = Date.parse(b.created_at);
    if (Number.isFinite(left) && Number.isFinite(right) && left !== right) {
      return right - left;
    }
    return a.file.localeCompare(b.file);
  });

  // Prune stale index entries and persist metadata for files discovered on
  // disk (for example, files copied into the folder by hand).
  const current = items.map(storedFromItem);
  if (JSON.stringify(current) !== JSON.stringify(stored)) {
    writeStoredIndex(current);
  }

  return items;
}

export function mediaStats(items: MediaItem[] = listMedia()): MediaStats {
  const total_bytes = items.reduce((total, item) => total + item.size, 0);
  return {
    count: items.length,
    total_bytes,
    total_label: formatBytes(total_bytes),
  };
}

export function getMedia(file: string): MediaItem | null {
  if (!isSafeFile(file)) return null;
  const file_path = path.join(MEDIA_DIR, file);
  try {
    if (!fs.statSync(file_path).isFile()) return null;
    const stored = readStoredIndex().find((item) => item.file === file);
    return toItem(file, stored, fs.statSync(file_path));
  } catch {
    return null;
  }
}

/** Add or replace one media item in the index. */
export function upsertMedia(item: MediaItem): void {
  const stored = readStoredIndex().filter((entry) => entry.file !== item.file);
  stored.push(storedFromItem(item));
  writeStoredIndex(stored);
}

/** Edit display metadata without touching the file. */
export function updateMedia(
  file: string,
  patch: { title?: string; alt?: string }
): MediaItem | null {
  const item = getMedia(file);
  if (item === null) return null;

  const next: MediaItem = {
    ...item,
    title:
      patch.title === undefined
        ? item.title
        : String(patch.title).trim().slice(0, 120) || item.title,
    alt:
      patch.alt === undefined
        ? item.alt
        : String(patch.alt).trim().slice(0, 240),
  };

  upsertMedia(next);
  return next;
}

/** Delete a media item and its thumbnail. Missing files are harmless. */
export function deleteMedia(file: string): boolean {
  if (!isSafeFile(file)) return false;

  const main = path.join(MEDIA_DIR, file);
  const thumb = path.join(MEDIA_THUMB_DIR, file);
  let removed = false;

  for (const target of [main, thumb]) {
    try {
      if (fs.statSync(/*turbopackIgnore: true*/ target).isFile()) {
        fs.unlinkSync(target);
        removed = true;
      }
    } catch {
      /* already gone */
    }
  }

  const stored = readStoredIndex();
  const next = stored.filter((entry) => entry.file !== file);
  if (next.length !== stored.length) {
    writeStoredIndex(next);
    removed = true;
  }

  return removed;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024))
  );
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(exponent === 0 ? 0 : value >= 10 ? 0 : 1)} ${units[exponent]}`;
}

/** Snapshot the media folder before an upload so a failure can be rolled back. */
export function mediaFolderSnapshot(): Set<string> {
  ensureDirectory(MEDIA_DIR);
  ensureDirectory(MEDIA_THUMB_DIR);
  const found = new Set<string>();
  for (const dir of [MEDIA_DIR, MEDIA_THUMB_DIR]) {
    for (const entry of fs.readdirSync(/*turbopackIgnore: true*/ dir, {
      withFileTypes: true,
    })) {
      if (entry.isFile()) {
        found.add(path.join(dir, entry.name));
      }
    }
  }
  return found;
}

/** Remove files created after a snapshot. Best effort, never throws. */
export function rollbackMedia(snapshot: Set<string>): void {
  for (const dir of [MEDIA_DIR, MEDIA_THUMB_DIR]) {
    try {
      for (const entry of fs.readdirSync(/*turbopackIgnore: true*/ dir, {
        withFileTypes: true,
      })) {
        const full = path.join(dir, entry.name);
        if (entry.isFile() && !snapshot.has(full)) {
          try {
            fs.unlinkSync(full);
          } catch {
            /* best effort */
          }
        }
      }
    } catch {
      /* best effort */
    }
  }
}
