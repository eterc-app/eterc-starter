"use client";

import { useCallback, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  KeyRound,
  RefreshCw,
  Save,
  Sparkles,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EtViewProps } from "@/engine/views-registry";
import type { CmsRuntimeConfig } from "@/modules/cms/cms-types";
import { BusyButton, PageHeader, cms_call } from "./ui";

function StatusPill({ status }: { status?: string }) {
  if (status === "verified") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="size-3.5" />
        Verified
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2 py-1 text-[11px] font-medium text-destructive">
        <XCircle className="size-3.5" />
        Needs attention
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
      <AlertTriangle className="size-3.5" />
      Not configured
    </span>
  );
}

function RuntimeRow({
  icon,
  label,
  provider,
  status,
  message,
}: {
  icon: ReactNode;
  label: string;
  provider: string;
  status?: string;
  message?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="text-muted-foreground">{icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium">{label}</p>
          <p className="truncate text-xs text-muted-foreground">{provider}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {message ? (
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {message}
          </span>
        ) : null}
        <StatusPill status={status} />
      </div>
    </div>
  );
}

export default function ProjectSettings({ data }: EtViewProps) {
  const initialRuntime = data.runtime as CmsRuntimeConfig;
  const [runtime, setRuntime] = useState<CmsRuntimeConfig>(initialRuntime);
  const [maxPageSize, setMaxPageSize] = useState(
    initialRuntime.cms.max_page_size
  );
  const [seedMemberRole, setSeedMemberRole] = useState(
    initialRuntime.cms.seed_member_role
  );
  const [saving, setSaving] = useState(false);
  const [utilityBusy, setUtilityBusy] = useState(false);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const result = await cms_call<{ runtime: CmsRuntimeConfig }>(
        "settings_save",
        {
          cms: {
            max_page_size: maxPageSize,
            seed_member_role: seedMemberRole,
          },
        }
      );
      setRuntime(result.runtime);
      toast.success("Project settings saved.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save settings."
      );
    } finally {
      setSaving(false);
    }
  }, [maxPageSize, seedMemberRole]);

  const createStarter = useCallback(async () => {
    setUtilityBusy(true);
    try {
      await cms_call("settings_bootstrap");
      toast.success("Starter Posts collection is ready.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not create the starter collection."
      );
    } finally {
      setUtilityBusy(false);
    }
  }, []);

  const refreshSchema = useCallback(async () => {
    setUtilityBusy(true);
    try {
      await cms_call("settings_refresh");
      toast.success("Schema refreshed.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not refresh the schema."
      );
    } finally {
      setUtilityBusy(false);
    }
  }, []);

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-5 p-4 sm:p-6">
      <PageHeader
        title="Project settings"
        actions={
          <BusyButton busy={saving} onClick={save}>
            <Save className="size-4" />
            Save settings
          </BusyButton>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Runtime</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <RuntimeRow
            icon={<Database className="size-4" />}
            label="Database"
            provider={runtime.database.label ?? runtime.database.provider}
            status={runtime.database.status}
            message={runtime.database.message}
          />
          <RuntimeRow
            icon={<KeyRound className="size-4" />}
            label="Authentication"
            provider={runtime.auth.label ?? runtime.auth.provider}
            status={runtime.auth.status}
            message={runtime.auth.message}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API defaults</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="max-page-size">Maximum page size</Label>
            <Input
              id="max-page-size"
              type="number"
              min={1}
              max={500}
              value={maxPageSize}
              onChange={(event) =>
                setMaxPageSize(Number(event.target.value) || 200)
              }
            />
          </div>
          <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-foreground"
              checked={seedMemberRole}
              onChange={(event) => setSeedMemberRole(event.target.checked)}
            />
            <span className="font-medium">Keep the Member role</span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Utilities</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <BusyButton
            type="button"
            variant="outline"
            busy={utilityBusy}
            onClick={createStarter}
          >
            <Sparkles className="size-4" />
            Create starter Posts collection
          </BusyButton>
          <BusyButton
            type="button"
            variant="outline"
            busy={utilityBusy}
            onClick={refreshSchema}
          >
            <RefreshCw className="size-4" />
            Refresh schema
          </BusyButton>
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p>
          SQLite and built-in accounts stay active in this build. Provider
          changes are handled in Eterc Desktop.
        </p>
      </div>
    </div>
  );
}
