"use client";

import {
  useCallback,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Check,
  ChevronDown,
  Clipboard,
  Image as ImageIcon,
  Images,
  Link2,
  Loader2,
  Plus,
  Upload,
  X,
} from "lucide-react";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { CmsField, CmsFieldType } from "@/modules/cms/cms-types";

export { EmptyState, PageHeader };

export const FIELD_TYPE_OPTIONS: Array<{
  value: CmsFieldType;
  label: string;
}> = [
  { value: "string", label: "Short text" },
  { value: "text", label: "Long text" },
  { value: "integer", label: "Integer" },
  { value: "decimal", label: "Decimal" },
  { value: "boolean", label: "Boolean" },
  { value: "datetime", label: "Date & time" },
  { value: "json", label: "JSON" },
  { value: "select", label: "Select" },
  { value: "image", label: "Image" },
  { value: "relation", label: "Relation ID" },
];

export interface CmsEnvelope<T> {
  status?: string;
  data?: T;
  message?: string;
  errors?: Record<string, string[]>;
}

export async function cms_call<T>(
  method: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  const response = await fetch(`/api/xhr/cms_admin/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  let envelope: CmsEnvelope<T> | null = null;
  try {
    envelope = (await response.json()) as CmsEnvelope<T>;
  } catch {
    envelope = null;
  }
  if (!response.ok || envelope?.status === "error") {
    throw new Error(envelope?.message || `The request failed (HTTP ${response.status}).`);
  }
  if (envelope?.status === "redirect" && typeof envelope.data === "string") {
    window.location.href = envelope.data;
  }
  return envelope?.data as T;
}

export function format_datetime(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function format_relative(value: unknown): string {
  if (!value) return "Never";
  const seconds = Number(value);
  const date = Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} d ago`;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

export function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }, [value]);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn("gap-1.5", className)}
      onClick={copy}
    >
      {copied ? <Check className="size-3.5" /> : <Clipboard className="size-3.5" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

export function BusyButton({
  busy,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { busy?: boolean }) {
  return (
    <Button {...props} disabled={busy || props.disabled}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : null}
      {children}
    </Button>
  );
}

export function FieldLabel({
  field,
  children,
}: {
  field: CmsField;
  children?: ReactNode;
}) {
  return (
    <Label className="flex items-center gap-1.5 font-semibold text-sm text-foreground">
      <span>{field.label || field.name}</span>
      {field.required ? <span className="text-destructive">*</span> : null}
      {children}
    </Label>
  );
}

function coerce_input_value(field: CmsField, value: unknown): unknown {
  if (value === "" || value === undefined) return null;
  if (field.type === "boolean") return value === true || value === "true" || value === 1;
  return value;
}

export interface CmsMediaConfig {
  csrfToken: string;
  uploadUrl: string;
  apiRoot: string;
}

interface CmsMediaImage {
  file: string;
  url: string;
  thumbnail_url: string;
  title: string;
  alt?: string;
}

type ImageMode = "upload" | "url" | "library";

function is_image_file(file: File): boolean {
  return ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(
    file.type.toLowerCase()
  );
}

function media_object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function image_name_from_url(url: string): string {
  try {
    const path = new URL(url, "http://localhost").pathname;
    const name = path.split("/").filter(Boolean).pop() ?? "";
    return decodeURIComponent(name) || "Image";
  } catch {
    return url;
  }
}

async function read_media_response(response: Response): Promise<Record<string, unknown>> {
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

      if (
        xhr.status >= 200 &&
        xhr.status < 300 &&
        typeof item.url === "string"
      ) {
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
    xhr.send(body);
  });
}

function ImageFieldInput({
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
  const urlValue =
    value === null || value === undefined
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value, null, 2)
        : String(value);

  const [mode, setMode] = useState<ImageMode>(urlValue ? "url" : "upload");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [library, setLibrary] = useState<CmsMediaImage[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const progress_style = { width: `${progress}%` };

  const modes: Array<{
    value: ImageMode;
    label: string;
    icon: ReactNode;
  }> = [
    { value: "upload", label: "Upload", icon: <Upload className="size-3.5" /> },
    { value: "url", label: "URL", icon: <Link2 className="size-3.5" /> },
    {
      value: "library",
      label: "Media library",
      icon: <Images className="size-3.5" />,
    },
  ];

  const loadLibrary = useCallback(async () => {
    if (!media) {
      setError("The media library is not available on this page.");
      return;
    }
    setLibraryLoading(true);
    setError("");
    try {
      const response = await fetch(`${media.apiRoot}/list_media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await read_media_response(response);
      if (Array.isArray(data.media)) {
        setLibrary(data.media as CmsMediaImage[]);
      }
      setLibraryLoaded(true);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load the media library."
      );
    } finally {
      setLibraryLoading(false);
    }
  }, [media]);

  const chooseMode = (next: ImageMode) => {
    setMode(next);
    setError("");
    if (next === "library" && !libraryLoaded) void loadLibrary();
  };

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
    void upload_image(file, media, setProgress)
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
              {image_name_from_url(urlValue)}
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
            <ImageIcon className="size-4" strokeWidth={1.75} />
          </span>
          <p className="text-xs text-muted-foreground">
            No image selected yet. Upload a file, paste an image URL, or choose
            one from the media library.
          </p>
        </div>
      )}

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
            onClick={() => chooseMode(item.value)}
          >
            {item.icon}
            {item.label}
          </Button>
        ))}
      </div>

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
              "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-surface-subtle/30 px-4 py-6 text-center transition-colors",
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
              JPG, PNG, GIF, or WEBP up to the media library limit.
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
          className="h-11 rounded-xl bg-card border-input"
          onChange={(event) =>
            onChange(coerce_input_value(field, event.target.value))
          }
        />
      ) : (
        <div className="rounded-xl border border-border bg-card p-3">
          {libraryLoading ? (
            <div className="flex h-28 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : library.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
              <Images className="size-5 text-muted-foreground" strokeWidth={1.75} />
              <p className="text-sm font-semibold text-foreground">
                {libraryLoaded ? "No images in the media library" : "Media library"}
              </p>
              <p className="text-xs text-muted-foreground">
                {libraryLoaded
                  ? "Upload an image to save it to the media library."
                  : "Open the library to choose an existing image."}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-1 rounded-lg"
                disabled={disabled}
                onClick={() => chooseMode("upload")}
              >
                <Upload className="size-3.5" />
                Upload instead
              </Button>
            </div>
          ) : (
            <div className="app-scrollbar grid max-h-56 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
              {library.map((item) => (
                <button
                  key={item.file}
                  type="button"
                  aria-pressed={urlValue === item.url}
                  disabled={disabled}
                  onClick={() => {
                    onChange(item.url);
                    setError("");
                  }}
                  className={cn(
                    "group overflow-hidden rounded-lg border border-border bg-background text-left transition-colors hover:bg-surface-subtle",
                    urlValue === item.url && "border-foreground"
                  )}
                >
                  <span className="relative block aspect-square overflow-hidden bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.thumbnail_url}
                      alt={item.alt || item.title}
                      className="size-full object-cover"
                      loading="lazy"
                    />
                    {urlValue === item.url ? (
                      <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-3" strokeWidth={2} />
                      </span>
                    ) : null}
                  </span>
                  <span className="block truncate px-2 py-1.5 text-xs font-medium text-foreground">
                    {item.title}
                  </span>
                </button>
              ))}
            </div>
          )}
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

export function FieldInput({
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
  const id = `cms-field-${field.name}`;
  const stringValue =
    value === null || value === undefined
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value, null, 2)
        : String(value);

  if (field.type === "boolean") {
    return (
      <label className="flex h-11 items-center gap-3 rounded-xl border border-input bg-card px-4 text-sm cursor-pointer transition-colors hover:border-foreground/30">
        <input
          id={id}
          type="checkbox"
          className="size-5 accent-foreground rounded"
          checked={value === true || value === 1 || value === "1"}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="font-medium text-foreground">
          {value === true || value === 1 || value === "1" ? "Enabled" : "Disabled"}
        </span>
      </label>
    );
  }

  if (field.type === "image") {
    return (
      <ImageFieldInput
        field={field}
        value={value}
        onChange={onChange}
        disabled={disabled}
        media={media}
      />
    );
  }

  if (field.type === "relation") {
    return (
      <div className="relative">
        <div className="flex h-11 w-full items-center justify-between rounded-xl border border-input bg-card px-4 text-sm text-muted-foreground transition-colors hover:border-foreground/30 focus-within:border-ring">
          <input
            id={id}
            type="text"
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            placeholder="Select an item..."
            value={stringValue}
            disabled={disabled}
            onChange={(event) => onChange(coerce_input_value(field, event.target.value))}
          />
          <div className="flex items-center gap-2 pl-2 text-muted-foreground">
            <Plus className="size-4 shrink-0" strokeWidth={1.75} />
            <ChevronDown className="size-4 shrink-0" strokeWidth={1.75} />
          </div>
        </div>
      </div>
    );
  }

  if (field.type === "text" || field.type === "json") {
    return (
      <Textarea
        id={id}
        value={stringValue}
        disabled={disabled}
        rows={field.type === "json" ? 6 : 4}
        placeholder={String(field.options.placeholder ?? "")}
        className={cn("rounded-xl bg-card border-input", field.type === "json" && "font-mono text-xs")}
        onChange={(event) => onChange(coerce_input_value(field, event.target.value))}
      />
    );
  }

  if (field.type === "select") {
    const choices = Array.isArray(field.options.choices)
      ? field.options.choices.map(String)
      : [];
    return (
      <div className="relative">
        <select
          id={id}
          className="h-11 w-full appearance-none rounded-xl border border-input bg-card px-4 pr-10 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:shadow-[0_0_16px_-8px_var(--ring)]"
          value={stringValue}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Select an item...</option>
          {choices.map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5 text-muted-foreground">
          <ChevronDown className="size-4" strokeWidth={1.75} />
        </div>
      </div>
    );
  }

  return (
    <Input
      id={id}
      type={
        field.type === "integer" || field.type === "decimal"
          ? "number"
          : field.type === "datetime"
            ? "datetime-local"
            : "text"
      }
      step={field.type === "decimal" ? "any" : undefined}
      value={
        field.type === "datetime" && stringValue
          ? stringValue.slice(0, 16)
          : stringValue
      }
      disabled={disabled}
      placeholder={String(field.options.placeholder ?? "")}
      className="h-11 rounded-xl bg-card border-input"
      onChange={(event) => onChange(coerce_input_value(field, event.target.value))}
    />
  );
}
