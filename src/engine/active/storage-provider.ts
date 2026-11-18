import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  IStorageProvider,
  StorageCapabilities,
  StorageListResult,
  StorageObjectInfo,
  StoragePutTarget,
  StoragePutTargetInput,
  StorageUploadOptions,
  StorageUploadResult,
  StorageVisibility,
} from "../contracts/storage";
import { PRIVATE_UPLOADS_DIR, UPLOAD_TMP_DIR, UPLOADS_DIR } from "../paths";
import { assert_storage_policy } from "./storage-policy";

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/;
const PRIVATE_PREFIX = "private/";
const MAX_LIST_KEYS = 5000;

function normalizeKey(value: string): string {
  return value
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

function keySegments(key: string): string[] {
  const normalized = normalizeKey(key);
  if (normalized === "") throw new Error("Storage key is required.");
  const segments = normalized.split("/");
  if (
    segments.length === 0 ||
    segments.some(
      (segment) =>
        !SAFE_SEGMENT.test(segment) ||
        segment === "." ||
        segment === ".." ||
        segment.toLowerCase() === "thumbs"
    )
  ) {
    throw new Error("Unsafe storage key.");
  }
  return segments;
}

function isPrivateKey(key: string): boolean {
  return normalizeKey(key).startsWith(PRIVATE_PREFIX);
}

/** Resolve a key to an absolute path inside the correct uploads root. */
export function resolveLocalUploadPath(key: string): string {
  const normalized = normalizeKey(key);
  const privateKey = isPrivateKey(normalized);
  const relative = privateKey
    ? normalized.slice(PRIVATE_PREFIX.length)
    : normalized;
  const segments = keySegments(relative);
  const root = privateKey ? PRIVATE_UPLOADS_DIR : UPLOADS_DIR;
  const target = path.resolve(root, ...segments);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error("Storage key escapes the uploads directory.");
  }
  return target;
}

function encodedPath(key: string): string {
  return normalizeKey(key)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function mimeForKey(key: string, bytes?: Buffer): string {
  const head = bytes?.subarray(0, 12).toString("latin1") ?? "";
  if (bytes && bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes &&
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (head.startsWith("GIF87a") || head.startsWith("GIF89a")) return "image/gif";
  if (head.startsWith("RIFF") && head.slice(8, 12) === "WEBP") return "image/webp";
  if (bytes?.subarray(0, 4).toString("latin1") === "%PDF") return "application/pdf";

  const extension = path.extname(key).toLowerCase();
  const byExtension: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".zip": "application/zip",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".csv": "text/csv",
    ".txt": "text/plain",
    ".rtf": "application/rtf",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".tar": "application/x-tar",
    ".gz": "application/gzip",
  };
  return byExtension[extension] ?? "application/octet-stream";
}

function uniqueKey(key: string): string {
  const extension = path.extname(key);
  const stem = key.slice(0, key.length - extension.length);
  return `${stem}-${crypto.randomUUID()}${extension}`;
}

function atomicWrite(target: string, bytes: Buffer): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const handle = fs.openSync(temp, "wx");
  try {
    fs.writeSync(handle, bytes);
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
  fs.renameSync(temp, target);
}

/**
 * Local disk storage. This is the Docker/self-hosted adapter. Private objects
 * live under data/private-uploads and are only served by the authenticated
 * download route.
 */
export class LocalDiskStorageProvider implements IStorageProvider {
  readonly id = "local";

  readonly capabilities: StorageCapabilities = {
    directUpload: true,
    multipart: false,
    serverUpload: true,
    publicRead: true,
    signedRead: false,
    list: true,
  };

  async createPutTarget(input: StoragePutTargetInput): Promise<StoragePutTarget> {
    assert_storage_policy();
    const segments = keySegments(
      isPrivateKey(input.key) ? input.key.slice(PRIVATE_PREFIX.length) : input.key
    );
    if (segments.length > 8) throw new Error("Storage key is too deep.");
    const expiresAt = new Date(
      Date.now() + Math.max(60, input.expiresInSeconds ?? 900) * 1000
    ).toISOString();
    return {
      key: normalizeKey(input.key),
      uploadUrl: "/api/media/uploads/local",
      method: "PUT",
      headers: { "Content-Type": input.contentType },
      expiresAt,
    };
  }

  async upload(file: Buffer | Uint8Array, options: StorageUploadOptions): Promise<StorageUploadResult> {
    assert_storage_policy();
    const visibility: StorageVisibility = options.isPublic === false ? "private" : "public";
    const provided = options.key ? normalizeKey(options.key) : "";
    const baseKey = provided
      ? provided
      : normalizeKey(
          [options.folder, path.basename(options.filename)].filter(Boolean).join("/")
        );
    const key = provided
      ? baseKey
      : visibility === "private"
        ? `${PRIVATE_PREFIX}${baseKey}`
        : baseKey;
    let target = resolveLocalUploadPath(key);
    let finalKey = key;
    if (fs.existsSync(target)) {
      finalKey = uniqueKey(key);
      target = resolveLocalUploadPath(finalKey);
    }
    atomicWrite(target, Buffer.from(file));
    return {
      key: finalKey,
      url: await this.getUrl(finalKey, { visibility }),
      size: file.byteLength,
      contentType: options.contentType || mimeForKey(finalKey, Buffer.from(file)),
    };
  }

  async uploadStream(
    stream: ReadableStream<Uint8Array>,
    options: StorageUploadOptions & { size?: number; visibility?: StorageVisibility }
  ): Promise<StorageUploadResult> {
    assert_storage_policy();
    const visibility = options.visibility ?? "public";
    const key = options.key
      ? normalizeKey(options.key)
      : (() => {
          const baseKey = normalizeKey(
            [options.folder, path.basename(options.filename)].filter(Boolean).join("/")
          );
          return visibility === "private" ? `${PRIVATE_PREFIX}${baseKey}` : baseKey;
        })();
    const target = resolveLocalUploadPath(key);
    if (fs.existsSync(target)) {
      throw new Error("A file with this upload key already exists.");
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.mkdirSync(UPLOAD_TMP_DIR, { recursive: true });
    const temp = path.join(UPLOAD_TMP_DIR, `${crypto.randomUUID()}.part`);

    const handle = fs.openSync(temp, "wx");
    const reader = stream.getReader();
    let size = 0;
    const max = options.size && options.size > 0 ? options.size : Number.POSITIVE_INFINITY;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        size += value.byteLength;
        if (size > max) {
          throw new Error("The upload exceeded its declared size.");
        }
        fs.writeSync(handle, value);
      }
      fs.fsyncSync(handle);
    } catch (error) {
      try {
        await reader.cancel();
      } catch {
        /* already cancelled */
      }
      try {
        fs.rmSync(temp, { force: true });
      } catch {
        /* best effort */
      }
      throw error;
    } finally {
      fs.closeSync(handle);
    }

    try {
      fs.renameSync(temp, target);
    } catch (error) {
      fs.rmSync(temp, { force: true });
      throw error;
    }

    return {
      key,
      url: await this.getUrl(key, { visibility }),
      size,
      contentType: options.contentType || mimeForKey(key),
    };
  }

  async stat(key: string): Promise<StorageObjectInfo | null> {
    try {
      const target = resolveLocalUploadPath(key);
      const stats = fs.statSync(target);
      if (!stats.isFile()) return null;
      const handle = fs.openSync(target, "r");
      const buffer = Buffer.alloc(64);
      let read = 0;
      try {
        read = fs.readSync(handle, buffer, 0, buffer.length, 0);
      } finally {
        fs.closeSync(handle);
      }
      return {
        key: normalizeKey(key),
        size: stats.size,
        contentType: mimeForKey(key, buffer.subarray(0, read)),
        lastModified: stats.mtime.toISOString(),
      };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const target = resolveLocalUploadPath(key);
      fs.unlinkSync(target);
      return true;
    } catch {
      return false;
    }
  }

  async getUrl(
    key: string,
    options?: { expiresInSeconds?: number; visibility?: StorageVisibility }
  ): Promise<string> {
    const normalized = normalizeKey(key);
    const privateObject =
      options?.visibility === "private" || isPrivateKey(normalized);
    return privateObject
      ? `/api/media/download/${encodedPath(normalized)}`
      : `/uploads/${encodedPath(normalized)}`;
  }

  async exists(key: string): Promise<boolean> {
    try {
      return fs.statSync(resolveLocalUploadPath(key)).isFile();
    } catch {
      return false;
    }
  }

  async list(prefix: string, cursor?: string): Promise<StorageListResult> {
    const normalized = normalizeKey(prefix);
    const privatePrefix = isPrivateKey(normalized);
    const root = privatePrefix ? PRIVATE_UPLOADS_DIR : UPLOADS_DIR;
    const relative = privatePrefix ? normalized.slice(PRIVATE_PREFIX.length) : normalized;
    const start = relative ? resolveLocalUploadPath(normalized) : root;
    const keys: string[] = [];
    const startAfter = cursor ? normalizeKey(cursor) : "";
    const walk = (directory: string, parent: string, depth: number): void => {
      if (keys.length >= MAX_LIST_KEYS || depth > 8) return;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(directory, { withFileTypes: true });
      } catch {
        return;
      }
      entries.sort((left, right) => left.name.localeCompare(right.name));
      for (const entry of entries) {
        if (keys.length >= MAX_LIST_KEYS) return;
        if (entry.name.startsWith(".") || entry.name === "thumbs") continue;
        const child = path.join(directory, entry.name);
        const key = parent ? `${parent}/${entry.name}` : entry.name;
        const fullKey = privatePrefix ? `${PRIVATE_PREFIX}${key}` : key;
        if (startAfter && fullKey <= startAfter) continue;
        if (entry.isDirectory()) {
          walk(child, key, depth + 1);
        } else if (entry.isFile()) {
          keys.push(fullKey);
        }
      }
    };
    try {
      const stats = fs.statSync(start);
      if (stats.isFile()) {
        return { keys: [normalized] };
      }
      walk(start, relative, 0);
    } catch {
      return { keys: [] };
    }
    return { keys };
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      assert_storage_policy();
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      fs.mkdirSync(PRIVATE_UPLOADS_DIR, { recursive: true });
      return { ok: true, message: "Local uploads directory is available." };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export const activeStorageProvider: IStorageProvider = new LocalDiskStorageProvider();
