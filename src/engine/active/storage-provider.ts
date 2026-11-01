import fs from "node:fs";
import path from "node:path";
import type {
  IStorageProvider,
  StorageUploadOptions,
  StorageUploadResult,
} from "../contracts/storage";
import { UPLOADS_DIR } from "../paths";

export class LocalDiskStorageProvider implements IStorageProvider {
  readonly id = "local";

  async upload(file: Buffer | Uint8Array, options: StorageUploadOptions): Promise<StorageUploadResult> {
    const targetFolder = options.folder ? path.join(UPLOADS_DIR, options.folder) : UPLOADS_DIR;
    fs.mkdirSync(targetFolder, { recursive: true });

    const key = options.folder ? `${options.folder}/${options.filename}` : options.filename;
    const filePath = path.join(UPLOADS_DIR, key);

    fs.writeFileSync(filePath, Buffer.from(file));

    return {
      key,
      url: `/uploads/${key}`,
      size: file.byteLength,
      contentType: options.contentType || "application/octet-stream",
    };
  }

  async delete(key: string): Promise<boolean> {
    const filePath = path.join(UPLOADS_DIR, key);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  }

  async getUrl(key: string): Promise<string> {
    return `/uploads/${key}`;
  }

  async exists(key: string): Promise<boolean> {
    const filePath = path.join(UPLOADS_DIR, key);
    return fs.existsSync(filePath);
  }
}

export const activeStorageProvider: IStorageProvider = new LocalDiskStorageProvider();

