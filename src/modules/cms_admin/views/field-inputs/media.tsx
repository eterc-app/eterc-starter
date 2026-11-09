"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  FileText,
  Folder,
  FolderPlus,
  Images,
  Link2,
  Loader2,
  Paperclip,
  Search,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { CmsField } from "@/modules/cms/cms-types";
import {
  as_string,
  as_string_array,
  type CmsMediaConfig,
  type CmsMediaImage,
  type CmsUploadAsset,
} from "./types";

function media_object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function is_image_file(file: File): boolean {
  return ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(
    file.type.toLowerCase()
  );
}

function file_name_from_url(url: string): string {
  try {
    const path = new URL(url, "http://localhost").pathname;
    const name = path.split("/").filter(Boolean).pop() ?? "";
    return decodeURIComponent(name) || "File";
  } catch {
    return url || "File";
  }
}

function image_url(value: unknown): string {
  if (typeof value === "string") return value;
  const object = media_object(value);
  return as_string(object.url ?? object.src ?? object.file ?? "");
}

function initial_upload_folder(field: CmsField, fallback: string): string {
  const configured = as_string(field.options.folder)
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/^uploads(?:\/|$)/i, "");
  return configured || fallback;
}

async function read_media_response(
  response: Response
): Promise<Record<string, unknown>> {
  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    if (response.ok) {
      throw new Error("The server returned an invalid response.");
    }
    throw new Error(`The request failed (HTTP ${response.status}).`);
  }
  const envelope = media_object(responseBody);
  if (envelope.status === "redirect") {
    throw new Error("Your session has expired. Sign in and try again.");
  }
  if (envelope.status === "error") {
    throw new Error(String(envelope.message ?? "The request failed."));
  }
  if (!response.ok) {
    throw new Error(`The request failed (HTTP ${response.status}).`);
  }
  const data = envelope.data;
  return data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : envelope;
}

export function upload_image(
  file: File,
  media: CmsMediaConfig,
  folder: string,
  on_progress: (percent: number) => void
): Promise<CmsMediaImage> {
  let uploadUrl: URL;
  try {
    uploadUrl = new URL(media.uploadUrl, window.location.origin);
  } catch {
    return Promise.reject(new Error("The media upload endpoint is invalid."));
  }
  if (uploadUrl.origin !== window.location.origin) {
    return Promise.reject(new Error("Uploads must use this site's media endpoint."));
  }
  if (!media.csrfToken) {
    return Promise.reject(new Error("The upload security token is missing. Refresh and try again."));
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadUrl.href);
    xhr.responseType = "json";
    xhr.timeout = 120_000;
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      on_progress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      const payload = media_object(
        xhr.response ??
          (() => {
            try {
              return JSON.parse(xhr.responseText) as unknown;
            } catch {
              return null;
            }
          })()
      );
      const item = media_object(payload.media);
      if (
        xhr.status >= 200 &&
        xhr.status < 300 &&
        typeof item.url === "string" &&
        item.url !== ""
      ) {
        resolve({
          file: typeof item.file === "string" ? item.file : "",
          url: item.url,
          thumbnail_url:
            typeof item.thumbnail_url === "string" ? item.thumbnail_url : item.url,
          title: typeof item.title === "string" ? item.title : "",
          alt: typeof item.alt === "string" ? item.alt : "",
        });
        return;
      }
      reject(
        new Error(
          String(
            payload.error ??
              payload.message ??
              "The image could not be uploaded."
          )
        )
      );
    };
    xhr.onerror = () =>
      reject(new Error("The upload could not reach the server."));
    xhr.ontimeout = () => reject(new Error("The upload timed out. Try again."));
    const body = new FormData();
    body.append("file", file);
    body.append("csrf_token", media.csrfToken);
    body.append("kind", "image");
    body.append("folder", folder);
    xhr.send(body);
  });
}

function upload_file(
  file: File,
  media: CmsMediaConfig,
  folder: string,
  on_progress: (percent: number) => void
): Promise<{ url: string }> {
  let uploadUrl: URL;
  try {
    uploadUrl = new URL(media.uploadUrl, window.location.origin);
  } catch {
    return Promise.reject(new Error("The media upload endpoint is invalid."));
  }
  if (uploadUrl.origin !== window.location.origin) {
    return Promise.reject(new Error("Uploads must use this site's media endpoint."));
  }
  if (!media.csrfToken) {
    return Promise.reject(new Error("The upload security token is missing. Refresh and try again."));
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadUrl.href);
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      on_progress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      const payload = media_object(
        xhr.response ??
          (() => {
            try {
              return JSON.parse(xhr.responseText) as unknown;
            } catch {
              return null;
            }
          })()
      );
      const item = media_object(payload.file);
      if (
        xhr.status >= 200 &&
        xhr.status < 300 &&
        typeof item.url === "string" &&
        item.url !== ""
      ) {
        resolve({ url: item.url });
        return;
      }
      reject(
        new Error(
          String(payload.error ?? payload.message ?? "The file could not be uploaded.")
        )
      );
    };
    xhr.onerror = () => reject(new Error("The upload could not reach the server."));
    xhr.ontimeout = () => reject(new Error("The upload timed out. Try again."));
    xhr.timeout = 120_000;
    const body = new FormData();
    body.append("file", file);
    body.append("csrf_token", media.csrfToken);
    body.append("kind", "file");
    body.append("folder", folder);
    xhr.send(body);
  });
}

export function UploadAssetPicker({
  media,
  selected,
  multiple,
  kind,
  disabled,
  onSelect,
  drawerLayout = false,
}: {
  media?: CmsMediaConfig;
  selected: string[];
  multiple?: boolean;
  kind: "image" | "file";
  disabled?: boolean;
  onSelect: (url: string) => void;
  drawerLayout?: boolean;
}) {
  const [assets, setAssets] = useState<CmsUploadAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [activeFolder, setActiveFolder] = useState("all");

  useEffect(() => {
    if (!media) return;
    let cancelled = false;
    void fetch(`${media.apiRoot}/list_upload_assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then((response) => read_media_response(response))
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data.assets)) {
          setAssets(
            data.assets.filter(
              (asset): asset is CmsUploadAsset =>
                Boolean(
                  asset &&
                    typeof asset === "object" &&
                    (asset as CmsUploadAsset).kind === kind &&
                    typeof (asset as CmsUploadAsset).url === "string" &&
                    typeof (asset as CmsUploadAsset).name === "string"
                )
            )
          );
        }
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load the media library."
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, media]);

  if (!media) {
    return (
      <p role="alert" className="rounded-lg border border-border bg-card p-3 text-xs text-destructive">
        The media library is not available on this page.
      </p>
    );
  }

  if (loading) {
    return (
      <div className="flex h-24 items-center justify-center rounded-lg border border-border bg-surface-subtle">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <p role="alert" className="rounded-lg border border-border bg-card p-3 text-xs text-destructive">
        {error}
      </p>
    );
  }

  const needle = query.trim().toLowerCase();
  const folders = [...new Set(assets.map((asset) => asset.folder).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  const filtered = assets.filter(
    (asset) =>
      (activeFolder === "all" || asset.folder === activeFolder) &&
      `${asset.name} ${asset.folder} ${asset.url}`.toLowerCase().includes(needle)
  );

  const assetGrid = filtered.length === 0 ? (
    <p className="m-4 rounded-lg border border-border bg-card p-4 text-center text-xs text-muted-foreground">
      {assets.length === 0
        ? `No uploaded ${kind === "image" ? "images" : "files"} yet.`
        : "No matching uploads."}
    </p>
  ) : (
    <div
      className={cn(
        "app-scrollbar grid grid-cols-2 gap-3 overflow-y-auto",
        drawerLayout
          ? "min-h-0 flex-1 content-start p-4 sm:grid-cols-3 lg:grid-cols-4"
          : "max-h-64 rounded-lg border border-border bg-card p-2 sm:grid-cols-3"
      )}
    >
      {filtered.map((item) => {
        const active = selected.includes(item.url);
        return (
          <button
            key={item.url}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onSelect(item.url)}
            className={cn(
              "group overflow-hidden rounded-lg border border-border bg-background text-left transition-colors hover:bg-surface-subtle",
              active && "border-foreground"
            )}
          >
            {kind === "image" ? (
              <span className="relative block aspect-square overflow-hidden bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.thumbnail_url || item.url}
                  alt={item.name}
                  className="size-full object-cover"
                  loading="lazy"
                />
                {active ? (
                  <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-3" strokeWidth={2} />
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="flex min-h-16 items-center gap-2 p-2">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-xs font-medium text-foreground">
                  {item.name}
                </span>
                {active ? <Check className="ml-auto size-3.5 shrink-0" /> : null}
              </span>
            )}
            <span className="block truncate px-2 py-1.5 text-xs font-medium text-foreground">
              {item.name}
            </span>
            <span className="block truncate px-2 pb-2 text-[10px] text-muted-foreground">
              {item.kind.toUpperCase()} · /uploads/{item.folder}
            </span>
          </button>
        );
      })}
    </div>
  );

  if (drawerLayout) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              aria-label={`Search uploaded ${kind === "image" ? "images" : "files"}`}
              placeholder={`Search ${kind === "image" ? "images" : "files"}...`}
              className="h-9 pl-9 text-xs"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {filtered.length} {kind === "image" ? "images" : "files"}
          </span>
        </div>
        <div className="flex min-h-0 flex-1">
          <aside className="app-scrollbar w-48 shrink-0 space-y-1 overflow-y-auto border-r border-border p-3">
            <button
              type="button"
              aria-pressed={activeFolder === "all"}
              onClick={() => setActiveFolder("all")}
              className={cn(
                "flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs font-medium",
                activeFolder === "all"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              <Images className="size-4" />
              All images
            </button>
            {folders.map((folder) => (
              <button
                key={folder}
                type="button"
                aria-pressed={activeFolder === folder}
                onClick={() => setActiveFolder(folder)}
                className={cn(
                  "flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs font-medium",
                  activeFolder === folder
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                <Folder className="size-4 shrink-0" />
                <span className="truncate">{folder}</span>
              </button>
            ))}
          </aside>
          {assetGrid}
        </div>
        {multiple ? (
          <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
            Click an item to add or remove it.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          aria-label={`Search uploaded ${kind === "image" ? "images" : "files"}`}
          placeholder={`Search uploaded ${kind === "image" ? "images" : "files"}...`}
          className="h-9 pl-9 text-xs"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {assetGrid}
      {multiple ? (
        <p className="px-1 text-xs text-muted-foreground">
          Click an item to add or remove it.
        </p>
      ) : null}
    </div>
  );
}

export function UploadFolderPicker({
  media,
  folder,
  onChange,
  disabled,
  id = "cms-upload-folder",
}: {
  media?: CmsMediaConfig;
  folder: string;
  onChange: (folder: string) => void;
  disabled?: boolean;
  id?: string;
}) {
  const [folders, setFolders] = useState<string[]>([]);
  const [newFolder, setNewFolder] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!media) return;
    let cancelled = false;
    void fetch(`${media.apiRoot}/list_upload_assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then((response) => read_media_response(response))
      .then((data) => {
        if (!cancelled && Array.isArray(data.folders)) {
          setFolders(
            data.folders.filter(
              (entry): entry is string => typeof entry === "string"
            )
          );
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load upload folders."
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [media]);

  const create_folder = async () => {
    const name = newFolder.trim();
    if (!media || !name) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${media.apiRoot}/create_upload_folder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csrf_token: media.csrfToken,
          folder,
          name,
        }),
      });
      const data = await read_media_response(response);
      if (typeof data.folder !== "string") {
        throw new Error("The server did not return the created folder.");
      }
      setFolders((current) =>
        [...new Set([...current, data.folder as string])].sort((a, b) =>
          a.localeCompare(b)
        )
      );
      onChange(data.folder);
      setNewFolder("");
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "The folder could not be created."
      );
    } finally {
      setLoading(false);
    }
  };

  const availableFolders = [...new Set([folder, ...folders])].filter(Boolean);

  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface-subtle/40 p-3">
      <label
        htmlFor={id}
        className="text-xs font-semibold text-foreground"
      >
        Upload folder
      </label>
      <select
        id={id}
        value={folder}
        disabled={disabled || loading}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {availableFolders.map((entry) => (
          <option key={entry} value={entry}>
            /uploads/{entry}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-2">
        <Input
          value={newFolder}
          disabled={!media || disabled || loading}
          placeholder="New subfolder"
          aria-label="New subfolder name"
          className="h-9 text-xs"
          onChange={(event) => setNewFolder(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void create_folder();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 shrink-0"
          disabled={!media || disabled || loading || !newFolder.trim()}
          onClick={() => void create_folder()}
        >
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <FolderPlus className="size-3.5" />
          )}
          Create
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        New folders are created under the selected folder and remain inside uploads.
      </p>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ImageInput({
  field,
  value,
  onChange,
  disabled,
  media,
}: {
  field: CmsField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  media?: CmsMediaConfig;
}) {
  const urlValue = image_url(value);
  const configuredFolder = initial_upload_folder(field, "media");
  const [folder, setFolder] = useState(configuredFolder);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);
  const [urlDraft, setUrlDraft] = useState(urlValue);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const upload_selected_file = (file: File | undefined) => {
    if (!file) return;
    if (!is_image_file(file)) {
      setError("Choose a JPG, PNG, GIF, or WEBP image.");
      return;
    }
    if (!media) {
      setError("Image uploads are not configured on this page.");
      return;
    }
    setUploading(true);
    setProgress(0);
    setError("");
    void upload_image(file, media, folder, setProgress)
      .then((item) => {
        onChange(item.url);
      })
      .catch((uploadError: unknown) => {
        setError(
          uploadError instanceof Error
            ? uploadError.message
            : "The image could not be uploaded."
        );
      })
      .finally(() => {
        setUploading(false);
        setProgress(0);
      });
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={(event) => {
          if (
            !(event.relatedTarget instanceof Node) ||
            !event.currentTarget.contains(event.relatedTarget)
          ) {
            setDragging(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled) upload_selected_file(event.dataTransfer.files[0]);
        }}
        className={cn(
          "relative flex min-h-48 flex-col items-center justify-center gap-4 rounded-xl border border-dashed px-4 py-6 text-center transition-colors",
          dragging
            ? "border-primary bg-primary/5"
            : "border-border bg-surface-subtle/30"
        )}
      >
        {urlValue ? (
          <div className="flex w-full flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={urlValue}
              alt={field.label || field.name}
              className="max-h-48 max-w-full rounded-lg object-contain"
              loading="lazy"
            />
            <p className="max-w-full truncate text-xs text-muted-foreground">
              {file_name_from_url(urlValue)}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={(event) => {
                  upload_selected_file(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="size-12 rounded-full"
                aria-label="Upload image"
                title="Upload image"
                disabled={disabled || uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <Upload className="size-5" />
                )}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="size-12 rounded-full"
                aria-label="Choose from media library"
                title="Choose from media library"
                disabled={disabled}
                onClick={() => setDrawerOpen(true)}
              >
                <Folder className="size-5" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="size-12 rounded-full"
                aria-label="Enter image URL"
                title="Enter image URL"
                disabled={disabled}
                onClick={() => {
                  setUrlDraft(urlValue);
                  setUrlOpen((open) => !open);
                  setError("");
                }}
              >
                <Link2 className="size-5" />
              </Button>
            </div>
            <p className="text-sm font-semibold text-muted-foreground">
              {uploading ? `Uploading image... ${progress}%` : "Drag & drop an image here"}
            </p>
          </>
        )}
        {urlValue ? (
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={(event) => {
                upload_selected_file(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="size-10 rounded-full"
              aria-label="Upload image"
              title="Upload image"
              disabled={disabled || uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="size-10 rounded-full"
              aria-label="Choose from media library"
              title="Choose from media library"
              disabled={disabled}
              onClick={() => setDrawerOpen(true)}
            >
              <Folder className="size-4" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="size-10 rounded-full"
              aria-label="Enter image URL"
              title="Enter image URL"
              disabled={disabled}
              onClick={() => {
                setUrlDraft(urlValue);
                setUrlOpen((open) => !open);
              }}
            >
              <Link2 className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9"
              aria-label="Remove image"
              title="Remove image"
              disabled={disabled}
              onClick={() => onChange(null)}
            >
              <X className="size-4" />
            </Button>
          </div>
        ) : null}
      </div>

      <details className="group rounded-lg border border-border bg-surface-subtle/30 px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
          Upload location
        </summary>
        <div className="pt-2">
          <UploadFolderPicker
            media={media}
            folder={folder}
            id={`cms-upload-folder-${field.name}`}
            onChange={setFolder}
            disabled={disabled || uploading}
          />
        </div>
      </details>

      {urlOpen ? (
        <div className="flex flex-wrap gap-2">
          <Input
            id={`cms-field-${field.name}`}
            type="url"
            value={urlDraft}
            disabled={disabled}
            placeholder={
              String(field.options.placeholder ?? "") ||
              "https://example.com/image.jpg"
            }
            className="h-10 min-w-48 flex-1 rounded-lg border-input bg-card"
            onChange={(event) => setUrlDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onChange(urlDraft.trim());
                setUrlOpen(false);
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            disabled={disabled || !urlDraft.trim()}
            onClick={() => {
              onChange(urlDraft.trim());
              setUrlOpen(false);
            }}
          >
            Use URL
          </Button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="max-w-[900px]">
          <SheetHeader>
            <div className="flex items-center gap-2">
              <Images className="size-4 text-muted-foreground" />
              <DialogTitle>Image library</DialogTitle>
            </div>
            <DialogDescription>
              Choose an image from your uploaded media.
            </DialogDescription>
          </SheetHeader>
          <SheetBody className="flex min-h-0 flex-1 flex-col p-0">
            <UploadAssetPicker
              media={media}
              selected={urlValue ? [urlValue] : []}
              kind="image"
              disabled={disabled}
              drawerLayout
              onSelect={(url) => {
                onChange(url);
                setDrawerOpen(false);
              }}
            />
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function FileInput({
  field,
  value,
  onChange,
  disabled,
  media,
}: {
  field: CmsField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  media?: CmsMediaConfig;
}) {
  const urlValue = as_string(value);
  const configuredFolder = initial_upload_folder(field, "files");
  const [folder, setFolder] = useState(configuredFolder);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);
  const [urlDraft, setUrlDraft] = useState(urlValue);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const upload_selected_file = (file: File | undefined) => {
    if (!file) return;
    if (!media) {
      setError("File uploads are not configured on this page.");
      return;
    }
    setUploading(true);
    setProgress(0);
    setError("");
    void upload_file(file, media, folder, setProgress)
      .then((item) => {
        onChange(item.url);
      })
      .catch((uploadError: unknown) => {
        setError(
          uploadError instanceof Error
            ? uploadError.message
            : "The file could not be uploaded."
        );
      })
      .finally(() => {
        setUploading(false);
        setProgress(0);
      });
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={(event) => {
          if (
            !(event.relatedTarget instanceof Node) ||
            !event.currentTarget.contains(event.relatedTarget)
          ) {
            setDragging(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled) upload_selected_file(event.dataTransfer.files[0]);
        }}
        className={cn(
          "flex min-h-14 items-center gap-2 rounded-xl border bg-card px-3 py-1.5 transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-border"
        )}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Folder className="size-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          {urlValue ? (
            <>
              <a
                href={urlValue}
                target="_blank"
                rel="noreferrer"
                className="block truncate text-sm font-medium text-foreground underline-offset-2 hover:underline"
              >
                {file_name_from_url(urlValue)}
              </a>
              <p className="truncate text-xs text-muted-foreground">{urlValue}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {uploading ? `Uploading file... ${progress}%` : "No File Selected"}
            </p>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.doc,.docx,.gif,.gz,.jpeg,.jpg,.mp3,.mp4,.pdf,.png,.ppt,.pptx,.rtf,.tar,.txt,.wav,.webm,.webp,.xls,.xlsx,.zip"
          className="hidden"
          onChange={(event) => {
            upload_selected_file(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Upload file"
          title="Upload file"
          disabled={disabled || uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Upload className="size-4" />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Choose from file library"
          title="Choose from file library"
          disabled={disabled}
          onClick={() => setDrawerOpen(true)}
        >
          <Paperclip className="size-4" />
        </Button>
        {urlValue ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove file"
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            <X className="size-4" />
          </Button>
        ) : null}
      </div>

      <details className="group rounded-lg border border-border bg-surface-subtle/30 px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
          Upload location
        </summary>
        <div className="pt-2">
          <UploadFolderPicker
            media={media}
            folder={folder}
            id={`cms-upload-folder-${field.name}`}
            onChange={setFolder}
            disabled={disabled || uploading}
          />
        </div>
      </details>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8"
        disabled={disabled}
        onClick={() => {
          setUrlDraft(urlValue);
          setUrlOpen((open) => !open);
        }}
      >
        <Link2 className="size-3.5" />
        Add URL
      </Button>
      {urlOpen ? (
        <div className="flex items-center gap-2">
          <Input
            id={`cms-field-${field.name}`}
            type="url"
            value={urlDraft}
            disabled={disabled}
            placeholder="https://example.com/file.pdf"
            className="h-10 rounded-lg border-input bg-card"
            onChange={(event) => setUrlDraft(event.target.value)}
          />
          <Button
            type="button"
            size="sm"
            disabled={disabled || !urlDraft.trim()}
            onClick={() => {
              onChange(urlDraft.trim());
              setUrlOpen(false);
            }}
          >
            Use URL
          </Button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="max-w-[900px]">
          <SheetHeader>
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-muted-foreground" />
              <DialogTitle>File library</DialogTitle>
            </div>
            <DialogDescription>Choose a file from your uploaded media.</DialogDescription>
          </SheetHeader>
          <SheetBody className="flex min-h-0 flex-1 flex-col p-0">
            <UploadAssetPicker
              media={media}
              selected={urlValue ? [urlValue] : []}
              kind="file"
              disabled={disabled}
              drawerLayout
              onSelect={(url) => {
                onChange(url);
                setDrawerOpen(false);
              }}
            />
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function FilesInput({
  field,
  value,
  onChange,
  disabled,
  media,
}: {
  field: CmsField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  media?: CmsMediaConfig;
}) {
  const files = as_string_array(value);
  const configuredFolder = initial_upload_folder(field, "files");
  const [folder, setFolder] = useState(configuredFolder);
  const [draft, setDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const upload_selected_files = (selectedFiles: FileList | File[]) => {
    const newFiles = Array.from(selectedFiles);
    if (newFiles.length === 0) return;
    if (!media) {
      setError("File uploads are not configured on this page.");
      return;
    }
    setUploading(true);
    setProgress(0);
    setError("");
    void Promise.all(
      newFiles.map((file) =>
        upload_file(file, media, folder, (nextProgress) => setProgress(nextProgress))
      )
    )
      .then((items) => {
        onChange([...new Set([...files, ...items.map((item) => item.url)])]);
      })
      .catch((uploadError: unknown) => {
        setError(
          uploadError instanceof Error
            ? uploadError.message
            : "The file could not be uploaded."
        );
      })
      .finally(() => {
        setUploading(false);
        setProgress(0);
      });
  };

  const add_url = () => {
    const url = draft.trim();
    if (!url || files.includes(url)) return;
    onChange([...files, url]);
    setDraft("");
  };

  const toggle = (url: string) => {
    if (files.includes(url)) {
      onChange(files.filter((entry) => entry !== url));
    } else {
      onChange([...files, url]);
    }
  };

  return (
    <div className="space-y-3">
      {files.length === 0 ? (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={(event) => {
            if (
              !(event.relatedTarget instanceof Node) ||
              !event.currentTarget.contains(event.relatedTarget)
            ) {
              setDragging(false);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (!disabled) upload_selected_files(event.dataTransfer.files);
          }}
          className={cn(
            "flex min-h-[76px] items-center gap-3 rounded-xl border-l-4 px-4 py-3 transition-colors",
            dragging
              ? "border-l-primary bg-primary/10"
              : "border-l-foreground bg-muted/70"
          )}
        >
          <Images className="size-5 shrink-0 text-foreground" />
          <p className="text-sm font-medium text-foreground">
            {uploading ? `Uploading files... ${progress}%` : "No items"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {files.map((url) => (
            <div
              key={url}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-2.5"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-surface-subtle text-muted-foreground">
                <FileText className="size-3.5" strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-xs font-semibold text-foreground underline-offset-2 hover:underline"
                >
                  {file_name_from_url(url)}
                </a>
                <p className="truncate text-xs text-muted-foreground">{url}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${file_name_from_url(url)}`}
                disabled={disabled}
                onClick={() => toggle(url)}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".csv,.doc,.docx,.gif,.gz,.jpeg,.jpg,.mp3,.mp4,.pdf,.png,.ppt,.pptx,.rtf,.tar,.txt,.wav,.webm,.webp,.xls,.xlsx,.zip"
        className="hidden"
        onChange={(event) => {
          if (event.target.files) upload_selected_files(event.target.files);
          event.target.value = "";
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={disabled || uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Upload className="size-4" />
          )}
          {uploading ? "Uploading..." : "Upload File"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => setDrawerOpen(true)}
        >
          <Folder className="size-4" />
          Add Existing
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => setUrlOpen((open) => !open)}
        >
          <Link2 className="size-3.5" />
          Add URL
        </Button>
      </div>

      <details className="group rounded-lg border border-border bg-surface-subtle/30 px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
          Upload location
        </summary>
        <div className="pt-2">
          <UploadFolderPicker
            media={media}
            folder={folder}
            id={`cms-upload-folder-${field.name}`}
            onChange={setFolder}
            disabled={disabled || uploading}
          />
        </div>
      </details>

      {urlOpen ? (
        <div className="flex items-center gap-2">
          <Input
            id={`cms-field-${field.name}`}
            type="url"
            value={draft}
            disabled={disabled}
            placeholder="https://example.com/file.pdf"
            className="h-10 rounded-lg border-input bg-card"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add_url();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={disabled || draft.trim() === ""}
            onClick={add_url}
          >
            Add URL
          </Button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="max-w-[900px]">
          <SheetHeader>
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-muted-foreground" />
              <DialogTitle>File library</DialogTitle>
            </div>
            <DialogDescription>
              Select one or more files from your uploaded media.
            </DialogDescription>
          </SheetHeader>
          <SheetBody className="flex min-h-0 flex-1 flex-col p-0">
            <UploadAssetPicker
              media={media}
              selected={files}
              multiple
              kind="file"
              disabled={disabled}
              drawerLayout
              onSelect={toggle}
            />
          </SheetBody>
          <SheetFooter>
            <Button type="button" onClick={() => setDrawerOpen(false)}>
              Done{files.length > 0 ? ` (${files.length})` : ""}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
