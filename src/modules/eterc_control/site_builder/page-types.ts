/**
 * Shared page-builder model.
 *
 * These types are deliberately free of Node APIs so the same block renderer
 * and defaults can run in the visual editor and on the public Next.js route.
 */

export const SITE_BLOCK_TYPES = [
  "hero",
  "heading",
  "text",
  "image",
  "button",
  "features",
  "cta",
  "quote",
  "list",
  "spacer",
  "divider",
] as const;

export type SiteBlockType = (typeof SITE_BLOCK_TYPES)[number];
export type BlockAlign = "left" | "center" | "right";
export type FontFamily = "sans" | "serif" | "mono";

export interface SiteFeature {
  title: string;
  description: string;
}

export interface SiteBlock {
  id: string;
  type: SiteBlockType;
  align?: BlockAlign;
  background_color?: string;
  text_color?: string;
  padding_y?: number;

  // Hero, heading, features, CTA and quote copy.
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  content?: string;
  level?: number;
  font_size?: number;
  max_width?: number;

  // Buttons.
  label?: string;
  href?: string;
  button_label?: string;
  button_href?: string;
  variant?: "primary" | "secondary" | "outline";

  // Images.
  src?: string;
  alt?: string;
  caption?: string;
  width?: number;
  rounded?: boolean;
  shadow?: boolean;
  background_image?: string;
  overlay?: number;
  min_height?: number;

  // Features.
  items?: SiteFeature[];

  // Quote.
  quote?: string;
  author?: string;

  // List.
  list_items?: string;
  ordered?: boolean;

  // Spacer and divider.
  height?: number;
  color?: string;
}

export interface SitePageSettings {
  background: string;
  text_color: string;
  max_width: number;
  font_family: FontFamily;
}

export interface SitePage {
  id: string;
  title: string;
  slug: string;
  description: string;
  published: boolean;
  created_at: string;
  updated_at: string;
  settings: SitePageSettings;
  blocks: SiteBlock[];
}

export interface SitePageSummary {
  id: string;
  title: string;
  slug: string;
  published: boolean;
  updated_at: string;
  block_count: number;
}

export const DEFAULT_PAGE_SETTINGS: SitePageSettings = {
  background: "#ffffff",
  text_color: "#171717",
  max_width: 1120,
  font_family: "sans",
};

export function newId(prefix = "blk"): string {
  const cryptoObject = globalThis.crypto as Crypto | undefined;
  if (typeof cryptoObject?.randomUUID === "function") {
    return `${prefix}_${cryptoObject.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  }
  return `${prefix}_${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export function createBlock(type: SiteBlockType): SiteBlock {
  const id = newId();

  switch (type) {
    case "hero":
      return {
        id,
        type,
        eyebrow: "Eterc page builder",
        title: "Build a page that feels like your product",
        subtitle:
          "Compose sections on the canvas, tune the details, and publish a real Next.js route.",
        button_label: "Get started",
        button_href: "#",
        align: "center",
        min_height: 440,
        overlay: 58,
        background_color: "#0f172a",
        text_color: "#ffffff",
        background_image: "",
        padding_y: 72,
      };
    case "heading":
      return {
        id,
        type,
        title: "A clear section heading",
        level: 2,
        align: "left",
        font_size: 40,
        color: "",
        padding_y: 24,
      };
    case "text":
      return {
        id,
        type,
        content:
          "Write a short paragraph here. Use the inspector to change the copy, width, and alignment.",
        align: "left",
        font_size: 17,
        max_width: 760,
        color: "",
        padding_y: 16,
      };
    case "image":
      return {
        id,
        type,
        src: "",
        alt: "",
        caption: "",
        width: 100,
        align: "center",
        rounded: true,
        shadow: false,
        padding_y: 24,
      };
    case "button":
      return {
        id,
        type,
        label: "Learn more",
        href: "#",
        variant: "primary",
        align: "left",
        padding_y: 16,
      };
    case "features":
      return {
        id,
        type,
        title: "Everything you need to launch",
        subtitle: "A flexible foundation that stays out of your way.",
        align: "left",
        background_color: "#f8fafc",
        text_color: "",
        padding_y: 64,
        items: [
          {
            title: "Composable",
            description:
              "Build with reusable blocks and keep every section editable.",
          },
          {
            title: "Fast by default",
            description:
              "The page renders as a real Next.js route with no client runtime.",
          },
          {
            title: "Yours to extend",
            description:
              "Add your own blocks and styling without fighting a page builder.",
          },
        ],
      };
    case "cta":
      return {
        id,
        type,
        title: "Ready to build the next page?",
        subtitle: "Save this page, publish it, and keep iterating.",
        button_label: "Start now",
        button_href: "#",
        align: "center",
        background_color: "#2563eb",
        text_color: "#ffffff",
        padding_y: 64,
      };
    case "quote":
      return {
        id,
        type,
        quote:
          "The best page builder is the one that gets out of the way and lets the work ship.",
        author: "Eterc",
        align: "center",
        padding_y: 48,
      };
    case "list":
      return {
        id,
        type,
        list_items: "First item\nSecond item\nThird item",
        ordered: false,
        align: "left",
        font_size: 16,
        padding_y: 16,
      };
    case "spacer":
      return { id, type, height: 40 };
    case "divider":
      return { id, type, color: "#e5e7eb", padding_y: 24 };
    default:
      return createBlock("text");
  }
}

export function blankBlocks(): SiteBlock[] {
  return [createBlock("heading"), createBlock("text")];
}

export function landingBlocks(): SiteBlock[] {
  return [
    createBlock("hero"),
    createBlock("features"),
    createBlock("text"),
    createBlock("cta"),
  ];
}

export function createPageDraft(
  title = "Untitled page",
  template: "blank" | "landing" = "landing"
): SitePage {
  const now = new Date().toISOString();
  return {
    id: "",
    title,
    slug: slugify(title),
    description: "",
    published: false,
    created_at: now,
    updated_at: now,
    settings: { ...DEFAULT_PAGE_SETTINGS },
    blocks: template === "landing" ? landingBlocks() : blankBlocks(),
  };
}
