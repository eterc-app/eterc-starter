export interface StorageUploadOptions {
  filename: string;
  contentType?: string;
  folder?: string;
  isPublic?: boolean;
}

export interface StorageUploadResult {
  key: string;
  url: string;
  size: number;
  contentType: string;
}

export interface IStorageProvider {
  readonly id: string;

  /** Uploads a file buffer or binary stream to storage. */
  upload(file: Buffer | Uint8Array, options: StorageUploadOptions): Promise<StorageUploadResult>;

  /** Deletes an object by key. */
  delete(key: string): Promise<boolean>;

  /** Resolves a public or signed URL for an object key. */
  getUrl(key: string, options?: { expiresInSeconds?: number }): Promise<string>;

  /** Checks if an object exists. */
  exists(key: string): Promise<boolean>;

  /** Optional runtime health probe used by /api/health. */
  healthCheck?(): Promise<{ ok: boolean; message: string }>;
}

