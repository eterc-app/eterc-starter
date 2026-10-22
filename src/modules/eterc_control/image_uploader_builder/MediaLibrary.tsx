"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ChangeEvent,
} from "react";
import {
  Check,
  Copy,
  ExternalLink,
  FolderOpen,
  Grid2X2,
  HardDrive,
  Image as ImageIcon,
  List,
  Loader2,
  Pencil,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { UploaderModuleChoice } from "./types";
import { ImageUploaderBuilderWizard } from "./ImageUploaderBuilderWizard";
import type { MediaItem, MediaStats } from "./media-store";

type ViewMode = "grid" | "list";

interface MediaLibraryProps {
  initialMedia: MediaItem[];
  initialStats: MediaStats;
  modules: UploaderModuleChoice[];
  csrfToken: string;
  uploadUrl: string;
  apiRoot: string;
  uploaderDetailsUrl: string;
}

interface XhrEnvelope {
  ok?: boolean;
  media?: MediaItem;
  media_items?: MediaItem[];
  stats?: MediaStats;
  error?: string;
  message?: string;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024))
  );
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(exponent === 0 ? 0 : value >= 10 ? 0 : 1)} ${units[exponent]}`;
}

function dimensions(item: MediaItem): string {
  return item.width > 0 && item.height > 0
    ? `${item.width} × ${item.height}`
    : "Unknown size";
}

function isImageFile(file: File): boolean {
  return ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(
    file.type.toLowerCase()
  );
}

async function unwrapJson(response: Response): Promise<Record<string, unknown>> {
  const envelope = (await response.json()) as Record<string, unknown>;

  if (envelope.status === "redirect") {
    window.location.assign(String(envelope.redirect ?? "/"));
    throw new Error("Redirecting...");
  }

  if (envelope.status === "error") {
    throw new Error(
      String(envelope.message ?? "The request could not be completed.")
    );
  }

  const data = envelope.data;
  if (data !== null && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }

  return envelope;
}

export function MediaLibrary({
  initialMedia,
  initialStats,
  modules,
  csrfToken,
  uploadUrl,
  apiRoot,
  uploaderDetailsUrl,
}: MediaLibraryProps) {
  const [media, setMedia] = useState<MediaItem[]>(initialMedia);
  const [stats, setStats] = useState<MediaStats>(initialStats);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("grid");
  const [selectedFile, setSelectedFile] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftAlt, setDraftAlt] = useState("");
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const progress_style = { width: `${progress}%` };

  const selected = useMemo(
    () => media.find((item) => item.file === selectedFile) ?? null,
    [media, selectedFile]
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === "") return media;
    return media.filter((item) =>
      [item.title, item.original_name, item.file, item.alt]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [media, query]);

  const applyStats = useCallback((next: MediaItem[]) => {
    const total_bytes = next.reduce((total, item) => total + item.size, 0);
    setStats({
      count: next.length,
      total_bytes,
      total_label: formatBytes(total_bytes),
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`${apiRoot}/list_media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await unwrapJson(response);
      if (Array.isArray(data.media)) {
        setMedia(data.media as MediaItem[]);
        if (data.stats && typeof data.stats === "object") {
          setStats(data.stats as MediaStats);
        }
      }
    } catch {
      /* keep the last known list */
    }
  }, [apiRoot]);

  const uploadOne = useCallback(
    (file: File, index: number, total: number): Promise<MediaItem> =>
      new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", uploadUrl);
        xhr.responseType = "json";

        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          const current = (event.loaded / event.total) * 100;
          setProgress(Math.round(((index + current / 100) / total) * 100));
        };

        xhr.onload = () => {
          const payload =
            (xhr.response as XhrEnvelope | null) ??
            (() => {
              try {
                return JSON.parse(xhr.responseText) as XhrEnvelope;
              } catch {
                return null;
              }
            })();

          if (
            xhr.status >= 200 &&
            xhr.status < 300 &&
            payload?.media !== undefined
          ) {
            resolve(payload.media);
            return;
          }

          reject(
            new Error(
              payload?.error ??
                payload?.message ??
                "The image could not be uploaded."
            )
          );
        };

        xhr.onerror = () =>
          reject(new Error("The upload could not reach the server."));

        const body = new FormData();
        body.append("file", file);
        body.append("csrf_token", csrfToken);
        xhr.send(body);
      }),
    [csrfToken, uploadUrl]
  );

  const uploadFiles = useCallback(
    async (files: File[]) => {
      const images = files.filter(isImageFile);
      setError("");
      setNotice("");

      if (images.length === 0) {
        setError("Choose a JPG, PNG, GIF, or WEBP image.");
        return;
      }

      setUploading(true);
      setProgress(0);

      const added: MediaItem[] = [];
      try {
        for (let index = 0; index < images.length; index += 1) {
          const item = await uploadOne(images[index], index, images.length);
          added.push(item);
          setMedia((current) => [item, ...current]);
          setSelectedFile(item.file);
        }

        setNotice(
          added.length === 1
            ? "Image uploaded."
            : `${added.length} images uploaded.`
        );
        await refresh();
      } catch (uploadError) {
        setError(
          uploadError instanceof Error
            ? uploadError.message
            : "The image could not be uploaded."
        );
        await refresh();
      } finally {
        setUploading(false);
        setProgress(0);
      }
    },
    [refresh, uploadOne]
  );

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length > 0) void uploadFiles(files);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length > 0) void uploadFiles(files);
  };

  const deleteSelected = async () => {
    if (selected === null) return;
    if (!window.confirm(`Delete "${selected.title}"? This cannot be undone.`)) {
      return;
    }

    setError("");
    setNotice("");

    try {
      const response = await fetch(`${apiRoot}/delete_media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file: selected.file,
          csrf_token: csrfToken,
        }),
      });
      const data = await unwrapJson(response);
      if (data.ok === false) {
        throw new Error(String(data.error ?? "The image could not be deleted."));
      }

      const next = media.filter((item) => item.file !== selected.file);
      setMedia(next);
      applyStats(next);
      setSelectedFile("");
      setEditing(false);
      setNotice("Image deleted.");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "The image could not be deleted."
      );
    }
  };

  const startEditing = () => {
    if (selected === null) return;
    setDraftTitle(selected.title);
    setDraftAlt(selected.alt);
    setEditing(true);
    setError("");
    setNotice("");
  };

  const saveDetails = async () => {
    if (selected === null) return;

    try {
      const response = await fetch(`${apiRoot}/update_media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file: selected.file,
          title: draftTitle,
          alt: draftAlt,
          csrf_token: csrfToken,
        }),
      });
      const data = await unwrapJson(response);
      if (data.ok === false || !data.media) {
        throw new Error(String(data.error ?? "The details could not be saved."));
      }

      const updated = data.media as MediaItem;
      setMedia((current) =>
        current.map((item) => (item.file === updated.file ? updated : item))
      );
      setEditing(false);
      setNotice("Image details saved.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "The details could not be saved."
      );
    }
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setNotice("Image URL copied.");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt("Copy this image URL", url);
    }
  };

  const select = (file: string) => {
    setSelectedFile(file);
    setEditing(false);
    setError("");
    setNotice("");
  };

  return (
    <div className="space-y-4 pb-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-[-0.01em]">
            Image Uploader
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            A reusable Next.js media library. Upload once, then use the same
            image URL in generated modules, pages, and the visual site builder.
          </p>
        </div>
        <Button type="button" onClick={() => fileInputRef.current?.click()}>
          <Upload className="size-4" strokeWidth={1.75} />
          Upload images
        </Button>
      </div>

      <Tabs defaultValue="library" className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="library">
              <ImageIcon className="size-4" strokeWidth={1.75} />
              Library
            </TabsTrigger>
            <TabsTrigger value="install">
              <FolderOpen className="size-4" strokeWidth={1.75} />
              Install in a module
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <HardDrive className="size-3.5" strokeWidth={1.75} />
              {stats.count} {stats.count === 1 ? "image" : "images"} ·{" "}
              {stats.total_label}
            </span>
          </div>
        </div>

        <TabsContent value="library" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                strokeWidth={1.75}
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search media..."
                className="pl-9"
              />
            </div>
            <div className="flex items-center rounded-md border bg-background p-0.5">
              <Button
                type="button"
                variant={view === "grid" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2"
                aria-label="Grid view"
                onClick={() => setView("grid")}
              >
                <Grid2X2 className="size-4" strokeWidth={1.75} />
              </Button>
              <Button
                type="button"
                variant={view === "list" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2"
                aria-label="List view"
                onClick={() => setView("list")}
              >
                <List className="size-4" strokeWidth={1.75} />
              </Button>
            </div>
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700">
              {notice}
            </p>
          ) : null}

          {uploading ? (
            <div className="space-y-2 rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="size-3.5 animate-spin" />
                  Uploading image...
                </span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={progress_style}
                />
              </div>
            </div>
          ) : null}

          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setDragActive(false);
            }}
            onDrop={onDrop}
            className={cn(
              "grid gap-4",
              selected !== null
                ? "xl:grid-cols-[minmax(0,1fr)_340px]"
                : "grid-cols-1"
            )}
          >
            <div className="min-w-0">
              {filtered.length === 0 ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "flex min-h-[340px] w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card px-6 py-12 text-center transition-colors hover:border-primary/50 hover:bg-accent/30",
                    dragActive && "border-primary bg-accent/40"
                  )}
                >
                  <span className="grid size-12 place-items-center rounded-full border bg-muted/40">
                    <ImageIcon
                      className="size-5 text-muted-foreground"
                      strokeWidth={1.75}
                    />
                  </span>
                  <span className="space-y-1">
                    <span className="block text-sm font-medium">
                      {media.length === 0
                        ? "Your media library is empty"
                        : "No images match that search"}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Drop JPG, PNG, GIF, or WEBP files here, or click to
                      browse.
                    </span>
                  </span>
                </button>
              ) : view === "grid" ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
                  {filtered.map((item) => (
                    <button
                      key={item.file}
                      type="button"
                      onClick={() => select(item.file)}
                      className={cn(
                        "group overflow-hidden rounded-lg border bg-card text-left transition-all hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                        selectedFile === item.file &&
                          "border-primary ring-2 ring-primary/20"
                      )}
                    >
                      <span className="relative block aspect-square overflow-hidden bg-muted/30">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.thumbnail_url}
                          alt={item.alt || item.title}
                          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                          loading="lazy"
                        />
                        {selectedFile === item.file ? (
                          <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm">
                            <Check className="size-3.5" strokeWidth={2} />
                          </span>
                        ) : null}
                      </span>
                      <span className="block space-y-0.5 px-2.5 py-2">
                        <span className="block truncate text-[12px] font-medium">
                          {item.title}
                        </span>
                        <span className="block text-[10.5px] text-muted-foreground">
                          {dimensions(item)} · {formatBytes(item.size)}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border bg-card">
                  {filtered.map((item) => (
                    <button
                      key={item.file}
                      type="button"
                      onClick={() => select(item.file)}
                      className={cn(
                        "flex w-full items-center gap-3 border-b border-border/60 px-3 py-2.5 text-left last:border-b-0 hover:bg-muted/40",
                        selectedFile === item.file && "bg-accent/50"
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.thumbnail_url}
                        alt={item.alt || item.title}
                        className="size-10 shrink-0 rounded-md border object-cover"
                        loading="lazy"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium">
                          {item.title}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {item.original_name}
                        </span>
                      </span>
                      <span className="hidden shrink-0 text-right text-[11px] text-muted-foreground sm:block">
                        {dimensions(item)}
                        <br />
                        {formatBytes(item.size)}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                multiple
                className="hidden"
                onChange={onFileChange}
              />
            </div>

            {selected !== null ? (
              <aside className="h-fit overflow-hidden rounded-xl border bg-card xl:sticky xl:top-4">
                <div className="flex items-start justify-between gap-2 border-b px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold">Attachment details</p>
                    <p className="truncate text-[10.5px] text-muted-foreground">
                      {selected.file}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0"
                    aria-label="Close details"
                    onClick={() => {
                      setSelectedFile("");
                      setEditing(false);
                    }}
                  >
                    <X className="size-3.5" strokeWidth={1.75} />
                  </Button>
                </div>

                <div className="space-y-3 p-3">
                  <div className="overflow-hidden rounded-lg border bg-muted/20">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selected.url}
                      alt={selected.alt || selected.title}
                      className="max-h-[240px] w-full object-contain"
                    />
                  </div>

                  {editing ? (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="media-title" className="text-xs">
                          Title
                        </Label>
                        <Input
                          id="media-title"
                          value={draftTitle}
                          onChange={(event) => setDraftTitle(event.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="media-alt" className="text-xs">
                          Alternative text
                        </Label>
                        <Textarea
                          id="media-alt"
                          value={draftAlt}
                          onChange={(event) => setDraftAlt(event.target.value)}
                          rows={3}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" size="sm" onClick={() => void saveDetails()}>
                          Save details
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setEditing(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium leading-5">
                          {selected.title}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {dimensions(selected)} · {formatBytes(selected.size)}
                        </p>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">
                          File URL
                        </Label>
                        <div className="flex gap-1.5">
                          <Input
                            readOnly
                            value={selected.url}
                            className="h-8 font-mono text-[11px]"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-8 shrink-0"
                            aria-label="Copy image URL"
                            onClick={() => void copyUrl(selected.url)}
                          >
                            {copied ? (
                              <Check className="size-3.5" strokeWidth={2} />
                            ) : (
                              <Copy className="size-3.5" strokeWidth={1.75} />
                            )}
                          </Button>
                        </div>
                      </div>

                      <dl className="grid grid-cols-[92px_minmax(0,1fr)] gap-y-1.5 text-[11px]">
                        <dt className="text-muted-foreground">Uploaded</dt>
                        <dd>{new Date(selected.created_at).toLocaleString()}</dd>
                        <dt className="text-muted-foreground">Original name</dt>
                        <dd className="truncate" title={selected.original_name}>
                          {selected.original_name}
                        </dd>
                        <dt className="text-muted-foreground">Type</dt>
                        <dd>{selected.mime}</dd>
                        <dt className="text-muted-foreground">Alt text</dt>
                        <dd className="break-words">
                          {selected.alt || "Not set"}
                        </dd>
                      </dl>

                      <div className="flex flex-wrap gap-2 border-t pt-3">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={startEditing}
                        >
                          <Pencil className="size-3.5" strokeWidth={1.75} />
                          Edit details
                        </Button>
                        <Button type="button" size="sm" variant="outline" asChild>
                          <a
                            href={selected.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink
                              className="size-3.5"
                              strokeWidth={1.75}
                            />
                            Open
                          </a>
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => void deleteSelected()}
                        >
                          <Trash2 className="size-3.5" strokeWidth={1.75} />
                          Delete
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </aside>
            ) : null}
          </div>

          {media.length > 0 && selected === null ? (
            <p className="text-[11px] text-muted-foreground">
              Select an image to copy its URL, edit its metadata, or delete it.
            </p>
          ) : null}
        </TabsContent>

        <TabsContent value="install" className="space-y-4">
          <div className="rounded-lg border bg-card px-4 py-3">
            <p className="text-sm font-medium">Attach an uploader to a module</p>
            <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
              The library above is ready to use on its own. This installer is
              for adding a picture field and upload panel to a generated CRUD
              module. A module needs a controller, model, show view, and delete
              flow before it can receive the uploader.
            </p>
          </div>

          <div className="overflow-hidden rounded-xl border bg-card">
            <ImageUploaderBuilderWizard
              data={{
                initialStep: "choose_mod",
                modules,
                uploader_details_url: uploaderDetailsUrl,
              }}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default MediaLibrary;
