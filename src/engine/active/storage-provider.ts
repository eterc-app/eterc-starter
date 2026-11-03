import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  IStorageProvider,
  StorageUploadOptions,
  StorageUploadResult,
} from "../contracts/storage";
import { UPLOADS_DIR } from "../paths";

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/;

function safeKey(value: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/^\/+/, "");
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => !SAFE_SEGMENT.test(segment))) {
    throw new Error("Unsafe storage key.");
  }
  const target = path.resolve(UPLOADS_DIR, ...segments);
  const root = path.resolve(UPLOADS_DIR);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error("Storage key escapes the uploads directory.");
  }
  return target;
}

function keyFromOptions(options: StorageUploadOptions): string {
  const filename = path.basename(options.filename);
  if (!SAFE_SEGMENT.test(filename)) throw new Error("Unsafe upload filename.");
  const folder = (options.folder ?? "").replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
  const segments = folder ? folder.split("/") : [];
  if (segments.some((segment) => !SAFE_SEGMENT.test(segment))) {
    throw new Error("Unsafe upload folder.");
  }
  return [...segments, filename].join("/");
}

export class LocalDiskStorageProvider implements IStorageProvider {
  readonly id = "local";

  async upload(
    file: Buffer | Uint8Array,
    options: StorageUploadOptions,
  ): Promise<StorageUploadResult> {
    const key = keyFromOptions(options);
    const target = safeKey(key);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    try {
      fs.writeFileSync(target, Buffer.from(file), { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        const unique = crypto.randomUUID();
        const retryKey = key.replace(
          /(\.[^./]+)?$/,
          (extension) => `-${unique}${extension ?? ""}`,
        );
        const retry = safeKey(retryKey);
        fs.writeFileSync(retry, Buffer.from(file), { flag: "wx" });
        return {
          key: retryKey,
          url: `/uploads/${retryKey.split("/").map(encodeURIComponent).join("/")}`,
          size: file.byteLength,
          contentType: options.contentType || "application/octet-stream",
        };
      }
      throw error;
    }
    return {
      key,
      url: `/uploads/${key.split("/").map(encodeURIComponent).join("/")}`,
      size: file.byteLength,
      contentType: options.contentType || "application/octet-stream",
    };
  }

  async delete(key: string): Promise<boolean> {
    const target = safeKey(key);
    try {
      fs.unlinkSync(target);
      return true;
    } catch {
      return false;
    }
  }

  async getUrl(key: string): Promise<string> {
    return `/uploads/${key.split("/").map(encodeURIComponent).join("/")}`;
  }

  async exists(key: string): Promise<boolean> {
    try {
      return fs.statSync(safeKey(key)).isFile();
    } catch {
      return false;
    }
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      return { ok: true, message: "Local uploads directory is available." };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }
}

export const activeStorageProvider: IStorageProvider = new LocalDiskStorageProvider();
