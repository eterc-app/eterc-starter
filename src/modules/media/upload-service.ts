import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { activeStorageProvider } from "@/engine/active/storage-provider";
import { UPLOADS_DIR, PRIVATE_UPLOADS_DIR } from "@/engine/paths";
import { EtHttpError } from "@/engine/signals";
import type { CmsPrincipal } from "@/modules/cms/cms-types";
import {
  ALLOWED_UPLOAD_EXTENSIONS,
  IMAGE_UPLOAD_EXTENSIONS,
  normalizeUploadFolder,
} from "./upload-assets";
import {
  assert_media_quota,
  audit_media,
  create_pending_asset,
  delete_variants,
  ensure_media_schema,
  get_asset,
  get_asset_by_key,
  get_asset_row,
  insert_variant,
  list_asset_rows,
  mark_asset_error,
  mark_asset_quarantined,
  mark_asset_ready,
  max_bytes_for_kind,
  media_asset_url,
  migrate_legacy_media,
  row_to_asset,
  soft_delete_asset,
  update_asset_key,
  type MediaAsset,
  type MediaAssetRow,
  type MediaKind,
  type MediaVisibility,
} from "./media-registry";
import { create_upload_token, verify_upload_token } from "./upload-token";

const IMAGE_MAX_DIMENSION = 12000;
const IMAGE_PIXEL_LIMIT = 40_000_000;
const TOKEN_TTL_SECONDS = 900;
const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
]);

let schema_ready: Promise<void> | null = null;

async function ready(): Promise<void> {
  schema_ready ??= (async () => {
    await ensure_media_schema();
    await migrate_legacy_media();
  })().catch((error) => {
    schema_ready = null;
    throw error;
  });
  return schema_ready;
}

/** Ensure registry tables exist and legacy files are imported. */
export async function ensure_uploads_ready(): Promise<void> {
  await ready();
}

function title_from_name(name: string): string {
  const without_extension = name.replace(/\.[^.]+$/, "");
  const spaced = without_extension.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return (spaced === "" ? name : spaced).slice(0, 120);
}

function extension_of(name: string): string {
  return path.extname(name).toLowerCase();
}

function safe_original_name(name: string): string {
  const base = path.basename(String(name ?? "").replaceAll("\\", "/"));
  const cleaned = base.replace(/[^\w.\- ()[\]]+/g, "_").trim();
  return cleaned === "" ? "upload" : cleaned.slice(0, 180);
}

function assert_kind(value: string): MediaKind {
  if (value !== "image" && value !== "file") {
    throw new EtHttpError(400, "Choose an image or file to upload.");
  }
  return value;
}

function assert_visibility(value: string): MediaVisibility {
  if (value === "private") return "private";
  if (value === "public" || value === "") return "public";
  throw new EtHttpError(400, "Choose a valid file visibility.");
}

function assert_extension(kind: MediaKind, filename: string): string {
  const extension = extension_of(filename);
  if (kind === "image") {
    if (!IMAGE_UPLOAD_EXTENSIONS.has(extension)) {
      throw new EtHttpError(400, "Choose a JPG, PNG, GIF, or WEBP image.");
    }
  } else if (!ALLOWED_UPLOAD_EXTENSIONS.has(extension)) {
    throw new EtHttpError(
      400,
      "This file type is not supported. Choose a document, archive, audio, or video file."
    );
  }
  return extension.replace(/^\./, "");
}

function extension_for_mime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
  };
  return map[mime] ?? "";
}

function user_id_for(principal: CmsPrincipal): number {
  if (principal.user_id === null) {
    throw new EtHttpError(403, "Uploads require an administrator account.");
  }
  return principal.user_id;
}

function object_key(
  folder: string,
  extension: string,
  privateObject = false
): string {
  const date = new Date();
  const prefix = [
    folder,
    String(date.getUTCFullYear()),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
  ]
    .filter(Boolean)
    .join("/");
  const key = `${prefix}/${crypto.randomUUID()}${extension ? `.${extension}` : ""}`;
  return privateObject ? `private/${key}` : key;
}

function variant_key(asset: MediaAssetRow, name: string): { key: string; filename: string } {
  const basename = path.basename(asset.object_key).replace(/\.[^.]+$/, "");
  const directory = path.posix.dirname(asset.object_key);
  return {
    key: `${directory === "." ? "" : `${directory}/`}variants/${basename}-${name}.webp`,
    filename: `${basename}-${name}.webp`,
  };
}

async function provider_available(): Promise<void> {
  const provider = activeStorageProvider;
  if (provider.id === "local" && provider.healthCheck) {
    const check = await provider.healthCheck();
    if (!check.ok) throw new EtHttpError(503, check.message);
  }
}

export interface UploadTargetView {
  url: string;
  method: "PUT" | "POST";
  headers: Record<string, string>;
  fields?: Record<string, string>;
  expires_at: string;
}

export interface InitUploadResult {
  asset: {
    id: string;
    status: string;
    kind: MediaKind;
    folder: string;
    visibility: MediaVisibility;
    original_name: string;
    mime: string;
    max_bytes: number;
    expires_at: number;
  };
  upload: UploadTargetView;
}

export async function init_upload(input: {
  principal: CmsPrincipal;
  kind: string;
  filename: string;
  content_type?: string;
  size: number;
  folder?: string;
  visibility?: string;
}): Promise<InitUploadResult> {
  await ready();
  await provider_available();

  const kind = assert_kind(input.kind);
  const original_name = safe_original_name(input.filename);
  const extension = assert_extension(kind, original_name);
  const visibility = assert_visibility(input.visibility ?? "public");
  const provider = activeStorageProvider;
  if (
    visibility === "private" &&
    provider.id !== "local" &&
    provider.capabilities &&
    provider.capabilities.signedRead === false
  ) {
    throw new EtHttpError(
      400,
      "This storage provider does not support private objects. Choose a provider with signed reads."
    );
  }
  const size = Number(input.size);
  if (!Number.isFinite(size) || size <= 0) {
    throw new EtHttpError(400, "The selected file is empty.");
  }

  let folder: string;
  try {
    folder = normalizeUploadFolder(
      input.folder,
      kind === "image" ? "media" : "files"
    );
  } catch (error) {
    throw new EtHttpError(
      400,
      error instanceof Error ? error.message : "Choose a valid upload folder."
    );
  }

  const user_id = user_id_for(input.principal);
  await assert_media_quota(user_id, kind, size);

  const base_mime = String(input.content_type ?? "").split(";")[0].trim().toLowerCase();
  if (kind === "image" && base_mime !== "" && !ALLOWED_IMAGE_MIME.has(base_mime)) {
    throw new EtHttpError(400, "Choose a JPG, PNG, GIF, or WEBP image.");
  }

  const assetId = crypto.randomUUID();
  const expires_at = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const key = object_key(
    folder,
    extension,
    provider.id === "local" && visibility === "private"
  );

  const target = provider.createPutTarget
    ? await provider.createPutTarget({
        key,
        contentType: base_mime || "application/octet-stream",
        size,
        visibility,
        expiresInSeconds: TOKEN_TTL_SECONDS,
      })
    : {
        key,
        uploadUrl: "/api/media/uploads/relay",
        method: "PUT" as const,
        headers: {
          "Content-Type": base_mime || "application/octet-stream",
        },
        expiresAt: new Date(expires_at * 1000).toISOString(),
      };

  await create_pending_asset({
    id: assetId,
    provider: provider.id,
    object_key: key,
    original_name,
    title: title_from_name(original_name),
    mime: base_mime || "application/octet-stream",
    extension,
    size,
    kind,
    folder,
    visibility,
    uploaded_by: user_id,
    expires_at,
  });

  const headers: Record<string, string> = { ...target.headers };
  if (provider.id === "local" || !provider.createPutTarget) {
    const { token } = create_upload_token(
      {
        assetId,
        userId: user_id,
        kind,
        key,
        maxBytes: size,
        mime: base_mime || "application/octet-stream",
        visibility,
      },
      TOKEN_TTL_SECONDS
    );
    headers["x-upload-token"] = token;
  }

  await audit_media({
    asset_id: assetId,
    user_id,
    action: "init",
    detail: { kind, size, folder, visibility, provider: provider.id },
  });

  return {
    asset: {
      id: assetId,
      status: "pending",
      kind,
      folder,
      visibility,
      original_name,
      mime: base_mime || "application/octet-stream",
      max_bytes: max_bytes_for_kind(kind),
      expires_at,
    },
    upload: {
      url: target.uploadUrl,
      method: target.method,
      headers,
      ...(target.fields ? { fields: target.fields } : {}),
      expires_at: target.expiresAt,
    },
  };
}

function sniff_document(bytes: Buffer, extension: string): { ok: boolean; mime: string } {
  const head = bytes.subarray(0, 12).toString("latin1");
  const zip = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  const ole =
    bytes.length >= 8 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0;
  const gzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  const pdf = head.startsWith("%PDF");
  const rtf = head.startsWith("{\\rtf");
  const mp3 =
    head.startsWith("ID3") ||
    (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  const wav = head.startsWith("RIFF") && head.slice(8, 12) === "WAVE";
  const webm = bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  const mp4 = bytes.length >= 12 && bytes.subarray(4, 8).toString("latin1") === "ftyp";
  const tar =
    bytes.length >= 262 && bytes.subarray(257, 262).toString("latin1") === "ustar";

  switch (extension) {
    case ".pdf":
      return { ok: pdf, mime: "application/pdf" };
    case ".zip":
      return { ok: zip, mime: "application/zip" };
    case ".gz":
      return { ok: gzip, mime: "application/gzip" };
    case ".tar":
      return { ok: tar, mime: "application/x-tar" };
    case ".docx":
      return {
        ok: zip,
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };
    case ".xlsx":
      return {
        ok: zip,
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      };
    case ".pptx":
      return {
        ok: zip,
        mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      };
    case ".doc":
      return { ok: ole, mime: "application/msword" };
    case ".xls":
      return { ok: ole, mime: "application/vnd.ms-excel" };
    case ".ppt":
      return { ok: ole, mime: "application/vnd.ms-powerpoint" };
    case ".rtf":
      return { ok: rtf, mime: "application/rtf" };
    case ".mp3":
      return { ok: mp3, mime: "audio/mpeg" };
    case ".wav":
      return { ok: wav, mime: "audio/wav" };
    case ".mp4":
      return { ok: mp4, mime: "video/mp4" };
    case ".webm":
      return { ok: webm, mime: "video/webm" };
    case ".csv":
    case ".txt":
      return { ok: !bytes.includes(0), mime: extension === ".csv" ? "text/csv" : "text/plain" };
    case ".jpg":
    case ".jpeg":
    case ".png":
    case ".gif":
    case ".webp":
      return { ok: true, mime: "" };
    default:
      return { ok: false, mime: "application/octet-stream" };
  }
}

async function load_sharp(): Promise<typeof import("sharp").default> {
  const module = await import("sharp");
  return module.default;
}

async function object_bytes(
  asset: MediaAssetRow,
  max_bytes: number,
  prefixOnly = false
): Promise<Buffer> {
  if (asset.provider === "local") {
    const is_private = asset.object_key.startsWith("private/");
    const base = is_private ? PRIVATE_UPLOADS_DIR : UPLOADS_DIR;
    const relative = is_private
      ? asset.object_key.replace(/^private\//, "")
      : asset.object_key;
    const target = path.resolve(base, relative);
    if (target !== base && !target.startsWith(`${base}${path.sep}`)) {
      throw new EtHttpError(400, "Unsafe media path.");
    }
    const stats = fs.statSync(target);
    if (stats.size > max_bytes) {
      throw new EtHttpError(413, "The uploaded object is larger than allowed.");
    }
    if (prefixOnly) {
      const handle = fs.openSync(target, "r");
      const buffer = Buffer.alloc(Math.min(65536, stats.size));
      try {
        fs.readSync(handle, buffer, 0, buffer.length, 0);
      } finally {
        fs.closeSync(handle);
      }
      return buffer;
    }
    return fs.readFileSync(target);
  }

  const url = await activeStorageProvider.getUrl(asset.object_key, {
    expiresInSeconds: 120,
    visibility: asset.visibility === "private" ? "private" : "public",
  });
  const response = await fetch(url, {
    headers: prefixOnly ? { Range: "bytes=0-65535" } : undefined,
  });
  if (!response.ok) {
    throw new EtHttpError(502, "The uploaded object could not be read back.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new EtHttpError(502, "The uploaded object could not be read back.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  const cap = prefixOnly ? Math.min(65536, max_bytes) : max_bytes;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel();
      if (prefixOnly) {
        const joined = Buffer.concat(chunks);
        return joined.subarray(0, cap);
      }
      throw new EtHttpError(413, "The uploaded object is larger than allowed.");
    }
    chunks.push(value);
    if (prefixOnly && total >= cap) {
      await reader.cancel();
      break;
    }
  }
  return Buffer.concat(chunks);
}

async function progressive_read_bytes(
  asset: MediaAssetRow,
  max_bytes: number
): Promise<Buffer> {
  if (asset.provider === "local") return object_bytes(asset, max_bytes);
  const url = await activeStorageProvider.getUrl(asset.object_key, {
    expiresInSeconds: 120,
    visibility: asset.visibility === "private" ? "private" : "public",
  });
  const response = await fetch(url);
  if (!response.ok) {
    throw new EtHttpError(502, "The uploaded object could not be read back.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new EtHttpError(502, "The uploaded object could not be read back.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > max_bytes) {
      await reader.cancel();
      throw new EtHttpError(413, "The uploaded object is larger than allowed.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function scan_bytes(
  bytes: Buffer,
  filename: string
): Promise<{ clean: boolean; message?: string; unavailable?: boolean }> {
  const mode = String(process.env.ET_UPLOAD_SCAN ?? "off").trim().toLowerCase();
  if (mode === "off" || mode === "") return { clean: true };
  const url = String(process.env.ET_UPLOAD_SCAN_URL ?? "").trim();
  if (!url) {
    if (mode === "required") {
      throw new EtHttpError(503, "Upload scanning is required but not configured.");
    }
    return { clean: true, unavailable: true };
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "x-filename": filename,
        ...(process.env.ET_UPLOAD_SCAN_TOKEN
          ? { Authorization: `Bearer ${process.env.ET_UPLOAD_SCAN_TOKEN}` }
          : {}),
      },
      body: new Uint8Array(bytes),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Scanner returned ${response.status}.`);
    const payload = (await response.json()) as { clean?: boolean; message?: string };
    if (payload.clean === true) return { clean: true };
    return { clean: false, message: payload.message ?? "The file did not pass the malware scan." };
  } catch (error) {
    if (mode === "required") {
      throw new EtHttpError(
        503,
        error instanceof Error ? error.message : "The malware scanner is unavailable."
      );
    }
    return { clean: true, message: "Malware scanner unavailable.", unavailable: true };
  }
}

async function upload_variants(
  asset: MediaAssetRow,
  bytes: Buffer,
  width: number,
  height: number,
  private_visibility: boolean
): Promise<void> {
  const sharp = await load_sharp();
  const sizes: Array<{ name: string; max: number }> = [
    { name: "thumb", max: 480 },
    { name: "sm", max: 960 },
    { name: "md", max: 1600 },
    { name: "lg", max: 2400 },
  ];
  for (const variant of sizes) {
    if (width <= variant.max && height <= variant.max && variant.name !== "thumb") {
      continue;
    }
    const pipeline = sharp(bytes, {
      animated: false,
      limitInputPixels: IMAGE_PIXEL_LIMIT,
      failOn: "error",
    })
      .rotate()
      .resize({
        width: variant.max,
        height: variant.max,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: variant.name === "thumb" ? 72 : 82 });
    const output = await pipeline.toBuffer();
    const metadata = await sharp(output).metadata();
    const { key, filename } = variant_key(asset, variant.name);
    const result = await activeStorageProvider.upload(output, {
      filename,
      key,
      contentType: "image/webp",
      isPublic: !private_visibility,
    });
    await insert_variant({
      asset_id: asset.id,
      name: variant.name,
      object_key: result.key,
      mime: "image/webp",
      width: metadata.width ?? null,
      height: metadata.height ?? null,
      bytes: output.byteLength,
    });
  }
}

async function find_duplicate(
  asset: MediaAssetRow,
  checksum: string
): Promise<MediaAssetRow | null> {
  const rows = await list_asset_rows({
    kind: asset.kind as MediaKind,
    folder: asset.folder,
    status: "ready",
    limit: 50,
  });
  return (
    rows.find(
      (row) =>
        row.id !== asset.id &&
        row.provider === asset.provider &&
        row.visibility === asset.visibility &&
        row.checksum === checksum
    ) ?? null
  );
}

async function delete_object(provider: string, key: string): Promise<boolean> {
  if (provider === activeStorageProvider.id) {
    return activeStorageProvider.delete(key).catch(() => false);
  }
  if (provider === "local") {
    const privateObject = key.startsWith("private/");
    const base = privateObject ? PRIVATE_UPLOADS_DIR : UPLOADS_DIR;
    const relative = privateObject ? key.replace(/^private\//, "") : key;
    const target = path.resolve(base, relative);
    if (target !== base && !target.startsWith(`${base}${path.sep}`)) return false;
    try {
      fs.rmSync(target, { force: true });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export interface CompleteUploadResult {
  asset: MediaAsset;
  deduplicated: boolean;
}

export async function complete_upload(input: {
  principal: CmsPrincipal;
  asset_id: string;
}): Promise<CompleteUploadResult> {
  await ready();
  const user_id = user_id_for(input.principal);
  const asset = await get_asset_row(input.asset_id);
  if (!asset) throw new EtHttpError(404, "That upload was not found.");
  if (Number(asset.uploaded_by ?? 0) !== user_id && !input.principal.role.admin_access) {
    throw new EtHttpError(403, "This upload belongs to another account.");
  }
  if (asset.status === "ready") {
    return { asset: await row_to_asset(asset), deduplicated: false };
  }
  if (asset.status !== "pending") {
    throw new EtHttpError(409, "This upload is no longer pending.");
  }
  if (asset.expires_at !== null && Number(asset.expires_at) < Math.floor(Date.now() / 1000)) {
    throw new EtHttpError(410, "This upload link has expired. Start the upload again.");
  }
  if (asset.provider !== activeStorageProvider.id) {
    throw new EtHttpError(
      409,
      "The storage provider changed while the upload was in progress. Try again."
    );
  }

  const kind = (asset.kind === "file" ? "file" : "image") as MediaKind;
  const max_bytes = max_bytes_for_kind(kind);
  let stat = activeStorageProvider.stat
    ? await activeStorageProvider.stat(asset.object_key)
    : null;

  if (!stat) {
    const exists = await activeStorageProvider.exists(asset.object_key);
    if (!exists) throw new EtHttpError(400, "The upload did not reach storage.");
    stat = {
      key: asset.object_key,
      size: Number(asset.size ?? 0),
      contentType: String(asset.mime ?? "application/octet-stream"),
    };
  }

  if (stat.size <= 0) throw new EtHttpError(400, "The uploaded object is empty.");
  if (stat.size > max_bytes) {
    await activeStorageProvider.delete(asset.object_key).catch(() => false);
    await mark_asset_error(asset.id, "Uploaded object exceeded the size limit.");
    throw new EtHttpError(413, "The uploaded object is larger than allowed.");
  }
  if (Number(asset.size ?? 0) > 0 && stat.size > Number(asset.size) + 1024) {
    await activeStorageProvider.delete(asset.object_key).catch(() => false);
    await mark_asset_error(asset.id, "Uploaded object exceeded its declared size.");
    throw new EtHttpError(413, "The uploaded object is larger than its declared size.");
  }

  const extension = `.${String(asset.extension || "").replace(/^\./, "")}`;
  let bytes: Buffer;
  try {
    bytes = await progressive_read_bytes(asset, max_bytes);
  } catch (error) {
    await activeStorageProvider.delete(asset.object_key).catch(() => false);
    await mark_asset_error(
      asset.id,
      error instanceof Error ? error.message : "The uploaded object could not be read."
    );
    throw error;
  }

  let mime = stat.contentType || "application/octet-stream";
  let width: number | null = null;
  let height: number | null = null;
  let actual_size = stat.size;

  if (kind === "image") {
    const sharp = await load_sharp();
    let metadata: { format?: string; width?: number; height?: number } | null = null;
    try {
      metadata = await sharp(bytes, {
        animated: false,
        limitInputPixels: IMAGE_PIXEL_LIMIT,
        failOn: "error",
      }).metadata();
    } catch {
      await activeStorageProvider.delete(asset.object_key).catch(() => false);
      await mark_asset_error(asset.id, "The uploaded file is not a supported image.");
      throw new EtHttpError(400, "The uploaded file is not a supported image.");
    }
    actual_size = bytes.byteLength;
    mime = metadata?.format ? `image/${metadata.format === "jpg" ? "jpeg" : metadata.format}` : "";
    if (!ALLOWED_IMAGE_MIME.has(mime)) {
      await activeStorageProvider.delete(asset.object_key).catch(() => false);
      await mark_asset_error(asset.id, "The uploaded image format is not supported.");
      throw new EtHttpError(400, "Only JPG, PNG, GIF, and WEBP images are supported.");
    }
    if (!metadata?.width || !metadata?.height) {
      throw new EtHttpError(400, "The uploaded image could not be read.");
    }
    if (metadata.width > IMAGE_MAX_DIMENSION || metadata.height > IMAGE_MAX_DIMENSION) {
      await activeStorageProvider.delete(asset.object_key).catch(() => false);
      await mark_asset_error(asset.id, "The uploaded image dimensions are too large.");
      throw new EtHttpError(413, "The uploaded image dimensions are too large.");
    }
    width = metadata.width;
    height = metadata.height;

    const expected_extension = extension_for_mime(mime);
    if (expected_extension && extension !== `.${expected_extension}` && extension !== ".jpeg") {
      const corrected = asset.object_key.replace(/\.[^./]+$/, `.${expected_extension}`);
      if (corrected !== asset.object_key) {
        await activeStorageProvider.delete(asset.object_key).catch(() => false);
        await mark_asset_error(asset.id, "The image extension did not match its content.");
        throw new EtHttpError(
          400,
          "The image extension does not match its content. Rename it and upload again."
        );
      }
    }
  } else {
    const detected = sniff_document(bytes, extension);
    if (!detected.ok) {
      await activeStorageProvider.delete(asset.object_key).catch(() => false);
      await mark_asset_error(asset.id, "The file content does not match its extension.");
      throw new EtHttpError(400, "The file content does not match its extension.");
    }
    if (detected.mime !== "") mime = detected.mime;
  }

  let scan: { clean: boolean; message?: string; unavailable?: boolean };
  try {
    scan = await scan_bytes(bytes, asset.original_name);
  } catch (error) {
    await activeStorageProvider.delete(asset.object_key).catch(() => false);
    await mark_asset_error(
      asset.id,
      error instanceof Error ? error.message : "The malware scanner is unavailable."
    );
    throw error;
  }
  if (!scan.clean) {
    await activeStorageProvider.delete(asset.object_key).catch(() => false);
    await mark_asset_quarantined(asset.id, scan.message ?? "Malware scan failed.");
    throw new EtHttpError(422, scan.message ?? "The file did not pass the malware scan.");
  }

  const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
  const duplicate = await find_duplicate(asset, checksum);
  if (duplicate) {
    await activeStorageProvider.delete(asset.object_key).catch(() => false);
    await soft_delete_asset(asset);
    await audit_media({
      asset_id: asset.id,
      user_id,
      action: "deduplicate",
      detail: { duplicate_of: duplicate.id, checksum },
    });
    return { asset: await row_to_asset(duplicate), deduplicated: true };
  }

  if (kind === "image") {
    try {
      await upload_variants(asset, bytes, width ?? 0, height ?? 0, asset.visibility === "private");
    } catch {
      /* variants are best-effort; the original remains valid */
    }
  }

  await mark_asset_ready({
    id: asset.id,
    size: actual_size,
    mime,
    checksum,
    width,
    height,
  });

  await audit_media({
    asset_id: asset.id,
    user_id,
    action: "complete",
    detail: { size: actual_size, mime, checksum },
  });

  const fresh = await get_asset(asset.id);
  if (!fresh) throw new EtHttpError(500, "The upload could not be finalized.");
  return { asset: fresh, deduplicated: false };
}

export async function delete_upload(input: {
  principal: CmsPrincipal;
  asset_id?: string;
  file?: string;
}): Promise<void> {
  await ready();
  const user_id = user_id_for(input.principal);
  let row: MediaAssetRow | null = null;
  if (input.asset_id) row = await get_asset_row(input.asset_id);
  if (!row && input.file) row = await get_asset_by_key("local", `media/${input.file}`);
  if (!row && input.file) {
    const candidates = await list_asset_rows({ kind: "file", limit: 500 });
    row = candidates.find((candidate) => candidate.object_key.endsWith(`/${input.file}`)) ?? null;
  }
  if (!row || row.deleted_at !== null) {
    throw new EtHttpError(404, "That media asset no longer exists.");
  }
  if (Number(row.uploaded_by ?? 0) !== user_id && !input.principal.role.admin_access) {
    throw new EtHttpError(403, "This media asset belongs to another account.");
  }

  await delete_object(row.provider, row.object_key);
  const variant_keys = await delete_variants(row.id);
  for (const key of variant_keys) {
    await delete_object(row.provider, key);
  }
  await soft_delete_asset(row);
  await audit_media({
    asset_id: row.id,
    user_id,
    action: "delete",
    detail: { key: row.object_key },
  });
}

export async function cleanup_pending_uploads(): Promise<{ deleted: number }> {
  await ready();
  const cutoff = Math.floor(Date.now() / 1000) - 1800;
  const rows = await list_asset_rows({ status: "pending", limit: 500 });
  let deleted = 0;
  for (const row of rows) {
    if (row.expires_at === null || Number(row.expires_at) > cutoff) continue;
    await delete_object(row.provider, row.object_key);
    await soft_delete_asset(row);
    deleted += 1;
  }
  return { deleted };
}

export async function reconcile_uploads(): Promise<{
  registry: number;
  storage: number;
  orphans: string[];
  missing: string[];
}> {
  await ready();
  if (!activeStorageProvider.list) {
    throw new EtHttpError(501, "This storage provider does not support reconciliation.");
  }
  const rows = await list_asset_rows({ limit: 5000 });
  const registry_keys = new Set(rows.map((row) => row.object_key));
  const storage_keys = new Set<string>();
  const listing = await activeStorageProvider.list("");
  for (const key of listing.keys) storage_keys.add(key);
  const private_listing = await activeStorageProvider.list("private/");
  for (const key of private_listing.keys) storage_keys.add(key);
  const orphans = [...storage_keys].filter((key) => !registry_keys.has(key));
  const missing = [...registry_keys].filter((key) => !storage_keys.has(key));
  return {
    registry: registry_keys.size,
    storage: storage_keys.size,
    orphans,
    missing,
  };
}

export async function download_upload(input: {
  principal: CmsPrincipal;
  key: string;
}): Promise<{ redirect: string } | { file: { path: string; mime: string; name: string } }> {
  await ready();
  const normalized = String(input.key ?? "").replace(/^\/+/, "");
  const row = await get_asset_by_key(activeStorageProvider.id, normalized);
  if (!row || row.status === "deleted") {
    throw new EtHttpError(404, "That file no longer exists.");
  }
  const admin = input.principal.role.admin_access;
  const owner = Number(row.uploaded_by ?? 0) === Number(input.principal.user_id ?? -1);
  if (row.visibility !== "public" && !admin && !owner) {
    throw new EtHttpError(403, "You do not have access to this file.");
  }
  if (row.visibility === "private") {
    await audit_media({
      asset_id: row.id,
      user_id: input.principal.user_id,
      action: "download",
      detail: { key: row.object_key },
    });
  }
  if (row.provider !== "local") {
    const url = await activeStorageProvider.getUrl(row.object_key, {
      expiresInSeconds: 300,
      visibility: "private",
    });
    return { redirect: url };
  }
  const base = normalized.startsWith("private/") ? PRIVATE_UPLOADS_DIR : UPLOADS_DIR;
  const relative = normalized.startsWith("private/")
    ? normalized.replace(/^private\//, "")
    : normalized;
  const target = path.resolve(base, relative);
  if (target !== base && !target.startsWith(`${base}${path.sep}`)) {
    throw new EtHttpError(404, "That file no longer exists.");
  }
  if (!fs.existsSync(target)) throw new EtHttpError(404, "That file no longer exists.");
  return {
    file: {
      path: target,
      mime: row.mime || "application/octet-stream",
      name: row.original_name,
    },
  };
}

export async function receive_local_upload(input: {
  token: string;
  stream: ReadableStream<Uint8Array>;
  contentLength?: number | null;
}): Promise<{ key: string; size: number }> {
  await ready();
  const verified = verify_upload_token(input.token);
  if (!verified.ok) throw new EtHttpError(401, verified.error);
  const payload = verified.payload;
  const row = await get_asset_row(payload.assetId);
  if (!row || row.status !== "pending") {
    throw new EtHttpError(409, "This upload is no longer pending.");
  }
  if (row.object_key !== payload.key) {
    throw new EtHttpError(400, "The upload token does not match this asset.");
  }
  if (input.contentLength && input.contentLength > payload.maxBytes) {
    throw new EtHttpError(413, "The upload is larger than allowed.");
  }
  const provider = activeStorageProvider;
  if (!provider.uploadStream) {
    throw new EtHttpError(501, "This storage provider does not accept streamed uploads.");
  }
  const result = await provider.uploadStream(input.stream, {
    filename: path.basename(payload.key),
    key: payload.key,
    contentType: payload.mime,
    size: payload.maxBytes,
    visibility: payload.visibility,
    isPublic: payload.visibility === "public",
  });
  if (result.key !== payload.key) {
    throw new EtHttpError(409, "The upload key changed unexpectedly. Try again.");
  }
  return { key: result.key, size: result.size };
}

async function read_stream_capped(
  stream: ReadableStream<Uint8Array>,
  max_bytes: number
): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > max_bytes) {
        throw new EtHttpError(413, "The upload is larger than allowed.");
      }
      chunks.push(value);
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* already closed */
    }
  }
  return Buffer.concat(chunks);
}

/**
 * Server relay for providers without a presigned upload API (for example
 * UploadThing or Vercel Blob). Streams when the adapter supports it and falls
 * back to a bounded buffer for legacy adapters.
 */
export async function receive_relay_upload(input: {
  token: string;
  stream: ReadableStream<Uint8Array>;
  contentLength?: number | null;
}): Promise<{ key: string; size: number }> {
  await ready();
  const verified = verify_upload_token(input.token);
  if (!verified.ok) throw new EtHttpError(401, verified.error);
  const payload = verified.payload;
  const row = await get_asset_row(payload.assetId);
  if (!row || row.status !== "pending") {
    throw new EtHttpError(409, "This upload is no longer pending.");
  }
  if (row.object_key !== payload.key) {
    throw new EtHttpError(400, "The upload token does not match this asset.");
  }
  if (input.contentLength && input.contentLength > payload.maxBytes) {
    throw new EtHttpError(413, "The upload is larger than allowed.");
  }
  const provider = activeStorageProvider;

  if (provider.uploadStream) {
    const result = await provider.uploadStream(input.stream, {
      filename: path.basename(payload.key),
      key: payload.key,
      contentType: payload.mime,
      size: payload.maxBytes,
      visibility: payload.visibility,
      isPublic: payload.visibility === "public",
    });
    if (result.key !== payload.key) {
      await update_asset_key(row.id, result.key);
    }
    return { key: result.key, size: result.size };
  }

  if (!provider.upload) {
    throw new EtHttpError(501, "This storage provider cannot accept uploads.");
  }
  const bytes = await read_stream_capped(input.stream, payload.maxBytes);
  const result = await provider.upload(bytes, {
    filename: path.basename(payload.key),
    key: payload.key,
    contentType: payload.mime,
    isPublic: payload.visibility === "public",
  });
  if (result.key !== payload.key) {
    await update_asset_key(row.id, result.key);
  }
  return { key: result.key, size: result.size };
}

export async function asset_download_url(asset: MediaAsset): Promise<string> {
  return media_asset_url({
    provider: asset.provider,
    object_key: asset.object_key,
    visibility: asset.visibility,
  });
}
