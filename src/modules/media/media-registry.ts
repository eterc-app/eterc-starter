import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { activeCacheProvider } from "@/engine/active/cache-provider";
import { activeStorageProvider } from "@/engine/active/storage-provider";
import { db, type Row } from "@/engine/db";
import {
  DATA_DIR,
  UPLOADS_DIR,
} from "@/engine/paths";
import { EtHttpError } from "@/engine/signals";
import { ensure_cms_schema } from "@/modules/cms/cms-schema";
import {
  ALLOWED_UPLOAD_EXTENSIONS,
  IMAGE_UPLOAD_EXTENSIONS,
} from "./upload-assets";

export type MediaAssetStatus = "pending" | "ready" | "quarantined" | "deleted";
export type MediaKind = "image" | "file";
export type MediaVisibility = "public" | "private";

export interface MediaVariant {
  name: string;
  object_key: string;
  mime: string;
  width: number | null;
  height: number | null;
  bytes: number;
  url: string;
}

export interface MediaAsset {
  id: string;
  status: MediaAssetStatus;
  provider: string;
  bucket: string | null;
  object_key: string;
  original_name: string;
  title: string;
  alt: string;
  mime: string;
  extension: string;
  size: number;
  checksum: string | null;
  width: number | null;
  height: number | null;
  kind: MediaKind;
  folder: string;
  visibility: MediaVisibility;
  uploaded_by: number | null;
  error: string | null;
  expires_at: number | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  url: string;
  thumbnail_url: string;
  variants: MediaVariant[];
}

export interface MediaAssetRow extends Row {
  id: string;
  status: string;
  provider: string;
  bucket: string | null;
  object_key: string;
  original_name: string;
  title: string;
  alt: string;
  mime: string;
  extension: string;
  size: number;
  checksum: string | null;
  width: number | null;
  height: number | null;
  kind: string;
  folder: string;
  visibility: string;
  uploaded_by: number | null;
  error: string | null;
  expires_at: number | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface MediaItemView {
  id: string;
  file: string;
  original_name: string;
  title: string;
  alt: string;
  mime: string;
  size: number;
  width: number;
  height: number;
  created_at: string;
  url: string;
  thumbnail_url: string;
  has_thumbnail: boolean;
  visibility: MediaVisibility;
  folder: string;
  kind: MediaKind;
}

export interface MediaStatsView {
  count: number;
  total_bytes: number;
  total_label: string;
}

const MEDIA_FOLDER = "media";
const MEDIA_INDEX_PATH = path.join(
  DATA_DIR,
  "settings",
  "media_library",
  "index.json"
);

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function parse_variants(rows: Row[]): MediaVariant[] {
  return rows.map((row) => ({
    name: String(row.name ?? ""),
    object_key: String(row.object_key ?? ""),
    mime: String(row.mime ?? ""),
    width: row.width === null || row.width === undefined ? null : Number(row.width),
    height: row.height === null || row.height === undefined ? null : Number(row.height),
    bytes: Number(row.bytes ?? 0),
    url: "",
  }));
}

function encodePath(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export async function media_asset_url(
  row: Pick<MediaAssetRow, "provider" | "object_key" | "visibility">
): Promise<string> {
  const visibility: MediaVisibility =
    row.visibility === "private" ? "private" : "public";
  if (visibility === "private") {
    return `/api/media/download/${encodePath(row.object_key)}`;
  }
  if (row.provider === activeStorageProvider.id) {
    return activeStorageProvider.getUrl(row.object_key, { visibility });
  }
  if (row.provider === "local") return `/uploads/${encodePath(row.object_key)}`;
  return activeStorageProvider.getUrl(row.object_key, { visibility });
}

async function variants_for(
  assetId: string,
  visibility: MediaVisibility = "public"
): Promise<MediaVariant[]> {
  const rows = (await db.query_bind(
    "SELECT * FROM cms_media_variants WHERE asset_id = ? ORDER BY name ASC",
    [assetId]
  )) as Row[];
  const variants = parse_variants(rows);
  for (const variant of variants) {
    variant.url = variant.object_key.startsWith("http")
      ? variant.object_key
      : await activeStorageProvider
          .getUrl(variant.object_key, { visibility })
          .catch(() => "");
  }
  return variants;
}

export async function row_to_asset(row: Row): Promise<MediaAsset> {
  const asset = row as unknown as MediaAssetRow;
  const visibility: MediaVisibility =
    asset.visibility === "private" ? "private" : "public";
  const variants = await variants_for(asset.id, visibility);
  const url = await media_asset_url(asset);
  const thumbnail =
    variants.find((variant) => variant.name === "thumb")?.url || url;
  return {
    id: asset.id,
    status: asset.status as MediaAssetStatus,
    provider: asset.provider,
    bucket: asset.bucket ?? null,
    object_key: asset.object_key,
    original_name: asset.original_name,
    title: asset.title || asset.original_name,
    alt: asset.alt ?? "",
    mime: asset.mime,
    extension: asset.extension,
    size: Number(asset.size ?? 0),
    checksum: asset.checksum ?? null,
    width: asset.width === null || asset.width === undefined ? null : Number(asset.width),
    height:
      asset.height === null || asset.height === undefined ? null : Number(asset.height),
    kind: (asset.kind === "file" ? "file" : "image") as MediaKind,
    folder: asset.folder ?? "",
    visibility: (asset.visibility === "private" ? "private" : "public") as MediaVisibility,
    uploaded_by:
      asset.uploaded_by === null || asset.uploaded_by === undefined
        ? null
        : Number(asset.uploaded_by),
    error: asset.error ?? null,
    expires_at:
      asset.expires_at === null || asset.expires_at === undefined
        ? null
        : Number(asset.expires_at),
    created_at: Number(asset.created_at ?? 0),
    updated_at: Number(asset.updated_at ?? 0),
    deleted_at:
      asset.deleted_at === null || asset.deleted_at === undefined
        ? null
        : Number(asset.deleted_at),
    url,
    thumbnail_url: thumbnail,
    variants,
  };
}

export function asset_to_item(asset: MediaAsset): MediaItemView {
  return {
    id: asset.id,
    file: path.basename(asset.object_key),
    original_name: asset.original_name,
    title: asset.title,
    alt: asset.alt,
    mime: asset.mime,
    size: asset.size,
    width: asset.width ?? 0,
    height: asset.height ?? 0,
    created_at: new Date(asset.created_at * 1000).toISOString(),
    url: asset.url,
    thumbnail_url: asset.thumbnail_url,
    has_thumbnail: asset.variants.some((variant) => variant.name === "thumb"),
    visibility: asset.visibility,
    folder: asset.folder,
    kind: asset.kind,
  };
}

export function format_bytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024))
  );
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(exponent === 0 ? 0 : value >= 10 ? 0 : 1)} ${units[exponent]}`;
}

export function media_stats(assets: MediaAsset[]): MediaStatsView {
  const total_bytes = assets.reduce((total, asset) => total + asset.size, 0);
  return {
    count: assets.length,
    total_bytes,
    total_label: format_bytes(total_bytes),
  };
}

export function max_bytes_for_kind(kind: MediaKind): number {
  const env =
    kind === "image" ? process.env.ET_MEDIA_MAX_IMAGE_MB : process.env.ET_MEDIA_MAX_FILE_MB;
  const fallback = kind === "image" ? 12 : 25;
  const megabytes = Number(env ?? fallback);
  const safe = Number.isFinite(megabytes) && megabytes > 0 ? megabytes : fallback;
  return Math.floor(safe * 1024 * 1024);
}

export function extension_allowed(kind: MediaKind, filename: string): boolean {
  const extension = path.extname(filename).toLowerCase();
  if (kind === "image") return IMAGE_UPLOAD_EXTENSIONS.has(extension);
  return ALLOWED_UPLOAD_EXTENSIONS.has(extension);
}

export async function ensure_media_schema(): Promise<void> {
  await ensure_cms_schema();
}

export async function audit_media(input: {
  asset_id?: string | null;
  user_id?: number | null;
  action: string;
  ip?: string | null;
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.query_bind(
      `INSERT INTO cms_media_audit (id, asset_id, user_id, action, ip, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        input.asset_id ?? null,
        input.user_id ?? null,
        input.action,
        input.ip ?? null,
        JSON.stringify(input.detail ?? {}),
        nowSeconds(),
      ]
    );
  } catch {
    /* audit must never break an upload */
  }
}

export async function assert_media_quota(
  user_id: number,
  kind: MediaKind,
  incoming_bytes: number
): Promise<void> {
  const max_bytes = max_bytes_for_kind(kind);
  if (incoming_bytes <= 0) {
    throw new EtHttpError(400, "The selected file is empty.");
  }
  if (incoming_bytes > max_bytes) {
    throw new EtHttpError(
      413,
      `The ${kind === "image" ? "image" : "file"} is too large. The limit is ${Math.round(
        max_bytes / (1024 * 1024)
      )} MB.`
    );
  }

  const max_per_user = Number(process.env.ET_MEDIA_MAX_BYTES_PER_USER ?? 0);
  const max_files = Number(process.env.ET_MEDIA_MAX_FILES_PER_USER ?? 0);
  if (max_per_user > 0 || max_files > 0) {
    const rows = (await db.query_bind(
      `SELECT COALESCE(SUM(size), 0) AS total, COUNT(*) AS count
         FROM cms_media_assets
        WHERE uploaded_by = ? AND status <> 'deleted' AND deleted_at IS NULL`,
      [user_id]
    )) as Row[];
    const total = Number(rows[0]?.total ?? 0);
    const count = Number(rows[0]?.count ?? 0);
    if (max_per_user > 0 && total + incoming_bytes > max_per_user) {
      throw new EtHttpError(413, "This account has reached its media storage quota.");
    }
    if (max_files > 0 && count + 1 > max_files) {
      throw new EtHttpError(413, "This account has reached its media file quota.");
    }
  }

  const hourly = Number(process.env.ET_MEDIA_UPLOADS_PER_HOUR ?? 0);
  if (hourly > 0) {
    const key = `media:rate:${user_id}`;
    const current = Number((await activeCacheProvider.get<number>(key)) ?? 0);
    if (current >= hourly) {
      throw new EtHttpError(429, "Too many uploads. Try again later.");
    }
    await activeCacheProvider.set(key, current + 1, 3600);
  }
}

export async function create_pending_asset(input: {
  id: string;
  provider: string;
  bucket?: string | null;
  object_key: string;
  original_name: string;
  title: string;
  alt?: string;
  mime: string;
  extension: string;
  size: number;
  kind: MediaKind;
  folder: string;
  visibility: MediaVisibility;
  uploaded_by: number;
  expires_at: number;
}): Promise<void> {
  const now = nowSeconds();
  await db.query_bind(
    `INSERT INTO cms_media_assets
      (id, status, provider, bucket, object_key, original_name, title, alt, mime,
       extension, size, checksum, width, height, kind, folder, visibility,
       uploaded_by, error, expires_at, created_at, updated_at, deleted_at)
     VALUES (?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, NULL, ?, ?, ?, NULL)`,
    [
      input.id,
      input.provider,
      input.bucket ?? null,
      input.object_key,
      input.original_name,
      input.title,
      input.alt ?? "",
      input.mime,
      input.extension,
      input.size,
      input.kind,
      input.folder,
      input.visibility,
      input.uploaded_by,
      input.expires_at,
      now,
      now,
    ]
  );
}

export async function get_asset(id: string): Promise<MediaAsset | null> {
  const rows = (await db.query_bind(
    "SELECT * FROM cms_media_assets WHERE id = ? LIMIT 1",
    [id]
  )) as Row[];
  if (rows.length === 0) return null;
  return row_to_asset(rows[0]);
}

export async function get_asset_row(id: string): Promise<MediaAssetRow | null> {
  const rows = (await db.query_bind(
    "SELECT * FROM cms_media_assets WHERE id = ? LIMIT 1",
    [id]
  )) as Row[];
  return rows.length === 0 ? null : (rows[0] as unknown as MediaAssetRow);
}

export async function get_asset_by_key(
  provider: string,
  object_key: string
): Promise<MediaAssetRow | null> {
  const rows = (await db.query_bind(
    "SELECT * FROM cms_media_assets WHERE provider = ? AND object_key = ? LIMIT 1",
    [provider, object_key]
  )) as Row[];
  return rows.length === 0 ? null : (rows[0] as unknown as MediaAssetRow);
}

export async function find_asset_by_file(file: string): Promise<MediaAssetRow | null> {
  const rows = (await db.query_bind(
    `SELECT * FROM cms_media_assets
      WHERE status <> 'deleted' AND (object_key = ? OR object_key LIKE ?)
      ORDER BY created_at DESC LIMIT 1`,
    [file, `%/${file}`]
  )) as Row[];
  return rows.length === 0 ? null : (rows[0] as unknown as MediaAssetRow);
}

export async function list_asset_rows(options: {
  kind?: MediaKind;
  folder?: string;
  status?: MediaAssetStatus;
  include_deleted?: boolean;
  limit?: number;
} = {}): Promise<MediaAssetRow[]> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (!options.include_deleted) {
    clauses.push("status <> 'deleted' AND deleted_at IS NULL");
  }
  if (options.kind) {
    clauses.push("kind = ?");
    params.push(options.kind);
  }
  if (options.folder !== undefined && options.folder !== "") {
    clauses.push("folder = ?");
    params.push(options.folder);
  }
  if (options.status) {
    clauses.push("status = ?");
    params.push(options.status);
  }
  const limit = Math.max(1, Math.min(5000, options.limit ?? 500));
  params.push(limit);
  const rows = (await db.query_bind(
    `SELECT * FROM cms_media_assets
      ${clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY created_at DESC, id DESC LIMIT ?`,
    params
  )) as Row[];
  return rows as unknown as MediaAssetRow[];
}

export async function list_assets(options: {
  kind?: MediaKind;
  folder?: string;
  status?: MediaAssetStatus;
  limit?: number;
} = {}): Promise<MediaAsset[]> {
  const rows = await list_asset_rows(options);
  return Promise.all(rows.map((row) => row_to_asset(row)));
}

export async function list_media_items(kind: MediaKind = "image"): Promise<MediaItemView[]> {
  const assets = await list_assets({ kind, status: "ready", limit: 5000 });
  return assets.map(asset_to_item);
}

export async function mark_asset_ready(input: {
  id: string;
  size: number;
  mime: string;
  checksum: string;
  width?: number | null;
  height?: number | null;
}): Promise<void> {
  await db.query_bind(
    `UPDATE cms_media_assets
        SET status = 'ready', size = ?, mime = ?, checksum = ?, width = ?, height = ?,
            error = NULL, updated_at = ?
      WHERE id = ?`,
    [
      input.size,
      input.mime,
      input.checksum,
      input.width ?? null,
      input.height ?? null,
      nowSeconds(),
      input.id,
    ]
  );
}

export async function mark_asset_quarantined(
  id: string,
  reason: string
): Promise<void> {
  await db.query_bind(
    `UPDATE cms_media_assets SET status = 'quarantined', error = ?, updated_at = ? WHERE id = ?`,
    [reason.slice(0, 500), nowSeconds(), id]
  );
}

export async function mark_asset_error(id: string, reason: string): Promise<void> {
  await db.query_bind(
    `UPDATE cms_media_assets SET error = ?, updated_at = ? WHERE id = ?`,
    [reason.slice(0, 500), nowSeconds(), id]
  );
}

/** Server-relay providers may assign their own key after upload. */
export async function update_asset_key(id: string, object_key: string): Promise<void> {
  await db.query_bind(
    "UPDATE cms_media_assets SET object_key = ?, updated_at = ? WHERE id = ?",
    [object_key, nowSeconds(), id]
  );
}

export async function update_asset_metadata(
  row: MediaAssetRow,
  patch: { title?: string; alt?: string }
): Promise<MediaAsset> {
  const title =
    patch.title === undefined
      ? row.title
      : String(patch.title).trim().slice(0, 120) || row.original_name;
  const alt = patch.alt === undefined ? row.alt : String(patch.alt).trim().slice(0, 240);
  await db.query_bind(
    "UPDATE cms_media_assets SET title = ?, alt = ?, updated_at = ? WHERE id = ?",
    [title, alt, nowSeconds(), row.id]
  );
  const updated = await get_asset(row.id);
  if (!updated) throw new EtHttpError(404, "That media asset no longer exists.");
  return updated;
}

export async function soft_delete_asset(row: MediaAssetRow): Promise<void> {
  await db.query_bind(
    `UPDATE cms_media_assets
        SET status = 'deleted', deleted_at = ?, updated_at = ?
      WHERE id = ?`,
    [nowSeconds(), nowSeconds(), row.id]
  );
}

export async function insert_variant(input: {
  asset_id: string;
  name: string;
  object_key: string;
  mime: string;
  width?: number | null;
  height?: number | null;
  bytes: number;
}): Promise<void> {
  const existing = (await db.query_bind(
    "SELECT id FROM cms_media_variants WHERE asset_id = ? AND name = ? LIMIT 1",
    [input.asset_id, input.name]
  )) as Row[];
  if (existing.length > 0) {
    await db.query_bind(
      `UPDATE cms_media_variants
          SET object_key = ?, mime = ?, width = ?, height = ?, bytes = ?
        WHERE asset_id = ? AND name = ?`,
      [
        input.object_key,
        input.mime,
        input.width ?? null,
        input.height ?? null,
        input.bytes,
        input.asset_id,
        input.name,
      ]
    );
    return;
  }
  await db.query_bind(
    `INSERT INTO cms_media_variants (id, asset_id, name, object_key, mime, width, height, bytes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      input.asset_id,
      input.name,
      input.object_key,
      input.mime,
      input.width ?? null,
      input.height ?? null,
      input.bytes,
    ]
  );
}

export async function list_variants(asset_id: string): Promise<MediaVariant[]> {
  return variants_for(asset_id);
}

/** Remove all variant objects for an asset. Returns the storage keys. */
export async function delete_variants(asset_id: string): Promise<string[]> {
  const rows = (await db.query_bind(
    "SELECT object_key FROM cms_media_variants WHERE asset_id = ?",
    [asset_id]
  )) as Row[];
  await db.query_bind("DELETE FROM cms_media_variants WHERE asset_id = ?", [asset_id]);
  return rows.map((row) => String(row.object_key ?? "")).filter(Boolean);
}

/** Export used by the media library to keep its legacy route shape. */
export function media_item_from_asset(asset: MediaAsset): MediaItemView {
  return asset_to_item(asset);
}

function is_safe_media_file(file: string): boolean {
  return (
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(file) &&
    path.basename(file) === file &&
    !file.includes("..") &&
    !file.startsWith(".")
  );
}

function title_from_name(name: string): string {
  const without_extension = name.replace(/\.[^.]+$/, "");
  const spaced = without_extension.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return (spaced === "" ? name : spaced).slice(0, 120);
}

async function insert_legacy_asset(input: {
  key: string;
  folder: string;
  original_name: string;
  title?: string;
  alt?: string;
  kind: MediaKind;
  size: number;
  mime: string;
  created_at: number;
}): Promise<void> {
  const existing = await get_asset_by_key("local", input.key);
  if (existing) return;
  const extension = path.extname(input.original_name).toLowerCase();
  await db.query_bind(
    `INSERT INTO cms_media_assets
      (id, status, provider, bucket, object_key, original_name, title, alt, mime,
       extension, size, checksum, width, height, kind, folder, visibility,
       uploaded_by, error, expires_at, created_at, updated_at, deleted_at)
     VALUES (?, 'ready', 'local', NULL, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, 'public',
             NULL, NULL, NULL, ?, ?, NULL)`,
    [
      crypto.randomUUID(),
      input.key,
      input.original_name,
      input.title || title_from_name(input.original_name),
      input.alt ?? "",
      input.mime,
      extension,
      input.size,
      input.kind,
      input.folder,
      input.created_at,
      input.created_at,
    ]
  );
}

/**
 * Import existing local uploads into the registry once. The filesystem stays
 * untouched, so already-published `/uploads/...` URLs keep working.
 */
export async function migrate_legacy_media(): Promise<void> {
  const marker = (await db.query_bind(
    "SELECT id FROM cms_migrations WHERE id = ? LIMIT 1",
    ["media_registry_v1"]
  )) as Row[];
  if (marker.length > 0) return;

  const stored = new Map<
    string,
    { title?: string; alt?: string; original_name?: string }
  >();
  try {
    if (fs.existsSync(MEDIA_INDEX_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(MEDIA_INDEX_PATH, "utf8")) as unknown;
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (!entry || typeof entry !== "object") continue;
          const record = entry as Record<string, unknown>;
          const file = String(record.file ?? "");
          if (!is_safe_media_file(file)) continue;
          stored.set(file, {
            title: typeof record.title === "string" ? record.title : undefined,
            alt: typeof record.alt === "string" ? record.alt : undefined,
            original_name:
              typeof record.original_name === "string" ? record.original_name : undefined,
          });
        }
      }
    }
  } catch {
    /* corrupt legacy index is ignored */
  }

  const media_directory = path.join(UPLOADS_DIR, MEDIA_FOLDER);
  try {
    if (fs.existsSync(media_directory)) {
      for (const entry of fs.readdirSync(media_directory, { withFileTypes: true })) {
        if (!entry.isFile() || entry.name.startsWith(".")) continue;
        const extension = path.extname(entry.name).toLowerCase();
        if (!IMAGE_UPLOAD_EXTENSIONS.has(extension)) continue;
        const full = path.join(media_directory, entry.name);
        const stats = fs.statSync(full);
        const meta = stored.get(entry.name);
        await insert_legacy_asset({
          key: `${MEDIA_FOLDER}/${entry.name}`,
          folder: MEDIA_FOLDER,
          original_name: meta?.original_name ?? entry.name,
          title: meta?.title,
          alt: meta?.alt,
          kind: "image",
          size: stats.size,
          mime: extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : `image/${extension.slice(1)}`,
          created_at: Math.floor(stats.mtimeMs / 1000),
        });
      }
    }
  } catch {
    /* best effort */
  }

  let scanned = 0;
  const walk = async (
    directory: string,
    relative: string,
    depth: number
  ): Promise<void> => {
    if (depth > 6 || scanned > 5000) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (scanned > 5000) return;
      if (entry.name.startsWith(".") || entry.name === "thumbs") continue;
      const child = path.join(directory, entry.name);
      const key = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (key === MEDIA_FOLDER) continue;
        await walk(child, key, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const extension = path.extname(entry.name).toLowerCase();
      const image = IMAGE_UPLOAD_EXTENSIONS.has(extension);
      if (!image && !ALLOWED_UPLOAD_EXTENSIONS.has(extension)) continue;
      try {
        const stats = fs.statSync(child);
        scanned += 1;
        await insert_legacy_asset({
          key,
          folder: path.posix.dirname(key) === "." ? "" : path.posix.dirname(key),
          original_name: entry.name,
          kind: image ? "image" : "file",
          size: stats.size,
          mime: image
            ? extension === ".jpg" || extension === ".jpeg"
              ? "image/jpeg"
              : `image/${extension.slice(1)}`
            : "application/octet-stream",
          created_at: Math.floor(stats.mtimeMs / 1000),
        });
      } catch {
        /* ignore a single bad file */
      }
    }
  };
  await walk(UPLOADS_DIR, "", 0);

  await db.query_bind(
    "INSERT INTO cms_migrations (id, applied_at) VALUES (?, ?)",
    ["media_registry_v1", nowSeconds()]
  );
}
