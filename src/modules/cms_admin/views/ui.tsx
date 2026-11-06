"use client";

import { useCallback, useState, type ReactNode } from "react";
import { Check, Clipboard, Loader2 } from "lucide-react";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
