"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  Copy,
  Eye,
  FileText,
  GripVertical,
  Heading1,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Loader2,
  Megaphone,
  Minus,
  Monitor,
  MousePointerClick,
  MoveVertical,
  Plus,
  Quote,
  Save,
  Smartphone,
  Sparkles,
  Tablet,
  Trash2,
  Type,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  SITE_BLOCK_TYPES,
  createBlock,
  createPageDraft,
  newId,
  type BlockAlign,
  type SiteBlock,
  type SiteBlockType,
  type SitePage,
  type SitePageSettings,
  type SitePageSummary,
} from "./page-types";
import { BlockView, PageRenderer, pageStyle } from "./render-blocks";

type Device = "desktop" | "tablet" | "mobile";

interface MediaItem {
  file: string;
  url: string;
  thumbnail_url: string;
  title: string;
  alt: string;
  width: number;
  height: number;
}

interface SiteBuilderStudioProps {
  initialPages: SitePageSummary[];
  initialPage: SitePage;
  csrfToken: string;
  apiRoot: string;
  publicBase: string;
  mediaApiRoot: string;
  mediaLibraryUrl: string;
  moduleGeneratorUrl: string;
}

const BLOCK_PALETTE: Array<{
  type: SiteBlockType;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    type: "hero",
    label: "Hero",
    description: "Large headline with a call to action.",
    icon: Sparkles,
  },
  {
    type: "heading",
    label: "Heading",
    description: "A section title.",
    icon: Heading1,
  },
  {
    type: "text",
    label: "Text",
    description: "A paragraph of body copy.",
    icon: Type,
  },
  {
    type: "image",
    label: "Image",
    description: "A media-library image with a caption.",
    icon: ImageIcon,
  },
  {
    type: "button",
    label: "Button",
    description: "A standalone call to action.",
    icon: MousePointerClick,
  },
  {
    type: "features",
    label: "Features",
    description: "A grid of short feature cards.",
    icon: LayoutGrid,
  },
  {
    type: "cta",
    label: "Call to action",
    description: "A colored banner with a button.",
    icon: Megaphone,
  },
  {
    type: "quote",
    label: "Quote",
    description: "A testimonial or pull quote.",
    icon: Quote,
  },
  {
    type: "list",
    label: "List",
    description: "An ordered or unordered list.",
    icon: List,
  },
  {
    type: "spacer",
    label: "Spacer",
    description: "Vertical breathing room.",
    icon: MoveVertical,
  },
  {
    type: "divider",
    label: "Divider",
    description: "A horizontal rule.",
    icon: Minus,
  },
];

const BLOCK_LABELS: Record<SiteBlockType, string> = {
  hero: "Hero",
  heading: "Heading",
  text: "Text",
  image: "Image",
  button: "Button",
  features: "Features",
  cta: "Call to action",
  quote: "Quote",
  list: "List",
  spacer: "Spacer",
  divider: "Divider",
};

const DEVICE_LABELS: Record<Device, string> = {
  desktop: "Desktop",
  tablet: "Tablet",
  mobile: "Mobile",
};

function fingerprint(page: SitePage): string {
  return JSON.stringify({
    title: page.title,
    slug: page.slug,
    description: page.description,
    published: page.published,
    settings: page.settings,
    blocks: page.blocks,
  });
}

function isBlockType(value: string): value is SiteBlockType {
  return (SITE_BLOCK_TYPES as readonly string[]).includes(value);
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

async function postJson(
  url: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return unwrapJson(response);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
      {hint ? (
        <p className="text-[10.5px] leading-4 text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        value={value ?? ""}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(event) => {
          const parsed = Number(event.target.value);
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
        className="h-8 text-xs"
      />
    </Field>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <Field label={label}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

function ColorField({
  label,
  value,
  onChange,
  fallback = "#ffffff",
  allowEmpty = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  fallback?: string;
  allowEmpty?: boolean;
}) {
  const picker_value = /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;

  return (
    <Field label={label}>
      <div className="flex gap-1.5">
        <input
          type="color"
          value={picker_value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`${label} color picker`}
          className="h-8 w-9 cursor-pointer rounded-md border border-input bg-background p-0.5"
        />
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={allowEmpty ? "Inherit" : fallback}
          className="h-8 font-mono text-[11px]"
        />
      </div>
    </Field>
  );
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-3.5 accent-primary"
      />
      {label}
    </label>
  );
}

function MediaUrlField({
  label,
  value,
  onChange,
  onChoose,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onChoose: () => void;
}) {
  return (
    <Field label={label}>
      <div className="flex gap-1.5">
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="/uploads/media/..."
          className="h-8 font-mono text-[10.5px]"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 px-2"
          onClick={onChoose}
        >
          <ImageIcon className="size-3.5" strokeWidth={1.75} />
          Pick
        </Button>
      </div>
    </Field>
  );
}

function BlockInspector({
  block,
  onChange,
  onMedia,
}: {
  block: SiteBlock;
  onChange: (patch: Partial<SiteBlock>) => void;
  onMedia: (field: "src" | "background_image") => void;
}) {
  const set = onChange;
  const show_align = block.type !== "spacer" && block.type !== "divider";
  const show_background =
    block.type !== "spacer" && block.type !== "divider";
  const show_text_color = ["hero", "features", "cta"].includes(block.type);
  const show_padding = block.type !== "spacer";

  const items = block.items ?? [];
  const updateItem = (
    index: number,
    patch: Partial<{ title: string; description: string }>
  ) => {
    set({
      items: items.map((item, item_index) =>
        item_index === index ? { ...item, ...patch } : item
      ),
    });
  };

  return (
    <div className="space-y-4">
      {block.type === "hero" ? (
        <>
          <Field label="Eyebrow">
            <Input
              value={block.eyebrow ?? ""}
              onChange={(event) => set({ eyebrow: event.target.value })}
              className="h-8 text-xs"
            />
          </Field>
          <Field label="Headline">
            <Textarea
              value={block.title ?? ""}
              onChange={(event) => set({ title: event.target.value })}
              rows={3}
              className="text-xs"
            />
          </Field>
          <Field label="Subtitle">
            <Textarea
              value={block.subtitle ?? ""}
              onChange={(event) => set({ subtitle: event.target.value })}
              rows={3}
              className="text-xs"
            />
          </Field>
          <Field label="Button label">
            <Input
              value={block.button_label ?? ""}
              onChange={(event) => set({ button_label: event.target.value })}
              className="h-8 text-xs"
            />
          </Field>
          <Field label="Button link">
            <Input
              value={block.button_href ?? ""}
              onChange={(event) => set({ button_href: event.target.value })}
              placeholder="# or /contact"
              className="h-8 font-mono text-[11px]"
            />
          </Field>
          <MediaUrlField
            label="Background image"
            value={block.background_image ?? ""}
            onChange={(value) => set({ background_image: value })}
            onChoose={() => onMedia("background_image")}
          />
          <NumberField
            label="Overlay (%)"
            value={block.overlay}
            min={0}
            max={100}
            onChange={(value) => set({ overlay: value })}
          />
          <NumberField
            label="Minimum height (px)"
            value={block.min_height}
            min={120}
            max={1200}
            onChange={(value) => set({ min_height: value })}
          />
        </>
      ) : null}

      {block.type === "heading" ? (
        <>
          <Field label="Heading">
            <Textarea
              value={block.title ?? ""}
              onChange={(event) => set({ title: event.target.value })}
              rows={2}
              className="text-xs"
            />
          </Field>
          <SelectField
            label="Level"
            value={String(block.level ?? 2)}
            options={[1, 2, 3, 4, 5, 6].map((level) => ({
              value: String(level),
              label: `H${level}`,
            }))}
            onChange={(value) => set({ level: Number(value) })}
          />
          <NumberField
            label="Font size (px)"
            value={block.font_size}
            min={10}
            max={120}
            onChange={(value) => set({ font_size: value })}
          />
          <ColorField
            label="Text color"
            value={block.color ?? ""}
            onChange={(value) => set({ color: value })}
          />
        </>
      ) : null}

      {block.type === "text" ? (
        <>
          <Field label="Paragraph">
            <Textarea
              value={block.content ?? ""}
              onChange={(event) => set({ content: event.target.value })}
              rows={8}
              className="text-xs"
            />
          </Field>
          <NumberField
            label="Font size (px)"
            value={block.font_size}
            min={10}
            max={120}
            onChange={(value) => set({ font_size: value })}
          />
          <NumberField
            label="Maximum width (px)"
            value={block.max_width}
            min={240}
            max={1600}
            step={20}
            onChange={(value) => set({ max_width: value })}
          />
          <ColorField
            label="Text color"
            value={block.color ?? ""}
            onChange={(value) => set({ color: value })}
          />
        </>
      ) : null}

      {block.type === "image" ? (
        <>
          <MediaUrlField
            label="Image"
            value={block.src ?? ""}
            onChange={(value) => set({ src: value })}
            onChoose={() => onMedia("src")}
          />
          <Field label="Alternative text">
            <Input
              value={block.alt ?? ""}
              onChange={(event) => set({ alt: event.target.value })}
              className="h-8 text-xs"
            />
          </Field>
          <Field label="Caption">
            <Input
              value={block.caption ?? ""}
              onChange={(event) => set({ caption: event.target.value })}
              className="h-8 text-xs"
            />
          </Field>
          <NumberField
            label="Width (%)"
            value={block.width}
            min={10}
            max={100}
            onChange={(value) => set({ width: value })}
          />
          <div className="flex flex-wrap gap-4">
            <CheckboxField
              label="Rounded corners"
              checked={block.rounded ?? true}
              onChange={(checked) => set({ rounded: checked })}
            />
            <CheckboxField
              label="Shadow"
              checked={block.shadow ?? false}
              onChange={(checked) => set({ shadow: checked })}
            />
          </div>
        </>
      ) : null}

      {block.type === "button" ? (
        <>
          <Field label="Label">
            <Input
              value={block.label ?? ""}
              onChange={(event) => set({ label: event.target.value })}
              className="h-8 text-xs"
            />
          </Field>
          <Field label="Link">
            <Input
              value={block.href ?? ""}
              onChange={(event) => set({ href: event.target.value })}
              placeholder="# or /contact"
              className="h-8 font-mono text-[11px]"
            />
          </Field>
          <SelectField
            label="Style"
            value={block.variant ?? "primary"}
            options={[
              { value: "primary", label: "Primary" },
              { value: "secondary", label: "Secondary" },
              { value: "outline", label: "Outline" },
            ]}
            onChange={(value) => set({ variant: value })}
          />
        </>
      ) : null}

      {block.type === "features" ? (
        <>
          <Field label="Heading">
            <Input
              value={block.title ?? ""}
              onChange={(event) => set({ title: event.target.value })}
              className="h-8 text-xs"
            />
          </Field>
          <Field label="Subtitle">
            <Textarea
              value={block.subtitle ?? ""}
              onChange={(event) => set({ subtitle: event.target.value })}
              rows={3}
              className="text-xs"
            />
          </Field>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] text-muted-foreground">
                Feature cards
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() =>
                  set({
                    items: [
                      ...items,
                      {
                        title: "New feature",
                        description: "Describe the benefit.",
                      },
                    ],
                  })
                }
              >
                <Plus className="size-3" strokeWidth={1.75} />
                Add
              </Button>
            </div>
            {items.map((item, index) => (
              <div
                key={`feature-${index}`}
                className="space-y-2 rounded-md border bg-muted/10 p-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10.5px] font-medium text-muted-foreground">
                    Card {index + 1}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6 text-muted-foreground hover:text-destructive"
                    aria-label={`Remove card ${index + 1}`}
                    onClick={() =>
                      set({
                        items: items.filter(
                          (_entry, item_index) => item_index !== index
                        ),
                      })
                    }
                  >
                    <Trash2 className="size-3" strokeWidth={1.75} />
                  </Button>
                </div>
                <Input
                  value={item.title}
                  onChange={(event) =>
                    updateItem(index, { title: event.target.value })
                  }
                  placeholder="Card title"
                  className="h-8 text-xs"
                />
                <Textarea
                  value={item.description}
                  onChange={(event) =>
                    updateItem(index, { description: event.target.value })
                  }
                  placeholder="Card description"
                  rows={3}
                  className="text-xs"
                />
              </div>
            ))}
          </div>
        </>
      ) : null}

      {block.type === "cta" ? (
        <>
          <Field label="Heading">
            <Textarea
              value={block.title ?? ""}
              onChange={(event) => set({ title: event.target.value })}
              rows={2}
              className="text-xs"
            />
          </Field>
          <Field label="Subtitle">
            <Textarea
              value={block.subtitle ?? ""}
              onChange={(event) => set({ subtitle: event.target.value })}
              rows={3}
              className="text-xs"
            />
          </Field>
          <Field label="Button label">
            <Input
              value={block.button_label ?? ""}
              onChange={(event) => set({ button_label: event.target.value })}
              className="h-8 text-xs"
            />
          </Field>
          <Field label="Button link">
            <Input
              value={block.button_href ?? ""}
              onChange={(event) => set({ button_href: event.target.value })}
              placeholder="# or /contact"
              className="h-8 font-mono text-[11px]"
            />
          </Field>
        </>
      ) : null}

      {block.type === "quote" ? (
        <>
          <Field label="Quote">
            <Textarea
              value={block.quote ?? ""}
              onChange={(event) => set({ quote: event.target.value })}
              rows={5}
              className="text-xs"
            />
          </Field>
          <Field label="Attribution">
            <Input
              value={block.author ?? ""}
              onChange={(event) => set({ author: event.target.value })}
              className="h-8 text-xs"
            />
          </Field>
        </>
      ) : null}

      {block.type === "list" ? (
        <>
          <Field label="Items" hint="One item per line.">
            <Textarea
              value={block.list_items ?? ""}
              onChange={(event) => set({ list_items: event.target.value })}
              rows={7}
              className="text-xs"
            />
          </Field>
          <CheckboxField
            label="Numbered list"
            checked={block.ordered ?? false}
            onChange={(checked) => set({ ordered: checked })}
          />
          <NumberField
            label="Font size (px)"
            value={block.font_size}
            min={10}
            max={120}
            onChange={(value) => set({ font_size: value })}
          />
        </>
      ) : null}

      {block.type === "spacer" ? (
        <NumberField
          label="Height (px)"
          value={block.height}
          min={0}
          max={500}
          onChange={(value) => set({ height: value })}
        />
      ) : null}

      {block.type === "divider" ? (
        <ColorField
          label="Line color"
          value={block.color ?? ""}
          onChange={(value) => set({ color: value })}
          fallback="#e5e7eb"
          allowEmpty={false}
        />
      ) : null}

      {show_align ? (
        <SelectField
          label="Alignment"
          value={(block.align ?? "left") as BlockAlign}
          options={[
            { value: "left", label: "Left" },
            { value: "center", label: "Center" },
            { value: "right", label: "Right" },
          ]}
          onChange={(value) => set({ align: value })}
        />
      ) : null}

      {show_background ? (
        <ColorField
          label="Section background"
          value={block.background_color ?? ""}
          onChange={(value) => set({ background_color: value })}
        />
      ) : null}

      {show_text_color ? (
        <ColorField
          label="Section text color"
          value={block.text_color ?? ""}
          onChange={(value) => set({ text_color: value })}
        />
      ) : null}

      {show_padding ? (
        <NumberField
          label="Vertical padding (px)"
          value={block.padding_y}
          min={0}
          max={220}
          onChange={(value) => set({ padding_y: value })}
        />
      ) : null}
    </div>
  );
}

function PageInspector({
  page,
  onChange,
  onSettings,
}: {
  page: SitePage;
  onChange: (patch: Partial<SitePage>) => void;
  onSettings: (patch: Partial<SitePageSettings>) => void;
}) {
  return (
    <div className="space-y-4">
      <Field label="Page title">
        <Input
          value={page.title}
          onChange={(event) => onChange({ title: event.target.value })}
          className="h-8 text-xs"
        />
      </Field>
      <Field label="Slug" hint="The public URL is /pages/your-slug.">
        <Input
          value={page.slug}
          onChange={(event) => onChange({ slug: event.target.value })}
          className="h-8 font-mono text-[11px]"
        />
      </Field>
      <Field label="Description">
        <Textarea
          value={page.description}
          onChange={(event) => onChange({ description: event.target.value })}
          rows={3}
          className="text-xs"
        />
      </Field>
      <CheckboxField
        label="Published"
        checked={page.published}
        onChange={(checked) => onChange({ published: checked })}
      />
      <div className="border-t pt-4">
        <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Page design
        </p>
        <div className="space-y-4">
          <ColorField
            label="Page background"
            value={page.settings.background}
            onChange={(value) => onSettings({ background: value })}
            allowEmpty={false}
          />
          <ColorField
            label="Default text color"
            value={page.settings.text_color}
            onChange={(value) => onSettings({ text_color: value })}
            allowEmpty={false}
          />
          <NumberField
            label="Content width (px)"
            value={page.settings.max_width}
            min={640}
            max={1600}
            step={20}
            onChange={(value) => onSettings({ max_width: value })}
          />
          <SelectField
            label="Font family"
            value={page.settings.font_family}
            options={[
              { value: "sans", label: "Sans serif" },
              { value: "serif", label: "Serif" },
              { value: "mono", label: "Monospace" },
            ]}
            onChange={(value) => onSettings({ font_family: value })}
          />
        </div>
      </div>
      <div className="rounded-md border bg-muted/20 p-2 text-[10.5px] leading-4 text-muted-foreground">
        Page ID: <span className="font-mono">{page.id || "unsaved draft"}</span>
        <br />
        Updated: {formatDate(page.updated_at)}
      </div>
    </div>
  );
}

function MediaPickerDialog({
  open,
  onOpenChange,
  loading,
  error,
  items,
  libraryUrl,
  onChoose,
  onRefresh,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  error: string;
  items: MediaItem[];
  libraryUrl: string;
  onChoose: (item: MediaItem) => void;
  onRefresh: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Choose an image</DialogTitle>
          <DialogDescription>
            Pick an image from the shared media library. Its public URL will be
            inserted into this block.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex min-h-[220px] items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading media...
          </div>
        ) : error ? (
          <div className="space-y-3">
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
            <Button type="button" size="sm" variant="outline" onClick={onRefresh}>
              Try again
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="space-y-3 rounded-lg border border-dashed bg-muted/20 px-6 py-10 text-center">
            <ImageIcon
              className="mx-auto size-5 text-muted-foreground"
              strokeWidth={1.75}
            />
            <p className="text-sm font-medium">The media library is empty</p>
            <p className="text-xs text-muted-foreground">
              Upload an image first, then return here to place it on the page.
            </p>
            <Button type="button" size="sm" asChild>
              <a href={libraryUrl} target="_blank" rel="noreferrer">
                <ArrowUpRight className="size-3.5" strokeWidth={1.75} />
                Open media library
              </a>
            </Button>
          </div>
        ) : (
          <div className="grid max-h-[420px] grid-cols-2 gap-2 overflow-auto pr-1 sm:grid-cols-3">
            {items.map((item) => (
              <button
                key={item.file}
                type="button"
                onClick={() => onChoose(item)}
                className="group overflow-hidden rounded-lg border bg-card text-left transition-colors hover:border-primary/50 hover:bg-accent/30"
              >
                <span className="block aspect-[4/3] overflow-hidden bg-muted/30">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.thumbnail_url}
                    alt={item.alt || item.title}
                    className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                    loading="lazy"
                  />
                </span>
                <span className="block px-2 py-1.5">
                  <span className="block truncate text-[11px] font-medium">
                    {item.title}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">
                    {item.width > 0 ? `${item.width} × ${item.height}` : "Image"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        <DialogFooter className="justify-between">
          <Button type="button" variant="outline" size="sm" onClick={onRefresh}>
            Refresh
          </Button>
          <Button type="button" variant="outline" size="sm" asChild>
            <a href={libraryUrl} target="_blank" rel="noreferrer">
              <ArrowUpRight className="size-3.5" strokeWidth={1.75} />
              Manage media
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const PREVIEW_DIALOG_STYLE = {
  width: "min(1200px, 96vw)",
  maxWidth: "min(1200px, 96vw)",
};

function PreviewDialog({
  open,
  onOpenChange,
  page,
  device,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  page: SitePage;
  device: Device;
}) {
  const width =
    device === "mobile" ? "390px" : device === "tablet" ? "768px" : "100%";
  const preview_surface_style = { width, maxWidth: "100%" };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0" style={PREVIEW_DIALOG_STYLE}>
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Eye className="size-4" strokeWidth={1.75} />
            Preview · {page.title}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {DEVICE_LABELS[device]} preview. Links are disabled here.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[80vh] overflow-auto bg-muted/40 p-4">
          <div
            className="mx-auto overflow-hidden bg-white shadow-xl ring-1 ring-black/10"
            style={preview_surface_style}
          >
            <PageRenderer page={page} preview />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SiteBuilderStudio({
  initialPages,
  initialPage,
  csrfToken,
  apiRoot,
  publicBase,
  mediaApiRoot,
  mediaLibraryUrl,
  moduleGeneratorUrl,
}: SiteBuilderStudioProps) {
  const [pages, setPages] = useState<SitePageSummary[]>(initialPages);
  const [page, setPage] = useState<SitePage>(initialPage);
  const [savedPage, setSavedPage] = useState<SitePage | null>(initialPage);
  const [selectedId, setSelectedId] = useState(
    initialPage.blocks[0]?.id ?? ""
  );
  const [device, setDevice] = useState<Device>("desktop");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [newPageMenu, setNewPageMenu] = useState(false);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [mediaTarget, setMediaTarget] = useState<{
    blockId: string;
    field: "src" | "background_image";
  } | null>(null);

  const selectedBlock = useMemo(
    () => page.blocks.find((block) => block.id === selectedId) ?? null,
    [page.blocks, selectedId]
  );

  const isDirty = useMemo(
    () => savedPage === null || fingerprint(page) !== fingerprint(savedPage),
    [page, savedPage]
  );

  const canOpen =
    page.id !== "" && page.published && !isDirty && savedPage !== null;

  const updatePage = useCallback(
    (updater: (current: SitePage) => SitePage) => {
      setPage((current) => updater(current));
      setNotice("");
    },
    []
  );

  const updateSettings = useCallback(
    (patch: Partial<SitePageSettings>) => {
      updatePage((current) => ({
        ...current,
        settings: { ...current.settings, ...patch },
      }));
    },
    [updatePage]
  );

  const updateBlock = useCallback(
    (id: string, patch: Partial<SiteBlock>) => {
      updatePage((current) => ({
        ...current,
        blocks: current.blocks.map((block) =>
          block.id === id ? { ...block, ...patch } : block
        ),
      }));
    },
    [updatePage]
  );

  const selectBlock = useCallback((id: string) => {
    setSelectedId(id);
    setError("");
    setNotice("");
  }, []);

  const addBlock = useCallback(
    (type: SiteBlockType, index?: number) => {
      const block = createBlock(type);
      updatePage((current) => {
        const blocks = [...current.blocks];
        const at =
          index === undefined
            ? blocks.length
            : Math.max(0, Math.min(index, blocks.length));
        blocks.splice(at, 0, block);
        return { ...current, blocks };
      });
      setSelectedId(block.id);
      setNotice(`${BLOCK_LABELS[type]} block added.`);
    },
    [updatePage]
  );

  const deleteBlock = useCallback(
    (id: string) => {
      const index = page.blocks.findIndex((block) => block.id === id);
      const next =
        page.blocks[index + 1] ?? page.blocks[index - 1] ?? null;
      updatePage((current) => ({
        ...current,
        blocks: current.blocks.filter((block) => block.id !== id),
      }));
      setSelectedId(next?.id ?? "");
    },
    [page.blocks, updatePage]
  );

  const duplicateBlock = useCallback(
    (id: string) => {
      const index = page.blocks.findIndex((block) => block.id === id);
      const source = page.blocks[index];
      if (source === undefined) return;

      const copy: SiteBlock = {
        ...source,
        id: newId(),
        items: source.items?.map((item) => ({ ...item })),
      };

      updatePage((current) => {
        const blocks = [...current.blocks];
        blocks.splice(index + 1, 0, copy);
        return { ...current, blocks };
      });
      setSelectedId(copy.id);
      setNotice("Block duplicated.");
    },
    [page.blocks, updatePage]
  );

  const moveBlock = useCallback(
    (id: string, direction: "up" | "down") => {
      updatePage((current) => {
        const index = current.blocks.findIndex((block) => block.id === id);
        const target = direction === "up" ? index - 1 : index + 1;
        if (index < 0 || target < 0 || target >= current.blocks.length) {
          return current;
        }
        const blocks = [...current.blocks];
        [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
        return { ...current, blocks };
      });
    },
    [updatePage]
  );

  const moveBlockToIndex = useCallback(
    (id: string, index: number) => {
      updatePage((current) => {
        const from = current.blocks.findIndex((block) => block.id === id);
        if (from < 0) return current;

        const blocks = [...current.blocks];
        const [moved] = blocks.splice(from, 1);
        const insert_at = from < index ? index - 1 : index;
        const at = Math.max(0, Math.min(insert_at, blocks.length));
        blocks.splice(at, 0, moved);
        return { ...current, blocks };
      });
    },
    [updatePage]
  );

  const handleDrop = useCallback(
    (index: number, event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setDragOverIndex(null);

      const type = event.dataTransfer.getData("application/x-eterc-block");
      const blockId = event.dataTransfer.getData(
        "application/x-eterc-block-id"
      );

      if (type !== "" && isBlockType(type)) {
        addBlock(type, index);
        return;
      }

      if (blockId !== "") {
        moveBlockToIndex(blockId, index);
      }
    },
    [addBlock, moveBlockToIndex]
  );

  const onPaletteDragStart = (
    event: DragEvent<HTMLButtonElement>,
    type: SiteBlockType
  ) => {
    event.dataTransfer.setData("application/x-eterc-block", type);
    event.dataTransfer.setData("text/plain", type);
    event.dataTransfer.effectAllowed = "copy";
  };

  const onBlockDragStart = (
    event: DragEvent<HTMLDivElement>,
    blockId: string
  ) => {
    event.dataTransfer.setData("application/x-eterc-block-id", blockId);
    event.dataTransfer.setData("text/plain", blockId);
    event.dataTransfer.effectAllowed = "move";
  };

  const save = useCallback(async () => {
    if (saving) return;

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const data = await postJson(`${apiRoot}/save_page`, {
        page,
        csrf_token: csrfToken,
      });

      if (data.ok === false || data.page === undefined) {
        throw new Error(String(data.error ?? "The page could not be saved."));
      }

      const saved = data.page as SitePage;
      setPage(saved);
      setSavedPage(saved);
      setSelectedId((current) =>
        saved.blocks.some((block) => block.id === current)
          ? current
          : saved.blocks[0]?.id ?? ""
      );
      if (Array.isArray(data.pages)) {
        setPages(data.pages as SitePageSummary[]);
      }
      setNotice("Page saved.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "The page could not be saved."
      );
    } finally {
      setSaving(false);
    }
  }, [apiRoot, csrfToken, page, saving]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [save]);

  const openPage = async (id: string) => {
    if (id === page.id) return;
    if (isDirty && !window.confirm("Discard unsaved changes to this page?")) {
      return;
    }

    setError("");
    setNotice("");
    try {
      const data = await postJson(`${apiRoot}/load_page`, { id });
      if (data.page === undefined) {
        throw new Error("That page could not be loaded.");
      }
      const loaded = data.page as SitePage;
      setPage(loaded);
      setSavedPage(loaded);
      setSelectedId(loaded.blocks[0]?.id ?? "");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "That page could not be loaded."
      );
    }
  };

  const newDraft = (template: "blank" | "landing") => {
    if (isDirty && !window.confirm("Discard unsaved changes to this page?")) {
      return;
    }

    const draft = createPageDraft(
      template === "landing" ? "Landing page" : "Untitled page",
      template
    );
    setPage(draft);
    setSavedPage(null);
    setSelectedId(draft.blocks[0]?.id ?? "");
    setNewPageMenu(false);
    setError("");
    setNotice("New draft created. Save it to add it to the page list.");
  };

  const duplicateCurrent = async () => {
    if (page.id === "") {
      setError("Save this draft before duplicating it.");
      return;
    }

    if (
      isDirty &&
      !window.confirm("Discard unsaved changes and duplicate the saved page?")
    ) {
      return;
    }

    setError("");
    setNotice("");
    try {
      const data = await postJson(`${apiRoot}/duplicate_page`, {
        id: page.id,
        csrf_token: csrfToken,
      });
      if (data.page === undefined) {
        throw new Error("The page could not be duplicated.");
      }
      const copy = data.page as SitePage;
      setPage(copy);
      setSavedPage(copy);
      setSelectedId(copy.blocks[0]?.id ?? "");
      if (Array.isArray(data.pages)) {
        setPages(data.pages as SitePageSummary[]);
      }
      setNotice("Page duplicated as a draft.");
    } catch (duplicateError) {
      setError(
        duplicateError instanceof Error
          ? duplicateError.message
          : "The page could not be duplicated."
      );
    }
  };

  const deletePageById = async (id: string) => {
    const target = pages.find((entry) => entry.id === id);
    if (target === undefined) return;
    if (
      !window.confirm(
        `Delete "${target.title}"? This cannot be undone.`
      )
    ) {
      return;
    }

    setError("");
    setNotice("");
    try {
      const data = await postJson(`${apiRoot}/delete_page`, {
        id,
        csrf_token: csrfToken,
      });
      if (data.ok === false) {
        throw new Error(String(data.error ?? "The page could not be deleted."));
      }
      if (Array.isArray(data.pages)) {
        setPages(data.pages as SitePageSummary[]);
      }

      if (id === page.id) {
        if (data.page !== undefined && data.page !== null) {
          const next = data.page as SitePage;
          setPage(next);
          setSavedPage(next);
          setSelectedId(next.blocks[0]?.id ?? "");
        } else {
          const draft = createPageDraft("Untitled page", "blank");
          setPage(draft);
          setSavedPage(null);
          setSelectedId(draft.blocks[0]?.id ?? "");
        }
      }
      setNotice("Page deleted.");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "The page could not be deleted."
      );
    }
  };

  const loadMedia = useCallback(async () => {
    setMediaLoading(true);
    setMediaError("");
    try {
      const data = await postJson(`${mediaApiRoot}/list_media`, {});
      setMediaItems(
        Array.isArray(data.media) ? (data.media as MediaItem[]) : []
      );
    } catch (loadError) {
      setMediaError(
        loadError instanceof Error
          ? loadError.message
          : "The media library could not be loaded."
      );
    } finally {
      setMediaLoading(false);
    }
  }, [mediaApiRoot]);

  const openMediaPicker = (
    blockId: string,
    field: "src" | "background_image"
  ) => {
    setMediaTarget({ blockId, field });
    setMediaOpen(true);
    void loadMedia();
  };

  const chooseMedia = (item: MediaItem) => {
    if (mediaTarget === null) return;

    const patch: Partial<SiteBlock> =
      mediaTarget.field === "src"
        ? { src: item.url }
        : { background_image: item.url };

    const block = page.blocks.find(
      (entry) => entry.id === mediaTarget.blockId
    );
    if (mediaTarget.field === "src" && block !== undefined && !block.alt) {
      patch.alt = item.alt || item.title;
    }

    updateBlock(mediaTarget.blockId, patch);
    setMediaOpen(false);
    setMediaTarget(null);
  };

  const deviceWidth =
    device === "mobile" ? "390px" : device === "tablet" ? "768px" : "100%";
  const canvas_width_style = { width: deviceWidth, maxWidth: "100%" };

  return (
    <div className="flex h-[calc(100vh-132px)] min-h-[720px] flex-col overflow-hidden rounded-xl border bg-background">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold tracking-[-0.01em]">
              Site Builder
            </h1>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              /{page.slug || "page"}
            </span>
            {isDirty ? (
              <span className="text-[10.5px] font-medium text-amber-600">
                Unsaved
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-emerald-600">
                <Check className="size-3" strokeWidth={2} />
                Saved
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {page.title} · {page.blocks.length} blocks ·{" "}
            {page.published ? "Published" : "Draft"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-md border bg-background p-0.5">
            {(
              [
                { value: "desktop", icon: Monitor, label: "Desktop" },
                { value: "tablet", icon: Tablet, label: "Tablet" },
                { value: "mobile", icon: Smartphone, label: "Mobile" },
              ] as const
            ).map((option) => {
              const Icon = option.icon;
              return (
                <Button
                  key={option.value}
                  type="button"
                  variant={device === option.value ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 px-2"
                  aria-label={`${option.label} preview`}
                  onClick={() => setDevice(option.value)}
                >
                  <Icon className="size-3.5" strokeWidth={1.75} />
                </Button>
              );
            })}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => setPreviewOpen(true)}
          >
            <Eye className="size-3.5" strokeWidth={1.75} />
            Preview
          </Button>

          <Button
            type="button"
            size="sm"
            className="h-8"
            onClick={() => void save()}
            disabled={saving || !isDirty}
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" strokeWidth={1.75} />
            )}
            Save
          </Button>

          {canOpen ? (
            <Button type="button" variant="outline" size="sm" className="h-8" asChild>
              <a
                href={`${publicBase}/${page.slug}`}
                target="_blank"
                rel="noreferrer"
              >
                <ArrowUpRight className="size-3.5" strokeWidth={1.75} />
                Open
              </a>
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              disabled
              title="Save and publish the page to open it."
            >
              <ArrowUpRight className="size-3.5" strokeWidth={1.75} />
              Open
            </Button>
          )}
        </div>
      </header>

      {error ? (
        <p
          role="alert"
          className="border-b border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="border-b border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700">
          {notice}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[250px] shrink-0 flex-col border-r bg-background">
          <div className="relative border-b p-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Pages
              </h2>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => setNewPageMenu((current) => !current)}
              >
                <Plus className="size-3.5" strokeWidth={1.75} />
                New
              </Button>
            </div>
            {newPageMenu ? (
              <div className="absolute right-2 top-11 z-30 w-40 overflow-hidden rounded-md border bg-popover p-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => newDraft("blank")}
                  className="block w-full rounded px-2 py-1.5 text-left text-[11px] hover:bg-accent"
                >
                  Blank page
                </button>
                <button
                  type="button"
                  onClick={() => newDraft("landing")}
                  className="block w-full rounded px-2 py-1.5 text-left text-[11px] hover:bg-accent"
                >
                  Landing page
                </button>
              </div>
            ) : null}

            <div className="mt-2 max-h-[210px] space-y-0.5 overflow-auto">
              {pages.length === 0 ? (
                <p className="px-1 py-2 text-[11px] text-muted-foreground">
                  No saved pages yet.
                </p>
              ) : (
                pages.map((entry) => (
                  <div
                    key={entry.id}
                    className={cn(
                      "group flex items-center gap-1 rounded-md px-1.5 py-1",
                      entry.id === page.id && "bg-accent"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => void openPage(entry.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="flex items-center gap-1.5">
                        <FileText
                          className="size-3 shrink-0 text-muted-foreground"
                          strokeWidth={1.75}
                        />
                        <span className="truncate text-[11.5px] font-medium">
                          {entry.title}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1 pl-[18px] text-[10px] text-muted-foreground">
                        <span className="truncate">/{entry.slug}</span>
                        <span
                          className={cn(
                            "rounded px-1 py-px text-[9px]",
                            entry.published
                              ? "bg-emerald-500/10 text-emerald-700"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {entry.published ? "Live" : "Draft"}
                        </span>
                      </span>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                      aria-label={`Delete ${entry.title}`}
                      onClick={() => void deletePageById(entry.id)}
                    >
                      <Trash2 className="size-3" strokeWidth={1.75} />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-3">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Blocks
            </h2>
            <p className="mb-2 text-[10.5px] leading-4 text-muted-foreground">
              Click to append or drag onto the canvas.
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {BLOCK_PALETTE.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.type}
                    type="button"
                    draggable
                    onDragStart={(event) =>
                      onPaletteDragStart(event, item.type)
                    }
                    onClick={() => addBlock(item.type)}
                    title={item.description}
                    className="flex cursor-grab flex-col items-start gap-1 rounded-md border bg-background p-2 text-left transition-colors hover:border-primary/40 hover:bg-accent/40 active:cursor-grabbing"
                  >
                    <Icon
                      className="size-3.5 text-muted-foreground"
                      strokeWidth={1.75}
                    />
                    <span className="text-[10.5px] font-medium">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t p-3">
            <a
              href={moduleGeneratorUrl}
              className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground hover:text-foreground"
            >
              <LayoutGrid className="size-3" strokeWidth={1.75} />
              Module generator
            </a>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col bg-muted/30">
          <div className="flex items-center justify-between gap-2 border-b bg-background/80 px-3 py-1.5 text-[10.5px] text-muted-foreground backdrop-blur">
            <span className="inline-flex items-center gap-1.5">
              <GripVertical className="size-3" strokeWidth={1.75} />
              Click a block to edit · drag to reorder
            </span>
            <span>{DEVICE_LABELS[device]}</span>
          </div>

          <div
            className="min-h-0 flex-1 overflow-auto p-6"
            onClick={() => setSelectedId("")}
          >
            <div
              className="mx-auto transition-[width] duration-200"
              style={canvas_width_style}
            >
              <div
                className="overflow-hidden rounded-sm shadow-xl ring-1 ring-black/5"
                style={{
                  ...pageStyle(page.settings),
                  minHeight: "620px",
                }}
              >
                {page.blocks.map((block, index) => {
                  const selected = block.id === selectedId;
                  return (
                    <div
                      key={block.id}
                      draggable
                      onDragStart={(event) =>
                        onBlockDragStart(event, block.id)
                      }
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        setDragOverIndex(index);
                      }}
                      onDrop={(event) => handleDrop(index, event)}
                      onClick={(event) => {
                        event.stopPropagation();
                        selectBlock(block.id);
                      }}
                      className={cn(
                        "group relative cursor-default",
                        selected && "z-10"
                      )}
                    >
                      {dragOverIndex === index ? (
                        <div className="h-1 bg-primary" />
                      ) : null}
                      {selected ? (
                        <div className="pointer-events-none absolute inset-0 z-10 ring-2 ring-inset ring-primary" />
                      ) : null}
                      <div
                        className={cn(
                          "absolute -top-3 right-2 z-20 flex items-center gap-0.5 rounded-md border bg-background p-0.5 shadow-sm transition-opacity",
                          selected
                            ? "opacity-100"
                            : "opacity-0 group-hover:opacity-100"
                        )}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <span className="px-1.5 text-[10px] text-muted-foreground">
                          {BLOCK_LABELS[block.type]}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          aria-label="Move block up"
                          disabled={index === 0}
                          onClick={() => moveBlock(block.id, "up")}
                        >
                          <ArrowUp className="size-3" strokeWidth={1.75} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          aria-label="Move block down"
                          disabled={index === page.blocks.length - 1}
                          onClick={() => moveBlock(block.id, "down")}
                        >
                          <ArrowDown className="size-3" strokeWidth={1.75} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          aria-label="Duplicate block"
                          onClick={() => duplicateBlock(block.id)}
                        >
                          <Copy className="size-3" strokeWidth={1.75} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-6 text-muted-foreground hover:text-destructive"
                          aria-label="Delete block"
                          onClick={() => deleteBlock(block.id)}
                        >
                          <Trash2 className="size-3" strokeWidth={1.75} />
                        </Button>
                      </div>
                      <BlockView
                        block={block}
                        pageMaxWidth={page.settings.max_width}
                        preview
                      />
                    </div>
                  );
                })}

                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "copy";
                    setDragOverIndex(page.blocks.length);
                  }}
                  onDrop={(event) => handleDrop(page.blocks.length, event)}
                  className={cn(
                    "m-4 rounded-lg border-2 border-dashed px-4 py-8 text-center text-xs transition-colors",
                    dragOverIndex === page.blocks.length
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground"
                  )}
                >
                  {page.blocks.length === 0
                    ? "Drag a block here to start the page."
                    : "Drop a block here to add it at the end."}
                </div>
              </div>
            </div>
          </div>
        </main>

        <aside className="flex w-[310px] shrink-0 flex-col overflow-hidden border-l bg-background">
          <div className="flex items-start justify-between gap-2 border-b p-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {selectedBlock ? "Block settings" : "Page settings"}
              </p>
              <p className="truncate text-xs font-semibold">
                {selectedBlock
                  ? BLOCK_LABELS[selectedBlock.type]
                  : page.title || "Untitled page"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              {selectedBlock ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label="Duplicate block"
                    onClick={() => duplicateBlock(selectedBlock.id)}
                  >
                    <Copy className="size-3.5" strokeWidth={1.75} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-destructive"
                    aria-label="Delete block"
                    onClick={() => deleteBlock(selectedBlock.id)}
                  >
                    <Trash2 className="size-3.5" strokeWidth={1.75} />
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label="Duplicate page"
                    disabled={page.id === ""}
                    onClick={() => void duplicateCurrent()}
                  >
                    <Copy className="size-3.5" strokeWidth={1.75} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-destructive"
                    aria-label="Delete page"
                    disabled={page.id === ""}
                    onClick={() => void deletePageById(page.id)}
                  >
                    <Trash2 className="size-3.5" strokeWidth={1.75} />
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {selectedBlock ? (
              <BlockInspector
                block={selectedBlock}
                onChange={(patch) => updateBlock(selectedBlock.id, patch)}
                onMedia={(field) => openMediaPicker(selectedBlock.id, field)}
              />
            ) : (
              <PageInspector
                page={page}
                onChange={(patch) =>
                  updatePage((current) => ({ ...current, ...patch }))
                }
                onSettings={updateSettings}
              />
            )}
          </div>
        </aside>
      </div>

      <MediaPickerDialog
        open={mediaOpen}
        onOpenChange={(open) => {
          setMediaOpen(open);
          if (!open) setMediaTarget(null);
        }}
        loading={mediaLoading}
        error={mediaError}
        items={mediaItems}
        libraryUrl={mediaLibraryUrl}
        onChoose={chooseMedia}
        onRefresh={() => void loadMedia()}
      />

      <PreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        page={page}
        device={device}
      />
    </div>
  );
}

export default SiteBuilderStudio;
