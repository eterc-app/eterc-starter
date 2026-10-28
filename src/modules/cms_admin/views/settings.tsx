"use client";

import { useCallback, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FilePlus2,
  KeyRound,
  Loader2,
  RefreshCw,
  Save,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Notice } from "@/components/app/Notice";
import { PageActions } from "@/components/app/PageActions";
import { PageActionsPortal } from "@/components/app/PageActionsSlot";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EtViewProps } from "@/engine/views-registry";
import type { CmsRuntimeConfig } from "@/modules/cms/cms-types";
import { BusyButton, PageHeader, cms_call } from "./ui";

function StatusPill({ status }: { status?: string }) {
  if (status === "verified") {
    return (
      <Badge variant="success">
        <CheckCircle2 className="size-3.5" strokeWidth={1.75} />
        Verified
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge variant="destructive">
        <XCircle className="size-3.5" strokeWidth={1.75} />
        Needs attention
      </Badge>
    );
  }
  return (
    <Badge variant="outline">
      <AlertTriangle className="size-3.5" strokeWidth={1.75} />
      Not configured
    </Badge>
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
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{label}</p>
          <p className="truncate text-xs text-muted-foreground">{provider}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
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
    <div className="app-page max-w-4xl">
      <PageActionsPortal>
        <PageActions
          items={[
            {
              label: saving ? "Saving settings" : "Save settings",
              icon: saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              ),
              variant: "default",
              disabled: saving,
              onSelect: save,
            },
          ]}
        />
      </PageActionsPortal>
      <PageHeader
        eyebrow="System"
        title="Project settings"
        description="Runtime defaults for this private CMS workspace."
      />

      <Card>
        <CardHeader>
          <CardTitle>Runtime</CardTitle>
          <CardDescription>
            Providers currently active for this installation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <RuntimeRow
            icon={<Database className="size-4" strokeWidth={1.75} />}
            label="Database"
            provider={runtime.database.label ?? runtime.database.provider}
            status={runtime.database.status}
            message={runtime.database.message}
          />
          <RuntimeRow
            icon={<KeyRound className="size-4" strokeWidth={1.75} />}
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
          <CardDescription>
            Limits applied to every private API response.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3">
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
          <label className="flex h-10 items-center gap-3 rounded-lg border border-input bg-card px-3 text-sm">
            <input
              type="checkbox"
              className="size-5 accent-foreground"
              checked={seedMemberRole}
              onChange={(event) => setSeedMemberRole(event.target.checked)}
            />
            <span className="font-semibold">Keep the Member role</span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Utilities</CardTitle>
          <CardDescription>
            Maintenance tasks for the current schema.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <BusyButton
            type="button"
            variant="outline"
            busy={utilityBusy}
            onClick={createStarter}
          >
            <FilePlus2 className="size-4" />
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

      <Notice icon={AlertTriangle}>
        SQLite and built-in accounts stay active in this build. Provider changes
        are handled in Eterc Desktop.
      </Notice>
    </div>
  );
}
