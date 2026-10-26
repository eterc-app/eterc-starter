"use client";

import { useCallback, useState, type ReactNode } from "react";
import { Check, Clipboard, Loader2 } from "lucide-react";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { CmsField } from "@/modules/cms/cms-types";

export { EmptyState, PageHeader };

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
    <Label className="flex items-center gap-1.5">
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

export function FieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: CmsField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
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
      <label className="flex h-10 items-center gap-3 rounded-lg border border-input bg-card px-3 text-sm">
        <input
          id={id}
          type="checkbox"
          className="size-5 accent-foreground"
          checked={value === true || value === 1 || value === "1"}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{value === true || value === 1 || value === "1" ? "Enabled" : "Disabled"}</span>
      </label>
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
        className={field.type === "json" ? "font-mono text-xs" : undefined}
        onChange={(event) => onChange(coerce_input_value(field, event.target.value))}
      />
    );
  }

  if (field.type === "select") {
    const choices = Array.isArray(field.options.choices)
      ? field.options.choices.map(String)
      : [];
    if (choices.length > 0) {
      return (
        <select
          id={id}
          className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:shadow-[0_0_16px_-8px_var(--ring)]"
          value={stringValue}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">—</option>
          {choices.map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </select>
      );
    }
  }

  return (
    <Input
      id={id}
      type={
        field.type === "integer" || field.type === "decimal"
          ? "number"
          : field.type === "datetime"
            ? "datetime-local"
            : field.type === "image"
              ? "url"
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
      onChange={(event) => onChange(coerce_input_value(field, event.target.value))}
    />
  );
}
