"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { cn } from "@/lib/utils";
import type { CmsField, CmsLink } from "@/modules/cms/cms-types";
import { as_array, as_object, as_string, option_bool, option_string } from "./types";

function header_color(value: string): string | undefined {
  return value || undefined;
}

export function HeaderDisplay({ field }: { field: CmsField }) {
  const title =
    option_string(field, "title") || field.label || field.name || "Header";
  const subtitle = option_string(field, "subtitle");
  const icon = option_string(field, "headerIcon", "header_icon", "icon");
  const color = option_string(field, "headerColor", "header_color", "color");
  const title_style = { color: header_color(color) };

  return (
    <div className="border-b border-border pb-2 pt-1">
      <div className="flex items-start gap-2.5">
        {icon ? (
          <DynamicIcon
            name={icon}
            size={18}
            color={header_color(color)}
            className="mt-0.5 shrink-0 text-foreground"
          />
        ) : null}
        <div className="min-w-0">
          <h3
            className="text-base font-semibold text-foreground"
            style={title_style}
          >
            {title}
          </h3>
          {subtitle ? (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function DividerDisplay({ field }: { field: CmsField }) {
  const title = option_string(field, "title") || field.label;
  const icon = option_string(field, "icon");
  const color = option_string(field, "color");
  const inlineTitle = option_bool(field, false, "inlineTitle", "inline_title");
  const title_style = { color: header_color(color) };

  return (
    <div className="flex flex-col gap-3 py-4">
      {title || icon ? (
        <div
          className={cn(
            "flex items-center gap-2 text-sm font-semibold text-foreground",
            !inlineTitle && "uppercase tracking-wider"
          )}
          style={title_style}
        >
          {icon ? (
            <DynamicIcon
              name={icon}
              size={14}
              color={header_color(color)}
            />
          ) : null}
          {title ? <span>{title}</span> : null}
        </div>
      ) : null}
      <div className="h-px w-full bg-border" />
    </div>
  );
}

const NOTICE_STYLES: Record<
  string,
  { box: string; icon: string }
> = {
  normal: {
    box: "border-l-foreground",
    icon: "text-foreground",
  },
  info: {
    box: "border-l-brand",
    icon: "text-brand",
  },
  success: {
    box: "border-l-success",
    icon: "text-success",
  },
  warning: {
    box: "border-l-warning",
    icon: "text-warning",
  },
  danger: {
    box: "border-l-destructive",
    icon: "text-destructive",
  },
};

export function NoticeDisplay({ field }: { field: CmsField }) {
  const text = option_string(field, "text") || field.label;
  const icon = option_string(field, "icon") || "info";
  const color = option_string(field, "color") || "normal";
  const styles = NOTICE_STYLES[color] ?? NOTICE_STYLES.normal;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border border-l-4 border-border bg-card p-3.5 text-sm text-muted-foreground",
        styles.box
      )}
    >
      <DynamicIcon
        name={icon}
        size={16}
        className={cn("mt-0.5 shrink-0", styles.icon)}
      />
      <span className="flex-1">{text}</span>
    </div>
  );
}

function read_links(field: CmsField): CmsLink[] {
  return as_array(field.options?.links)
    .map((entry): CmsLink | null => {
      const object = as_object(entry);
      const label = as_string(object.label);
      if (!label) return null;
      const type = as_string(object.type) as CmsLink["type"];
      const actionType = as_string(object.actionType ?? object.action_type) as CmsLink["actionType"];
      return {
        label,
        icon: as_string(object.icon) || undefined,
        type: type || "normal",
        actionType: actionType || "url",
        url: as_string(object.url) || undefined,
      };
    })
    .filter((entry): entry is CmsLink => entry !== null);
}

function link_variant(type: CmsLink["type"]) {
  if (type === "primary") return "default" as const;
  if (type === "danger") return "destructive" as const;
  if (type === "normal") return "outline" as const;
  return "secondary" as const;
}

export function ButtonsDisplay({ field }: { field: CmsField }) {
  const links = read_links(field);
  if (links.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-3 text-center text-xs text-muted-foreground">
        No buttons configured.
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {links.map((link, index) => {
        const content = (
          <>
            {link.icon ? <DynamicIcon name={link.icon} size={15} /> : null}
            {link.label}
          </>
        );
        if (link.url) {
          return (
            <Button
              key={`${link.label}-${index}`}
              asChild
              variant={link_variant(link.type)}
              className="rounded-lg"
            >
              <a href={link.url} target="_blank" rel="noreferrer">
                {content}
              </a>
            </Button>
          );
        }
        return (
          <Button
            key={`${link.label}-${index}`}
            type="button"
            variant={link_variant(link.type)}
            className="rounded-lg"
            disabled
            title="Add a URL in Data Studio to enable this button."
          >
            {content}
          </Button>
        );
      })}
    </div>
  );
}

function group_title(field: CmsField): string {
  return option_string(field, "title") || field.label || field.name;
}

function start_open(field: CmsField): boolean {
  const start = option_string(field, "start") || "open";
  return start !== "closed";
}

export function AccordionGroup({
  field,
  children,
}: {
  field: CmsField;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(start_open(field));
  const title = group_title(field);

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-surface-subtle"
      >
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open ? (
        <div className="space-y-4 border-t border-border p-4">{children}</div>
      ) : null}
    </div>
  );
}

export function DetailGroup({
  field,
  children,
}: {
  field: CmsField;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(start_open(field));
  const title = group_title(field);

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-surface-subtle"
      >
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open ? (
        <div className="space-y-4 border-t border-border p-4">{children}</div>
      ) : null}
    </div>
  );
}

export function RawGroup({ children }: { children: ReactNode }) {
  return <div className="space-y-4">{children}</div>;
}
