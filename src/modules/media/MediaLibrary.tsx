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
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Grid2X2,
  Image as ImageIcon,
  List,
  Loader2,
  Pencil,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { useConfirm } from "@/components/app/ConfirmDialog";
import { Notice } from "@/components/app/Notice";
import { PageActions } from "@/components/app/PageActions";
import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { MediaItem, MediaStats } from "./media-store";

type ViewMode = "grid" | "list";

interface MediaLibraryProps {
  initialMedia: MediaItem[];
  initialStats: MediaStats;
  csrfToken: string;
  uploadUrl: string;
  apiRoot: string;
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
  csrfToken,
  uploadUrl,
  apiRoot,
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
  const { confirm, dialog: confirm_dialog } = useConfirm();

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
    const confirmed = await confirm({
      title: "Delete media?",
      description: (
        <>
          <span className="font-mono text-foreground">{selected.title}</span>{" "}
          will be permanently removed from the media library. This cannot be
          undone.
        </>
      ),
      confirmLabel: "Delete media",
    });
    if (!confirmed) return;

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
    <div className="app-page">
      <PageHeader
        eyebrow="Content"
        title="Media library"
        description={`${stats.count} ${stats.count === 1 ? "image" : "images"} · ${stats.total_label}`}
        actions={
          <PageActions
            items={[
              {
                label: "Upload images",
                icon: <Upload className="size-4" strokeWidth={1.75} />,
                variant: "default",
                onSelect: () => fileInputRef.current?.click(),
              },
            ]}
          />
        }
      />

      <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                strokeWidth={1.75}
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search media..."
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
              <Button
                type="button"
                variant={view === "grid" ? "secondary" : "ghost"}
                size="icon-sm"
                aria-label="Grid view"
                aria-pressed={view === "grid"}
                onClick={() => setView("grid")}
              >
                <Grid2X2 className="size-4" strokeWidth={1.75} />
              </Button>
              <Button
                type="button"
                variant={view === "list" ? "secondary" : "ghost"}
                size="icon-sm"
                aria-label="List view"
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
              >
                <List className="size-4" strokeWidth={1.75} />
              </Button>
            </div>
          </div>

          {error ? (
            <Notice icon={AlertTriangle} tone="destructive">
              {error}
            </Notice>
          ) : null}
          {notice ? (
            <Notice icon={CheckCircle2} tone="success">
              {notice}
            </Notice>
          ) : null}

          {uploading ? (
            <div className="space-y-3 rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="size-3.5 animate-spin" />
                  Uploading image...
                </span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-foreground transition-[width]"
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
            className="grid gap-4"
          >
            <div className="min-w-0">
              {filtered.length === 0 ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "flex min-h-[340px] w-full flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center transition-colors hover:border-foreground/30 hover:bg-surface-subtle",
                    dragActive && "border-foreground bg-muted"
                  )}
                >
                  <span className="grid size-12 place-items-center rounded-full border border-border bg-muted text-muted-foreground">
                    <ImageIcon
                      className="size-5"
                      strokeWidth={1.75}
                    />
                  </span>
                  <span className="space-y-1">
                    <span className="block text-sm font-semibold">
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
                        "group overflow-hidden rounded-xl border border-border bg-card text-left transition-colors hover:bg-surface-subtle",
                        selectedFile === item.file && "border-foreground"
                      )}
                    >
                      <span className="relative block aspect-square overflow-hidden bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.thumbnail_url}
                          alt={item.alt || item.title}
                          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                          loading="lazy"
                        />
                        {selectedFile === item.file ? (
                          <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground">
                            <Check className="size-3.5" strokeWidth={2} />
                          </span>
                        ) : null}
                      </span>
                      <span className="block space-y-0.5 px-3 py-2.5">
                        <span className="block truncate text-sm font-semibold">
                          {item.title}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {dimensions(item)} · {formatBytes(item.size)}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="app-scrollbar overflow-hidden rounded-xl border border-border bg-card">
                  {filtered.map((item) => (
                    <button
                      key={item.file}
                      type="button"
                      onClick={() => select(item.file)}
                      className={cn(
                        "flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-surface-subtle",
                        selectedFile === item.file && "bg-muted"
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.thumbnail_url}
                        alt={item.alt || item.title}
                        className="size-11 shrink-0 rounded-lg border border-border object-cover"
                        loading="lazy"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {item.title}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {item.original_name}
                        </span>
                      </span>
                      <span className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">
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

            <Sheet
              open={selected !== null}
              onOpenChange={(open) => {
                if (!open) {
                  setSelectedFile("");
                  setEditing(false);
                }
              }}
            >
              <SheetContent className="max-w-[480px]">
                {selected ? (
                  <>
                    <SheetHeader>
                      <DialogTitle>Attachment details</DialogTitle>
                      <DialogDescription className="truncate font-mono text-xs">
                        {selected.file}
                      </DialogDescription>
                    </SheetHeader>

                    <SheetBody className="space-y-4 p-4">
                  <div className="overflow-hidden rounded-lg border border-border bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selected.url}
                      alt={selected.alt || selected.title}
                      className="max-h-[240px] w-full object-contain"
                    />
                  </div>

                  {editing ? (
                    <div className="space-y-4">
                      <div className="space-y-3">
                        <Label htmlFor="media-title">Title</Label>
                        <Input
                          id="media-title"
                          value={draftTitle}
                          onChange={(event) => setDraftTitle(event.target.value)}
                        />
                      </div>
                      <div className="space-y-3">
                        <Label htmlFor="media-alt">Alternative text</Label>
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
                        <p className="text-sm font-semibold leading-5">
                          {selected.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {dimensions(selected)} · {formatBytes(selected.size)}
                        </p>
                      </div>

                      <div className="space-y-3">
                        <Label>File URL</Label>
                        <div className="flex gap-2">
                          <Input
                            readOnly
                            value={selected.url}
                            className="font-mono text-xs"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="shrink-0"
                            aria-label="Copy image URL"
                            onClick={() => void copyUrl(selected.url)}
                          >
                            {copied ? (
                              <Check className="size-4" strokeWidth={2} />
                            ) : (
                              <Copy className="size-4" strokeWidth={1.75} />
                            )}
                          </Button>
                        </div>
                      </div>

                      <dl className="grid grid-cols-[92px_minmax(0,1fr)] gap-y-2 text-xs">
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

                      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
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
                    </SheetBody>
                  </>
                ) : null}
              </SheetContent>
            </Sheet>
          </div>

          {media.length > 0 && selected === null ? (
            <p className="text-xs text-muted-foreground">
              Select an image to copy its URL, edit its metadata, or delete it.
            </p>
          ) : null}
      </div>

      {confirm_dialog}
    </div>
  );
}

export default MediaLibrary;
