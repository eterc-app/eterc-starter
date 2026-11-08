"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  FileText,
  Images,
  Link2,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CmsField } from "@/modules/cms/cms-types";
import {
  as_string,
  as_string_array,
  type CmsMediaConfig,
  type CmsMediaImage,
} from "./types";

type MediaMode = "upload" | "url" | "library";

function media_object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function is_image_file(file: File): boolean {
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

async function read_media_response(
  response: Response
): Promise<Record<string, unknown>> {
  const envelope = media_object(await response.json().catch(() => null));
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

function upload_image(
  file: File,
  media: CmsMediaConfig,
  folder: string,
  on_progress: (percent: number) => void
): Promise<CmsMediaImage> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", media.uploadUrl);
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
      const item = media_object(payload.media);
      if (xhr.status >= 200 && xhr.status < 300 && typeof item.url === "string") {
        resolve(item as unknown as CmsMediaImage);
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
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", media.uploadUrl);
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
      if (xhr.status >= 200 && xhr.status < 300 && typeof item.url === "string") {
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
    const body = new FormData();
    body.append("file", file);
    body.append("csrf_token", media.csrfToken);
    body.append("kind", "file");
    body.append("folder", folder);
    xhr.send(body);
  });
}

function MediaLibraryPanel({
  media,
  selected,
  multiple,
  disabled,
  onSelect,
}: {
  media?: CmsMediaConfig;
  selected: string[];
  multiple?: boolean;
  disabled?: boolean;
  onSelect: (url: string) => void;
}) {
  const [library, setLibrary] = useState<CmsMediaImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!media) return;
    let cancelled = false;
    void fetch(`${media.apiRoot}/list_media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then((response) => read_media_response(response))
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data.media)) {
          setLibrary(data.media as CmsMediaImage[]);
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
  }, [media]);

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

  if (library.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-border bg-card p-5 text-center">
        <Images className="size-5 text-muted-foreground" strokeWidth={1.75} />
        <p className="text-sm font-semibold text-foreground">No media yet</p>
        <p className="text-xs text-muted-foreground">
          Upload an image in the media library first.
        </p>
      </div>
    );
  }

  return (
    <div className="app-scrollbar grid max-h-56 grid-cols-3 gap-2 overflow-y-auto rounded-lg border border-border bg-card p-2 sm:grid-cols-4">
      {library.map((item) => {
        const active = selected.includes(item.url);
        return (
          <button
            key={item.file || item.url}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onSelect(item.url)}
            className={cn(
              "group overflow-hidden rounded-lg border border-border bg-background text-left transition-colors hover:bg-surface-subtle",
              active && "border-foreground"
            )}
          >
            <span className="relative block aspect-square overflow-hidden bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.thumbnail_url || item.url}
                alt={item.alt || item.title}
                className="size-full object-cover"
                loading="lazy"
              />
              {active ? (
                <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-3" strokeWidth={2} />
                </span>
              ) : null}
            </span>
            <span className="block truncate px-2 py-1.5 text-xs font-medium text-foreground">
              {item.title || file_name_from_url(item.url)}
            </span>
          </button>
        );
      })}
      {multiple ? (
        <p className="col-span-full px-1 pb-1 text-xs text-muted-foreground">
          Click an image to add or remove it.
        </p>
      ) : null}
    </div>
  );
}

function ModeSwitch({
  mode,
  onChange,
  modes,
  disabled,
}: {
  mode: MediaMode;
  onChange: (mode: MediaMode) => void;
  modes: Array<{ value: MediaMode; label: string }>;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1">
      {modes.map((item) => (
        <Button
          key={item.value}
          type="button"
          variant={mode === item.value ? "secondary" : "ghost"}
          size="sm"
          className="rounded-md"
          aria-pressed={mode === item.value}
          disabled={disabled}
          onClick={() => onChange(item.value)}
        >
          {item.value === "upload" ? (
            <Upload className="size-3.5" />
          ) : item.value === "url" ? (
            <Link2 className="size-3.5" />
          ) : (
            <Images className="size-3.5" />
          )}
          {item.label}
        </Button>
      ))}
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
  const folder = as_string(field.options.folder);
  const [mode, setMode] = useState<MediaMode>(urlValue ? "url" : "upload");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const progress_style = { width: `${progress}%` };

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
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
        setMode("upload");
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
      {urlValue ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={urlValue}
            alt={field.label || field.name}
            className="size-16 shrink-0 rounded-lg border border-border bg-muted object-cover"
            loading="lazy"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {file_name_from_url(urlValue)}
            </p>
            <p className="truncate text-xs text-muted-foreground">{urlValue}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Remove image"
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-surface-subtle/40 p-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-card text-muted-foreground">
            <Images className="size-4" strokeWidth={1.75} />
          </span>
          <p className="text-xs text-muted-foreground">
            No image selected. Upload a file, paste a URL, or choose one from the
            media library.
          </p>
        </div>
      )}

      <ModeSwitch
        mode={mode}
        onChange={(next) => {
          setMode(next);
          setError("");
        }}
        disabled={disabled}
        modes={[
          { value: "upload", label: "Upload" },
          { value: "url", label: "URL" },
          { value: "library", label: "Media library" },
        ]}
      />

      {mode === "upload" ? (
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={onFileChange}
          />
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface-subtle/30 px-4 py-6 text-center transition-colors",
              !disabled && !uploading && "hover:border-foreground/30 hover:bg-surface-subtle"
            )}
          >
            {uploading ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : (
              <Upload className="size-5 text-muted-foreground" strokeWidth={1.75} />
            )}
            <span className="text-sm font-semibold text-foreground">
              {uploading ? "Uploading image..." : "Choose an image to upload"}
            </span>
            <span className="text-xs text-muted-foreground">
              JPG, PNG, GIF, or WEBP. {folder ? `Stored in uploads/${folder}.` : "Stored in the media library."}
            </span>
          </button>
          {uploading ? (
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-foreground transition-[width]"
                style={progress_style}
              />
            </div>
          ) : null}
        </div>
      ) : mode === "url" ? (
        <Input
          id={`cms-field-${field.name}`}
          type="url"
          value={urlValue}
          disabled={disabled}
          placeholder={
            String(field.options.placeholder ?? "") ||
            "https://example.com/image.jpg"
          }
          className="h-13 rounded-lg border-input bg-card"
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <MediaLibraryPanel
          media={media}
          selected={urlValue ? [urlValue] : []}
          disabled={disabled}
          onSelect={(url) => onChange(url)}
        />
      )}

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
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
  const folder = as_string(field.options.folder);
  const [mode, setMode] = useState<MediaMode>("upload");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
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
        setMode("upload");
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
      {urlValue ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-surface-subtle text-muted-foreground">
            <FileText className="size-4" strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <a
              href={urlValue}
              target="_blank"
              rel="noreferrer"
              className="block truncate text-sm font-semibold text-foreground underline-offset-2 hover:underline"
            >
              {file_name_from_url(urlValue)}
            </a>
            <p className="truncate text-xs text-muted-foreground">{urlValue}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Remove file"
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-surface-subtle/40 p-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-card text-muted-foreground">
            <FileText className="size-4" strokeWidth={1.75} />
          </span>
          <p className="text-xs text-muted-foreground">
            No file selected. Upload a file or paste a URL.
          </p>
        </div>
      )}

      <ModeSwitch
        mode={mode}
        onChange={setMode}
        disabled={disabled}
        modes={[
          { value: "upload", label: "Upload" },
          { value: "url", label: "URL" },
        ]}
      />

      {mode === "upload" ? (
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.doc,.docx,.gif,.gz,.jpeg,.jpg,.mp3,.mp4,.pdf,.png,.ppt,.pptx,.rtf,.tar,.txt,.wav,.webm,.webp,.xls,.xlsx,.zip"
            className="hidden"
            onChange={onFileChange}
          />
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface-subtle/30 px-4 py-6 text-center transition-colors",
              !disabled && !uploading && "hover:border-foreground/30 hover:bg-surface-subtle"
            )}
          >
            {uploading ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : (
              <Upload className="size-5 text-muted-foreground" strokeWidth={1.75} />
            )}
            <span className="text-sm font-semibold text-foreground">
              {uploading ? "Uploading file..." : "Choose a file to upload"}
            </span>
            <span className="text-xs text-muted-foreground">
              Documents, images, archives, audio, or video up to 25 MB. {folder ? `Stored in uploads/${folder}.` : "Stored in uploads/files."}
            </span>
          </button>
          {uploading ? (
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-foreground transition-[width]"
                style={{ width: `${progress}%` }}
              />
            </div>
          ) : null}
        </div>
      ) : (
        <Input
          id={`cms-field-${field.name}`}
          type="url"
          value={urlValue}
          disabled={disabled}
          placeholder="https://example.com/file.pdf"
          className="h-13 rounded-lg border-input bg-card"
          onChange={(event) => onChange(event.target.value)}
        />
      )}

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
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
  const folder = as_string(field.options.folder);
  const [mode, setMode] = useState<MediaMode>("upload");
  const [draft, setDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
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
        if (!files.includes(item.url)) onChange([...files, item.url]);
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
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-surface-subtle/40 p-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-card text-muted-foreground">
            <FileText className="size-4" strokeWidth={1.75} />
          </span>
          <p className="text-xs text-muted-foreground">
            No files selected. Upload files or add URLs.
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

      <ModeSwitch
        mode={mode}
        onChange={setMode}
        disabled={disabled}
        modes={[
          { value: "upload", label: "Upload" },
          { value: "url", label: "URL" },
        ]}
      />

      {mode === "upload" ? (
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.doc,.docx,.gif,.gz,.jpeg,.jpg,.mp3,.mp4,.pdf,.png,.ppt,.pptx,.rtf,.tar,.txt,.wav,.webm,.webp,.xls,.xlsx,.zip"
            className="hidden"
            onChange={onFileChange}
          />
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface-subtle/30 px-4 py-6 text-center transition-colors",
              !disabled && !uploading && "hover:border-foreground/30 hover:bg-surface-subtle"
            )}
          >
            {uploading ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : (
              <Upload className="size-5 text-muted-foreground" strokeWidth={1.75} />
            )}
            <span className="text-sm font-semibold text-foreground">
              {uploading ? "Uploading file..." : "Choose a file to upload"}
            </span>
            <span className="text-xs text-muted-foreground">
              Documents, images, archives, audio, or video up to 25 MB. {folder ? `Stored in uploads/${folder}.` : "Stored in uploads/files."}
            </span>
          </button>
          {uploading ? (
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-foreground transition-[width]"
                style={{ width: `${progress}%` }}
              />
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Input
            id={`cms-field-${field.name}`}
            type="url"
            value={draft}
            disabled={disabled}
            placeholder="https://example.com/file.pdf"
            className="h-13 rounded-lg border-input bg-card"
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
            className="rounded-lg"
            disabled={disabled || draft.trim() === ""}
            onClick={add_url}
          >
            Add
          </Button>
        </div>
      )}

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
