import * as fs from "node:fs";
import * as path from "node:path";
import { DATA_DIR, ensure_dir } from "@/engine/paths";
import {
  DEFAULT_PAGE_SETTINGS,
  SITE_BLOCK_TYPES,
  createBlock,
  landingBlocks,
  newId,
  slugify,
  type BlockAlign,
  type FontFamily,
  type SiteBlock,
  type SiteBlockType,
  type SiteFeature,
  type SitePage,
  type SitePageSettings,
  type SitePageSummary,
} from "./page-types";

export const PAGES_PATH = path.join(
  DATA_DIR,
  "settings",
  "site_builder",
  "pages.json"
);

const BLOCK_TYPE_SET = new Set<string>(SITE_BLOCK_TYPES);
const ALIGN_SET = new Set<BlockAlign>(["left", "center", "right"]);
const FONT_SET = new Set<FontFamily>(["sans", "serif", "mono"]);
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function text(value: unknown, max: number): string {
  return String(value ?? "").slice(0, max);
}

function numberValue(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return !["", "0", "false", "no", "off"].includes(value.toLowerCase());
  }
  if (typeof value === "number") return value !== 0;
  return fallback;
}

function color(value: unknown, fallback = ""): string {
  const candidate = String(value ?? "").trim();
  if (candidate === "") return fallback;
  return COLOR_PATTERN.test(candidate) ? candidate.toLowerCase() : fallback;
}

/** A color field where an explicit empty string means "no color". */
function optionalColor(value: unknown, fallback: string): string {
  if (value === undefined || value === null) return fallback;
  const candidate = String(value).trim();
  if (candidate === "") return "";
  return COLOR_PATTERN.test(candidate) ? candidate.toLowerCase() : fallback;
}

function align(value: unknown, fallback: BlockAlign = "left"): BlockAlign {
  const candidate = String(value ?? "") as BlockAlign;
  return ALIGN_SET.has(candidate) ? candidate : fallback;
}

function url(value: unknown): string {
  const candidate = String(value ?? "").trim().slice(0, 2048);
  if (candidate === "") return "";
  if (/^(https?:\/\/|mailto:|tel:)/i.test(candidate)) return candidate;
  if (candidate.startsWith("/") || candidate.startsWith("#")) return candidate;
  return "#";
}

function safeSlug(value: unknown, fallbackTitle: string): string {
  const raw = String(value ?? "").trim().toLowerCase();
  const candidate = raw === "" ? slugify(fallbackTitle) : raw;
  const normalized = candidate
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  if (normalized === "" || !SLUG_PATTERN.test(normalized)) return "page";
  return normalized;
}

function normalizeFeature(value: unknown): SiteFeature | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const title = text(record.title, 120).trim();
  const description = text(record.description, 500).trim();
  if (title === "" && description === "") return null;
  return { title, description };
}

export function normalizeBlock(value: unknown): SiteBlock | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const type = String(record.type ?? "") as SiteBlockType;
  if (!BLOCK_TYPE_SET.has(type)) return null;

  const base = createBlock(type);
  const id =
    typeof record.id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(record.id)
      ? record.id
      : newId();

  const block: SiteBlock = {
    ...base,
    id,
    type,
    align: align(record.align, base.align ?? "left"),
    background_color: optionalColor(
      record.background_color,
      base.background_color ?? ""
    ),
    text_color: optionalColor(record.text_color, base.text_color ?? ""),
    padding_y: numberValue(
      record.padding_y,
      base.padding_y ?? 16,
      0,
      220
    ),
    eyebrow: text(record.eyebrow, 160),
    title: text(record.title, 240),
    subtitle: text(record.subtitle, 600),
    content: text(record.content, 12000),
    level: numberValue(record.level, base.level ?? 2, 1, 6),
    font_size: numberValue(record.font_size, base.font_size ?? 17, 10, 120),
    max_width: numberValue(record.max_width, base.max_width ?? 760, 240, 1600),
    label: text(record.label, 120),
    href: url(record.href),
    button_label: text(record.button_label, 120),
    button_href: url(record.button_href),
    variant:
      record.variant === "secondary" || record.variant === "outline"
        ? record.variant
        : "primary",
    src: url(record.src),
    alt: text(record.alt, 300),
    caption: text(record.caption, 400),
    width: numberValue(record.width, base.width ?? 100, 10, 100),
    rounded: booleanValue(record.rounded, base.rounded ?? true),
    shadow: booleanValue(record.shadow, base.shadow ?? false),
    background_image: url(record.background_image),
    overlay: numberValue(record.overlay, base.overlay ?? 50, 0, 100),
    min_height: numberValue(
      record.min_height,
      base.min_height ?? 320,
      120,
      1200
    ),
    quote: text(record.quote, 1200),
    author: text(record.author, 160),
    list_items: text(record.list_items, 6000),
    ordered: booleanValue(record.ordered, base.ordered ?? false),
    height: numberValue(record.height, base.height ?? 40, 0, 500),
    color: color(record.color, base.color ?? ""),
  };

  if (type === "features") {
    block.items = Array.isArray(record.items)
      ? record.items
          .map(normalizeFeature)
          .filter((item): item is SiteFeature => item !== null)
          .slice(0, 8)
      : base.items ?? [];
  } else {
    delete block.items;
  }

  return block;
}

export function normalizePage(
  value: unknown,
  options: { id?: string; created_at?: string; updated_at?: string } = {}
): SitePage {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The page is not valid.");
  }

  const record = value as Record<string, unknown>;
  const title = text(record.title, 120).trim() || "Untitled page";
  const slug = safeSlug(record.slug, title);
  const now = new Date().toISOString();

  const raw_settings =
    record.settings !== null &&
    typeof record.settings === "object" &&
    !Array.isArray(record.settings)
      ? (record.settings as Record<string, unknown>)
      : {};

  const settings: SitePageSettings = {
    background: color(
      raw_settings.background,
      DEFAULT_PAGE_SETTINGS.background
    ),
    text_color: color(
      raw_settings.text_color,
      DEFAULT_PAGE_SETTINGS.text_color
    ),
    max_width: numberValue(
      raw_settings.max_width,
      DEFAULT_PAGE_SETTINGS.max_width,
      640,
      1600
    ),
    font_family: FONT_SET.has(raw_settings.font_family as FontFamily)
      ? (raw_settings.font_family as FontFamily)
      : DEFAULT_PAGE_SETTINGS.font_family,
  };

  const blocks = Array.isArray(record.blocks)
    ? record.blocks
        .map(normalizeBlock)
        .filter((block): block is SiteBlock => block !== null)
        .slice(0, 120)
    : [];

  const created_at =
    typeof options.created_at === "string" &&
    !Number.isNaN(Date.parse(options.created_at))
      ? options.created_at
      : typeof record.created_at === "string" &&
          !Number.isNaN(Date.parse(record.created_at))
        ? record.created_at
        : now;

  const updated_at =
    typeof options.updated_at === "string" &&
    !Number.isNaN(Date.parse(options.updated_at))
      ? options.updated_at
      : now;

  const record_id =
    typeof record.id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(record.id)
      ? record.id
      : "";

  return {
    id: options.id ?? (record_id !== "" ? record_id : newId("page")),
    title,
    slug,
    description: text(record.description, 400).trim(),
    published: booleanValue(record.published, false),
    created_at,
    updated_at,
    settings,
    blocks,
  };
}

function readPages(): SitePage[] {
  try {
    if (!fs.existsSync(PAGES_PATH)) return [];
    const parsed: unknown = JSON.parse(fs.readFileSync(PAGES_PATH, "utf8"));
    if (!Array.isArray(parsed)) return [];

    const pages: SitePage[] = [];
    for (const entry of parsed) {
      try {
        const record =
          entry !== null && typeof entry === "object" && !Array.isArray(entry)
            ? (entry as Record<string, unknown>)
            : {};
        pages.push(
          normalizePage(entry, {
            created_at:
              typeof record.created_at === "string"
                ? record.created_at
                : undefined,
            updated_at:
              typeof record.updated_at === "string"
                ? record.updated_at
                : undefined,
          })
        );
      } catch {
        /* skip malformed page */
      }
    }
    return pages;
  } catch {
    return [];
  }
}

function writePages(pages: SitePage[]): void {
  ensure_dir(path.dirname(PAGES_PATH));
  fs.writeFileSync(PAGES_PATH, JSON.stringify(pages, null, 2) + "\n", "utf8");
}

export function listPages(): SitePageSummary[] {
  return readPages()
    .map((page) => ({
      id: page.id,
      title: page.title,
      slug: page.slug,
      published: page.published,
      updated_at: page.updated_at,
      block_count: page.blocks.length,
    }))
    .sort((left, right) => {
      const left_time = Date.parse(left.updated_at);
      const right_time = Date.parse(right.updated_at);
      if (Number.isFinite(left_time) && Number.isFinite(right_time)) {
        return right_time - left_time;
      }
      return left.title.localeCompare(right.title);
    });
}

export function getPage(idOrSlug: string): SitePage | null {
  const pages = readPages();
  return (
    pages.find(
      (page) => page.id === idOrSlug || page.slug === idOrSlug
    ) ?? null
  );
}

export function getPublishedPage(slug: string): SitePage | null {
  const page = readPages().find((entry) => entry.slug === slug);
  if (page === undefined || !page.published) return null;
  return page;
}

/** Seed a starter page the first time the builder is opened. */
export function ensureStarterPage(): SitePage[] {
  const pages = readPages();
  if (pages.length > 0) return pages;

  const now = new Date().toISOString();
  const starter: SitePage = {
    id: newId("page"),
    title: "Home",
    slug: "home",
    description: "A starter page created by the Eterc Site Builder.",
    published: true,
    created_at: now,
    updated_at: now,
    settings: { ...DEFAULT_PAGE_SETTINGS },
    blocks: landingBlocks(),
  };

  writePages([starter]);
  return [starter];
}

export function savePage(input: unknown): SitePage {
  const pages = readPages();
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("The page is not valid.");
  }

  const record = input as Record<string, unknown>;
  const requested_id =
    typeof record.id === "string" && record.id !== "" ? record.id : "";
  const existing =
    requested_id === ""
      ? undefined
      : pages.find((page) => page.id === requested_id);

  if (requested_id !== "" && existing === undefined) {
    throw new Error("That page no longer exists. Reload the builder.");
  }

  const normalized = normalizePage(record, {
    id: existing?.id ?? newId("page"),
    created_at: existing?.created_at,
  });

  const slug_owner = pages.find(
    (page) => page.slug === normalized.slug && page.id !== normalized.id
  );
  if (slug_owner !== undefined) {
    throw new Error(
      `The slug "${normalized.slug}" is already used by "${slug_owner.title}".`
    );
  }

  const next = existing === undefined
    ? [...pages, normalized]
    : pages.map((page) => (page.id === normalized.id ? normalized : page));

  writePages(next);
  return normalized;
}

export function deletePage(id: string): boolean {
  const pages = readPages();
  const next = pages.filter((page) => page.id !== id);
  if (next.length === pages.length) return false;
  writePages(next);
  return true;
}

export function duplicatePage(id: string): SitePage | null {
  const pages = readPages();
  const source = pages.find((page) => page.id === id);
  if (source === undefined) return null;

  const now = new Date().toISOString();
  const title = `${source.title} copy`.slice(0, 120);
  let slug = safeSlug(`${source.slug}-copy`, title);
  let suffix = 2;
  while (pages.some((page) => page.slug === slug)) {
    slug = safeSlug(`${source.slug}-copy-${suffix}`, title);
    suffix += 1;
  }

  const blocks = source.blocks.map((block) => ({
    ...block,
    id: newId(),
  }));

  const copy: SitePage = {
    ...source,
    id: newId("page"),
    title,
    slug,
    published: false,
    created_at: now,
    updated_at: now,
    blocks,
  };

  writePages([...pages, copy]);
  return copy;
}
