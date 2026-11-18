export type StorageVisibility = "public" | "private";

export interface StorageUploadOptions {
  filename: string;
  contentType?: string;
  folder?: string;
  isPublic?: boolean;
  /** Exact object key. When set, folder/filename are ignored. */
  key?: string;
}

export interface StorageUploadResult {
  key: string;
  url: string;
  size: number;
  contentType: string;
}

export interface StorageObjectInfo {
  key: string;
  size: number;
  contentType: string;
  etag?: string;
  lastModified?: string;
}

export interface StoragePutTargetInput {
  key: string;
  contentType: string;
  size: number;
  visibility: StorageVisibility;
  expiresInSeconds?: number;
}

/**
 * A browser-reachable upload target. `headers` and `fields` are safe to expose
 * to the client: they contain only a short-lived signature, never credentials.
 */
export interface StoragePutTarget {
  key: string;
  uploadUrl: string;
  method: "PUT" | "POST";
  headers: Record<string, string>;
  fields?: Record<string, string>;
  expiresAt: string;
  publicUrl?: string;
}

export interface StorageCapabilities {
  /** The browser can upload bytes directly with a presigned URL. */
  directUpload: boolean;
  /** Multipart/resumable uploads are available for large objects. */
  multipart: boolean;
  /** The server can upload a buffer through the adapter. */
  serverUpload: boolean;
  /** Objects can be read through a stable public URL/CDN. */
  publicRead: boolean;
  /** Short-lived signed read URLs are available. */
  signedRead: boolean;
  /** Prefix listing is available for reconciliation. */
  list: boolean;
}

export interface StorageListResult {
  keys: string[];
  next?: string;
}

export interface IStorageProvider {
  readonly id: string;

  /** Capabilities are optional for adapters generated before storage v2. */
  readonly capabilities?: StorageCapabilities;

  /** Uploads a file buffer or binary stream to storage. */
  upload(file: Buffer | Uint8Array, options: StorageUploadOptions): Promise<StorageUploadResult>;

  /**
   * Streams bytes into storage without buffering the whole object. Implemented
   * by the local adapter; remote adapters may omit it and use presigned uploads.
   */
  uploadStream?(
    stream: ReadableStream<Uint8Array>,
    options: StorageUploadOptions & { size?: number; visibility?: StorageVisibility }
  ): Promise<StorageUploadResult>;

  /** Creates a browser-reachable presigned upload target. */
  createPutTarget?(input: StoragePutTargetInput): Promise<StoragePutTarget>;

  /** Returns object metadata, or null when the object does not exist. */
  stat?(key: string): Promise<StorageObjectInfo | null>;

  /** Deletes an object by key. */
  delete(key: string): Promise<boolean>;

  /** Resolves a public or signed URL for an object key. */
  getUrl(key: string, options?: { expiresInSeconds?: number; visibility?: StorageVisibility }): Promise<string>;

  /** Checks if an object exists. */
  exists(key: string): Promise<boolean>;

  /** Prefix listing used by reconciliation jobs. */
  list?(prefix: string, cursor?: string): Promise<StorageListResult>;

  /** Optional runtime health probe used by /api/health. */
  healthCheck?(): Promise<{ ok: boolean; message: string }>;
}
