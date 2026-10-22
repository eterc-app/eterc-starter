import type { CSSProperties, ReactNode } from "react";
import type {
  BlockAlign,
  FontFamily,
  SiteBlock,
  SitePage,
  SitePageSettings,
} from "./page-types";

function alignment(value: BlockAlign | undefined): CSSProperties["textAlign"] {
  return value ?? "left";
}

function fontStack(font: FontFamily): string {
  switch (font) {
    case "serif":
      return 'Georgia, "Times New Roman", serif';
    case "mono":
      return '"SFMono-Regular", Consolas, "Liberation Mono", monospace';
    default:
      return "var(--font-inter), Inter, ui-sans-serif, system-ui, sans-serif";
  }
}

function buttonStyle(variant: SiteBlock["variant"]): CSSProperties {
  if (variant === "secondary") {
    return {
      backgroundColor: "#f1f5f9",
      color: "#0f172a",
      border: "1px solid #e2e8f0",
    };
  }
  if (variant === "outline") {
    return {
      backgroundColor: "transparent",
      color: "inherit",
      border: "1px solid currentColor",
    };
  }
  return {
    backgroundColor: "#2563eb",
    color: "#ffffff",
    border: "1px solid transparent",
  };
}

function safeLinkProps(
  href: string | undefined,
  preview: boolean
): {
  href: string;
  target?: string;
  rel?: string;
  onClick?: (event: { preventDefault: () => void }) => void;
} {
  const value = href === undefined || href === "" ? "#" : href;
  const external = /^https?:\/\//i.test(value);

  return {
    href: value,
    ...(external ? { target: "_blank", rel: "noreferrer" } : {}),
    ...(preview
      ? {
          onClick: (event: { preventDefault: () => void }) =>
            event.preventDefault(),
        }
      : {}),
  };
}

function ContentWidth({
  children,
  width,
  className,
}: {
  children: ReactNode;
  width: number;
  className?: string;
}) {
  const content_width_style = { maxWidth: `${width}px` };

  return (
    <div
      className={["mx-auto w-full", className].filter(Boolean).join(" ")}
      style={content_width_style}
    >
      {children}
    </div>
  );
}

export function BlockView({
  block,
  pageMaxWidth = 1120,
  preview = false,
}: {
  block: SiteBlock;
  pageMaxWidth?: number;
  preview?: boolean;
}) {
  const sectionPadding = {
    paddingTop: `${block.padding_y ?? 16}px`,
    paddingBottom: `${block.padding_y ?? 16}px`,
  };

  switch (block.type) {
    case "hero": {
      const align = alignment(block.align);
      return (
        <section
          style={{
            position: "relative",
            overflow: "hidden",
            minHeight: `${block.min_height ?? 420}px`,
            display: "flex",
            alignItems: "center",
            backgroundColor: block.background_color || "#0f172a",
            color: block.text_color || "#ffffff",
            backgroundImage: block.background_image
              ? `url("${block.background_image.replace(/"/g, "%22")}")`
              : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
            ...sectionPadding,
          }}
        >
          {block.background_image ? (
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                backgroundColor: `rgba(0, 0, 0, ${
                  (block.overlay ?? 50) / 100
                })`,
              }}
            />
          ) : null}
          <div
            style={{
              position: "relative",
              width: "100%",
              maxWidth: `${Math.min(pageMaxWidth, 900)}px`,
              margin: "0 auto",
              paddingLeft: "24px",
              paddingRight: "24px",
              textAlign: align,
            }}
          >
            {block.eyebrow ? (
              <p className="mb-3.5 mt-0 text-xs font-semibold uppercase tracking-[0.14em] opacity-75">
                {block.eyebrow}
              </p>
            ) : null}
            <h1 className="m-0 text-[clamp(2.1rem,5vw,4.2rem)] font-[650] leading-[1.02] tracking-[-0.04em]">
              {block.title || "Your headline"}
            </h1>
            {block.subtitle ? (
              <p
                style={{
                  margin: "18px auto 0",
                  maxWidth: "680px",
                  fontSize: "clamp(1rem, 1.6vw, 1.2rem)",
                  lineHeight: 1.65,
                  opacity: 0.82,
                  marginLeft: align === "center" ? "auto" : undefined,
                  marginRight: align === "center" ? "auto" : undefined,
                }}
              >
                {block.subtitle}
              </p>
            ) : null}
            {block.button_label ? (
              <div
                style={{
                  marginTop: "28px",
                  display: "flex",
                  justifyContent:
                    align === "center"
                      ? "center"
                      : align === "right"
                        ? "flex-end"
                        : "flex-start",
                }}
              >
                <a
                  {...safeLinkProps(block.button_href, preview)}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg px-5 text-sm font-semibold no-underline"
                  style={buttonStyle("primary")}
                >
                  {block.button_label}
                </a>
              </div>
            ) : null}
          </div>
        </section>
      );
    }

    case "heading": {
      const level = Math.min(6, Math.max(1, block.level ?? 2));
      const Heading = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      return (
        <section
          style={{
            backgroundColor: block.background_color || undefined,
            color: block.text_color || undefined,
            ...sectionPadding,
          }}
        >
          <ContentWidth width={pageMaxWidth} className="px-6">
            <Heading
              style={{
                margin: 0,
                textAlign: alignment(block.align),
                color: block.color || undefined,
                fontSize: `${block.font_size ?? 40}px`,
                lineHeight: 1.15,
                letterSpacing: "-0.025em",
                fontWeight: 650,
              }}
            >
              {block.title || "Section heading"}
            </Heading>
          </ContentWidth>
        </section>
      );
    }

    case "text":
      return (
        <section
          style={{
            backgroundColor: block.background_color || undefined,
            color: block.text_color || undefined,
            ...sectionPadding,
          }}
        >
          <ContentWidth width={pageMaxWidth} className="px-6">
            <p
              style={{
                margin: 0,
                maxWidth: `${block.max_width ?? 760}px`,
                marginLeft:
                  block.align === "center"
                    ? "auto"
                    : block.align === "right"
                      ? "auto"
                      : undefined,
                marginRight:
                  block.align === "center"
                    ? "auto"
                    : block.align === "right"
                      ? 0
                      : undefined,
                textAlign: alignment(block.align),
                color: block.color || undefined,
                fontSize: `${block.font_size ?? 17}px`,
                lineHeight: 1.7,
                whiteSpace: "pre-line",
              }}
            >
              {block.content || "Write your content here."}
            </p>
          </ContentWidth>
        </section>
      );

    case "image": {
      const maxWidth =
        block.width === undefined || block.width >= 100
          ? "100%"
          : `${block.width}%`;
      return (
        <section
          style={{
            backgroundColor: block.background_color || undefined,
            ...sectionPadding,
          }}
        >
          <ContentWidth width={pageMaxWidth} className="px-6">
            <figure
              style={{
                margin: 0,
                marginLeft: block.align === "right" ? "auto" : undefined,
                marginRight: block.align === "left" ? "auto" : undefined,
                maxWidth,
                textAlign: alignment(block.align),
              }}
            >
              {block.src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={block.src}
                  alt={block.alt || ""}
                  style={{
                    display: "block",
                    width: "100%",
                    height: "auto",
                    borderRadius: block.rounded ? "14px" : 0,
                    boxShadow: block.shadow
                      ? "0 18px 45px rgba(15, 23, 42, 0.16)"
                      : undefined,
                  }}
                />
              ) : preview ? (
                <div className="grid min-h-[180px] place-items-center rounded-[14px] border border-dashed border-slate-300 bg-slate-50 text-[13px] text-slate-500">
                  Choose an image for this block
                </div>
              ) : null}
              {block.caption ? (
                <figcaption className="mt-2.5 text-xs leading-normal text-slate-500">
                  {block.caption}
                </figcaption>
              ) : null}
            </figure>
          </ContentWidth>
        </section>
      );
    }

    case "button":
      return (
        <section
          style={{
            backgroundColor: block.background_color || undefined,
            ...sectionPadding,
          }}
        >
          <ContentWidth width={pageMaxWidth} className="px-6">
            <div
              style={{
                display: "flex",
                justifyContent:
                  block.align === "center"
                    ? "center"
                    : block.align === "right"
                      ? "flex-end"
                      : "flex-start",
              }}
            >
              <a
                {...safeLinkProps(block.href, preview)}
                style={{
                  ...buttonStyle(block.variant),
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: "42px",
                  padding: "0 18px",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                {block.label || "Learn more"}
              </a>
            </div>
          </ContentWidth>
        </section>
      );

    case "features": {
      const items = block.items ?? [];
      return (
        <section
          style={{
            backgroundColor: block.background_color || undefined,
            color: block.text_color || undefined,
            ...sectionPadding,
          }}
        >
          <ContentWidth width={pageMaxWidth} className="px-6">
            <div style={{ textAlign: alignment(block.align) }}>
              {block.title ? (
                <h2 className="m-0 text-[clamp(1.7rem,3vw,2.5rem)] font-[650] leading-[1.15] tracking-[-0.025em]">
                  {block.title}
                </h2>
              ) : null}
              {block.subtitle ? (
                <p
                  style={{
                    margin: "12px 0 0",
                    maxWidth: "680px",
                    marginLeft:
                      block.align === "center" ? "auto" : undefined,
                    marginRight:
                      block.align === "center" ? "auto" : undefined,
                    color: "inherit",
                    opacity: 0.68,
                    fontSize: "15px",
                    lineHeight: 1.65,
                  }}
                >
                  {block.subtitle}
                </p>
              ) : null}
            </div>

            {items.length > 0 ? (
              <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item, index) => (
                  <article
                    key={`${item.title}-${index}`}
                    className="rounded-[14px] border border-slate-400/30 bg-white/60 p-[22px]"
                    style={{ textAlign: alignment(block.align) }}
                  >
                    <h3 className="m-0 text-base font-[650] tracking-[-0.01em]">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-[13.5px] leading-[1.65] opacity-70">
                      {item.description}
                    </p>
                  </article>
                ))}
              </div>
            ) : null}
          </ContentWidth>
        </section>
      );
    }

    case "cta":
      return (
        <section
          style={{
            backgroundColor: block.background_color || "#2563eb",
            color: block.text_color || "#ffffff",
            ...sectionPadding,
          }}
        >
          <ContentWidth width={pageMaxWidth} className="px-6">
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "24px",
                textAlign: alignment(block.align),
              }}
            >
              <div className="flex-[1_1_420px]">
                <h2 className="m-0 text-[clamp(1.6rem,3vw,2.4rem)] font-[650] leading-[1.15] tracking-[-0.025em]">
                  {block.title || "Ready to get started?"}
                </h2>
                {block.subtitle ? (
                  <p className="mt-2.5 text-[15px] leading-[1.6] opacity-75">
                    {block.subtitle}
                  </p>
                ) : null}
              </div>
              {block.button_label ? (
                <a
                  {...safeLinkProps(block.button_href, preview)}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-white px-5 text-sm font-[650] text-slate-900 no-underline"
                >
                  {block.button_label}
                </a>
              ) : null}
            </div>
          </ContentWidth>
        </section>
      );

    case "quote":
      return (
        <section
          style={{
            backgroundColor: block.background_color || undefined,
            ...sectionPadding,
          }}
        >
          <ContentWidth width={pageMaxWidth} className="px-6">
            <figure
              style={{
                margin: 0,
                maxWidth: "780px",
                marginLeft:
                  block.align === "center" ? "auto" : undefined,
                marginRight:
                  block.align === "center" ? "auto" : undefined,
                textAlign: alignment(block.align),
              }}
            >
              <blockquote className="m-0 text-[clamp(1.25rem,2.4vw,1.8rem)] font-medium leading-[1.5] tracking-[-0.015em]">
                “{block.quote || "Add a quote."}”
              </blockquote>
              {block.author ? (
                <figcaption className="mt-4 text-[13px] opacity-[0.65]">
                  — {block.author}
                </figcaption>
              ) : null}
            </figure>
          </ContentWidth>
        </section>
      );

    case "list": {
      const items = (block.list_items ?? "")
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter((item) => item !== "");
      const List = block.ordered ? "ol" : "ul";
      return (
        <section
          style={{
            backgroundColor: block.background_color || undefined,
            ...sectionPadding,
          }}
        >
          <ContentWidth width={pageMaxWidth} className="px-6">
            <List
              style={{
                margin: 0,
                paddingLeft: "1.4em",
                textAlign: alignment(block.align),
                fontSize: `${block.font_size ?? 16}px`,
                lineHeight: 1.8,
              }}
            >
              {items.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </List>
          </ContentWidth>
        </section>
      );
    }

    case "spacer":
      return <div style={{ height: `${block.height ?? 40}px` }} />;

    case "divider":
      return (
        <div
          style={{
            paddingTop: `${block.padding_y ?? 24}px`,
            paddingBottom: `${block.padding_y ?? 24}px`,
          }}
        >
          <ContentWidth width={pageMaxWidth} className="px-6">
            <hr
              style={{
                margin: 0,
                border: 0,
                borderTop: `1px solid ${block.color || "#e5e7eb"}`,
              }}
            />
          </ContentWidth>
        </div>
      );

    default:
      return null;
  }
}

export function pageStyle(settings: SitePageSettings): CSSProperties {
  return {
    backgroundColor: settings.background,
    color: settings.text_color,
    fontFamily: fontStack(settings.font_family),
    minHeight: "100%",
  };
}

export function PageRenderer({
  page,
  preview = false,
}: {
  page: SitePage;
  preview?: boolean;
}) {
  return (
    <div style={pageStyle(page.settings)}>
      {page.blocks.map((block) => (
        <BlockView
          key={block.id}
          block={block}
          pageMaxWidth={page.settings.max_width}
          preview={preview}
        />
      ))}
    </div>
  );
}
