"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { cn } from "@/lib/utils";
import type {
  FlowRecord,
  FlowRunStatus,
  FlowTrigger,
} from "@/modules/flows/flow-types";
import { TRIGGER_LABELS } from "@/modules/flows/flow-types";

export interface FlowEnvelope<T> {
  status?: string;
  data?: T;
  message?: string;
  errors?: Record<string, string[]>;
}

export async function flows_call<T>(
  method: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  const response = await fetch(`/api/xhr/flows_admin/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  let envelope: FlowEnvelope<T> | null = null;
  try {
    envelope = (await response.json()) as FlowEnvelope<T>;
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

export function FlowIcon({
  flow,
  className,
}: {
  flow: Pick<FlowRecord, "icon" | "color">;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-surface-subtle",
        className
      )}
      style={{ color: flow.color || undefined }}
    >
      <DynamicIcon name={flow.icon || "zap"} size={20} />
    </span>
  );
}

export function TriggerBadge({ trigger }: { trigger: FlowTrigger }) {
  const icon: Record<FlowTrigger, string> = {
    event: "zap",
    webhook: "webhook",
    schedule: "calendar-clock",
    operation: "workflow",
    manual: "mouse-pointer-click",
  };
  return (
    <Badge variant="outline" className="gap-1.5 font-medium">
      <DynamicIcon name={icon[trigger]} size={13} />
      {TRIGGER_LABELS[trigger]}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === "active" ? "success" : "outline"}>
      {status === "active" ? "Active" : "Inactive"}
    </Badge>
  );
}

export function RunStatusBadge({ status }: { status: FlowRunStatus | string }) {
  const variant =
    status === "success"
      ? "success"
      : status === "error" || status === "timeout"
        ? "destructive"
        : status === "rejected"
          ? "warning"
          : "outline";
  const label =
    status === "success"
      ? "Success"
      : status === "rejected"
        ? "Rejected"
        : status === "error"
          ? "Error"
          : status === "timeout"
            ? "Timed out"
            : status === "running"
              ? "Running"
              : status;
  return <Badge variant={variant}>{label}</Badge>;
}

export function format_datetime(value: unknown): string {
  if (!value) return "—";
  const date =
    typeof value === "number" ? new Date(value * 1000) : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function format_relative(value: unknown): string {
  if (!value) return "Never";
  const date =
    typeof value === "number" ? new Date(value * 1000) : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "Never";
  const diff = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} d ago`;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

export function format_duration(ms: unknown): string {
  const value = Number(ms);
  if (!Number.isFinite(value)) return "—";
  if (value < 1000) return `${Math.max(0, Math.round(value))} ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(1)} s`;
  return `${Math.floor(value / 60_000)}m ${Math.round((value % 60_000) / 1000)}s`;
}

export function FlowMeta({ children }: { children: ReactNode }) {
  return <span className="text-xs text-muted-foreground">{children}</span>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-semibold text-foreground">{label}</span>
      {children}
      {hint ? <span className="text-[11px] leading-snug text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string; icon?: ReactNode }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-surface-subtle p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors",
            value === option.value
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}
