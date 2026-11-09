import * as fs from "node:fs";
import * as path from "node:path";
import { UPLOADS_DIR } from "@/engine/paths";

export const MAX_UPLOAD_ASSET_RESULTS = 5000;
export const MAX_UPLOAD_FOLDER_RESULTS = 5000;
export const MAX_UPLOAD_FOLDER_DEPTH = 8;
const MAX_UPLOAD_SCAN_ENTRIES = 20_000;

export const IMAGE_UPLOAD_EXTENSIONS = new Set([
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".webp",
]);

export const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  ".csv",
  ".doc",
  ".docx",
  ".gif",
  ".gz",
  ".jpeg",
  ".jpg",
  ".mp3",
  ".mp4",
  ".pdf",
  ".png",
  ".ppt",
  ".pptx",
  ".rtf",
  ".tar",
  ".txt",
  ".wav",
  ".webm",
  ".webp",
  ".xls",
  ".xlsx",
  ".zip",
]);

export interface UploadAsset {
  url: string;
  thumbnail_url?: string;
  name: string;
  folder: string;
  size: number;
  kind: "image" | "file";
}

export interface UploadAssetListing {
  assets: UploadAsset[];
  folders: string[];
  truncated: boolean;
}

const SAFE_FOLDER_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const WINDOWS_RESERVED_FOLDER =
  /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

function isSafeFolderSegment(segment: string): boolean {
  return (
    SAFE_FOLDER_SEGMENT.test(segment) &&
    segment !== "." &&
    segment !== ".." &&
    !WINDOWS_RESERVED_FOLDER.test(segment)
  );
}

export function normalizeUploadFolder(
  value: unknown,
  fallback = "",
  maxDepth = MAX_UPLOAD_FOLDER_DEPTH
): string {
  const raw = String(value ?? "")
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/^uploads(?:\/|$)/i, "");
  const folder = raw || fallback;
  if (!folder) return "";

  const parts = folder.split("/");
  if (
    parts.length > maxDepth ||
    parts.some((part) => !isSafeFolderSegment(part))
  ) {
    throw new Error("Choose a valid folder inside uploads.");
  }
  return parts.join("/");
}

function assertUploadsRoot(): string {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const rootInfo = fs.lstatSync(UPLOADS_DIR);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error("The uploads directory must be a regular directory.");
  }
  return fs.realpathSync(UPLOADS_DIR);
}

function assertInsideUploads(directory: string, root: string): void {
  const resolved = path.resolve(directory);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Upload folder escapes the uploads directory.");
  }
}

export function ensureUploadFolder(
  folder: string,
  internalThumbnailDirectory = false
): string {
  const normalized = normalizeUploadFolder(
    folder,
    "",
    internalThumbnailDirectory
      ? MAX_UPLOAD_FOLDER_DEPTH + 1
      : MAX_UPLOAD_FOLDER_DEPTH
  );
  const segments = normalized.split("/").filter(Boolean);
  if (
    segments.some(
      (segment, index) =>
        segment.toLowerCase() === "thumbs" &&
        (!internalThumbnailDirectory || index !== segments.length - 1)
    )
  ) {
    throw new Error("The thumbs folder is reserved for generated image thumbnails.");
  }
  const root = assertUploadsRoot();
  let current = root;

  for (const segment of segments) {
    current = path.join(current, segment);
    assertInsideUploads(current, root);
    try {
      const info = fs.lstatSync(current);
      if (!info.isDirectory() || info.isSymbolicLink()) {
        throw new Error("Upload folders cannot contain symbolic links.");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      fs.mkdirSync(current);
    }
  }

  return current;
}

function encodedUploadUrl(folder: string, name: string): string {
  return `/uploads/${[...folder.split("/").filter(Boolean), name]
    .map(encodeURIComponent)
    .join("/")}`;
}

function imageThumbnailUrl(folder: string, name: string): string | undefined {
  const thumbnailFolder = path.join(UPLOADS_DIR, folder, "thumbs");
  try {
    const directoryInfo = fs.lstatSync(thumbnailFolder);
    if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) {
      return undefined;
    }
    const thumbnailPath = path.join(thumbnailFolder, name);
    const info = fs.lstatSync(thumbnailPath);
    if (!info.isFile() || info.isSymbolicLink()) return undefined;
    return encodedUploadUrl(`${folder}/thumbs`, name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export function listUploadAssets(): UploadAssetListing {
  const root = assertUploadsRoot();
  const assets: UploadAsset[] = [];
  const folders: string[] = [];
  let truncated = false;
  let scanned = 0;

  const walk = (directory: string, relative: string, depth: number) => {
    if (depth > MAX_UPLOAD_FOLDER_DEPTH || truncated) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }

    for (const entry of entries) {
      if (truncated) return;
      scanned += 1;
      if (scanned > MAX_UPLOAD_SCAN_ENTRIES) {
        truncated = true;
        return;
      }
      if (entry.name.startsWith(".") || entry.name.toLowerCase() === "thumbs") {
        continue;
      }
      const entryPath = path.join(directory, entry.name);
      let info: fs.Stats;
      try {
        info = fs.lstatSync(entryPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      if (info.isSymbolicLink()) continue;

      const folder = relative ? `${relative}/${entry.name}` : entry.name;
      if (info.isDirectory()) {
        if (!isSafeFolderSegment(entry.name)) continue;
        if (depth < MAX_UPLOAD_FOLDER_DEPTH) {
          if (folders.length >= MAX_UPLOAD_FOLDER_RESULTS) {
            truncated = true;
            return;
          }
          folders.push(folder);
        }
        walk(entryPath, folder, depth + 1);
        continue;
      }
      if (!info.isFile()) continue;

      const extension = path.extname(entry.name).toLowerCase();
      const isImage = IMAGE_UPLOAD_EXTENSIONS.has(extension);
      if (!isImage && !ALLOWED_UPLOAD_EXTENSIONS.has(extension)) continue;
      if (assets.length >= MAX_UPLOAD_ASSET_RESULTS) {
        truncated = true;
        return;
      }

      assets.push({
        url: encodedUploadUrl(relative, entry.name),
        ...(isImage
          ? { thumbnail_url: imageThumbnailUrl(relative, entry.name) }
          : {}),
        name: entry.name,
        folder: relative,
        size: info.size,
        kind: isImage ? "image" : "file",
      });
    }
  };

  walk(root, "", 0);
  folders.sort((a, b) => a.localeCompare(b));
  assets.sort((a, b) => a.name.localeCompare(b.name));
  return { assets, folders, truncated };
}

export function createUploadFolder(parent: string, name: string): string {
  const normalizedParent = normalizeUploadFolder(parent);
  const folderName = name.trim();
  if (!isSafeFolderSegment(folderName) || folderName.toLowerCase() === "thumbs") {
    throw new Error("Use a folder name with letters, numbers, dots, dashes, or underscores.");
  }

  const folder = normalizeUploadFolder(
    [normalizedParent, folderName].filter(Boolean).join("/")
  );
  ensureUploadFolder(folder);
  return folder;
}
