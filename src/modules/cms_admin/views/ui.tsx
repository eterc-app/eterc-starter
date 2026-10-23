"use client";

import { useCallback, useState, type ReactNode } from "react";
import { Check, Clipboard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { CmsField } from "@/modules/cms/cms-types";

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

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-14 text-center">
      <div className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </div>
      <h2 className="mt-4 text-sm font-semibold">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
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
      <label className="flex h-9 items-center gap-2 rounded-md border px-3 text-sm">
        <input
          id={id}
          type="checkbox"
          className="size-4 accent-foreground"
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
          className="h-9 w-full rounded-md border bg-background px-3 text-sm"
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
