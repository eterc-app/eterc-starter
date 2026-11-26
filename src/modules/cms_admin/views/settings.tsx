"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Database,
  FilePlus2,
  KeyRound,
  Link as LinkIcon,
  Loader2,
  Pencil,
  Settings2,
  Type,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Notice } from "@/components/app/Notice";
import { PageActions } from "@/components/app/PageActions";
import {
  PageActionsPortal,
  useSetNavbarMeta,
} from "@/components/app/PageActionsSlot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EtViewProps } from "@/engine/views-registry";
import type {
  CmsProjectSettings,
  CmsRuntimeConfig,
} from "@/modules/cms/cms-types";
import { BusyButton, cms_call } from "./ui";

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
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-subtle text-muted-foreground border border-border">
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
  const initialProject = (data.project ?? {}) as Partial<CmsProjectSettings>;
  const [runtime, setRuntime] = useState<CmsRuntimeConfig>(initialRuntime);
  const [projectName, setProjectName] = useState(
    initialProject.name || "Eterc project"
  );
  const [projectDescriptor, setProjectDescriptor] = useState(
    initialProject.descriptor || "CMS workspace"
  );
  const [projectUrl, setProjectUrl] = useState(initialProject.url || "");
  const [defaultLanguage, setDefaultLanguage] = useState(
    initialProject.language || "en-US"
  );
  const [projectOwner, setProjectOwner] = useState(initialProject.owner || "");

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
      const result = await cms_call<{
        runtime: CmsRuntimeConfig;
        project: CmsProjectSettings;
      }>("settings_save", {
        cms: {
          max_page_size: maxPageSize,
          seed_member_role: seedMemberRole,
        },
        project: {
          name: projectName,
          descriptor: projectDescriptor,
          url: projectUrl,
          owner: projectOwner,
          language: defaultLanguage,
        },
      });
      setRuntime(result.runtime);
      if (result.project) {
        setProjectName(result.project.name);
        setProjectDescriptor(result.project.descriptor);
        setProjectUrl(result.project.url);
        setProjectOwner(result.project.owner);
        setDefaultLanguage(result.project.language);
      }
      toast.success("Project settings saved.");
      if (result.project) {
        document.title = result.project.name;
        window.dispatchEvent(
          new CustomEvent("eterc:project-identity", {
            detail: {
              name: result.project.name,
              descriptor: result.project.descriptor,
            },
          })
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save settings."
      );
    } finally {
      setSaving(false);
    }
  }, [
    defaultLanguage,
    maxPageSize,
    projectDescriptor,
    projectName,
    projectOwner,
    projectUrl,
    seedMemberRole,
  ]);

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
      const state = await cms_call<{
        runtime: CmsRuntimeConfig;
      }>("settings_state");
      setRuntime(state.runtime);
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

  const navbarMeta = useMemo(
    () => ({
      section: "Settings",
      title: "Settings",
      icon: <Settings2 className="size-4" strokeWidth={1.75} />,
      refresh: {
        label: "Refresh schema",
        onRefresh: () => void refreshSchema(),
        busy: utilityBusy,
      },
    }),
    [refreshSchema, utilityBusy]
  );
  useSetNavbarMeta(navbarMeta);

  return (
    <div className="app-page max-w-5xl space-y-8">
      <PageActionsPortal>
        <PageActions
          items={[
            {
              label: saving ? "Saving settings" : "Save settings",
              icon: saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" strokeWidth={2.5} />
              ),
              variant: "default",
              disabled: saving,
              onSelect: save,
            },
            {
              label: "Open Data Studio",
              icon: <Database className="size-4" />,
              href: "/admin/data",
            },
          ]}
        />
      </PageActionsPortal>

      {/* PROJECT SETTINGS */}
      <div className="space-y-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="grid gap-3">
            <Label htmlFor="project-name" className="text-sm font-semibold">
              Project Name
            </Label>
            <div className="relative">
              <Input
                id="project-name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="h-11 rounded-xl bg-card border-input pr-10"
              />
              <Type className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            </div>
          </div>

          <div className="grid gap-3">
            <Label htmlFor="project-descriptor" className="text-sm font-semibold">
              Project Descriptor
            </Label>
            <div className="relative">
              <Input
                id="project-descriptor"
                value={projectDescriptor}
                onChange={(e) => setProjectDescriptor(e.target.value)}
                className="h-11 rounded-xl bg-card border-input pr-10"
              />
              <Type className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            </div>
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="grid gap-3">
            <Label htmlFor="project-url" className="text-sm font-semibold">
              Project URL
            </Label>
            <div className="relative">
              <Input
                id="project-url"
                value={projectUrl}
                onChange={(e) => setProjectUrl(e.target.value)}
                placeholder="https://example.com"
                className="h-11 rounded-xl bg-card border-input pr-10"
              />
              <LinkIcon className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            </div>
          </div>

          <div className="grid gap-3">
            <Label htmlFor="default-lang" className="text-sm font-semibold">
              Default Language
            </Label>
            <div className="relative">
              <select
                id="default-lang"
                value={defaultLanguage}
                onChange={(e) => setDefaultLanguage(e.target.value)}
                className="h-11 w-full appearance-none rounded-xl border border-input bg-card px-4 text-sm text-foreground outline-none"
              >
                <option value="en-US">English (United States)</option>
                <option value="en-GB">English (United Kingdom)</option>
                <option value="fr-FR">Français</option>
                <option value="de-DE">Deutsch</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            </div>
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="grid gap-3">
            <Label htmlFor="project-owner" className="text-sm font-semibold">
              Project Owner
            </Label>
            <div className="relative">
              <Input
                id="project-owner"
                value={projectOwner}
                onChange={(e) => setProjectOwner(e.target.value)}
                placeholder="owner@example.com"
                className="h-11 rounded-xl bg-card border-input pr-10"
              />
              <Pencil className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            </div>
          </div>
        </div>
      </div>

      {/* DATABASE & SCHEMA MAINTENANCE */}
      <section className="border-t border-border pt-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">Database & Schema</h3>
            <p className="text-xs text-muted-foreground">
              Collections and schemas are created and configured in Data Studio.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="rounded-lg">
              <Link href="/admin/data">
                <Database className="size-4" />
                Open Data Studio
                <ArrowUpRight className="size-3.5" />
              </Link>
            </Button>
            <BusyButton
              type="button"
              variant="outline"
              busy={utilityBusy}
              onClick={createStarter}
              className="rounded-lg"
            >
              <FilePlus2 className="size-4" />
              Use starter Posts
            </BusyButton>
          </div>
        </div>
      </section>

      {/* RUNTIME SECTION */}
      <div className="pt-6 border-t border-border space-y-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">Runtime</h3>
          <p className="text-xs text-muted-foreground">
            Providers currently active for this installation.
          </p>
        </div>
        <div className="space-y-2">
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
        </div>
      </div>

      {/* API DEFAULTS SECTION */}
      <div className="pt-6 border-t border-border space-y-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">API defaults</h3>
          <p className="text-xs text-muted-foreground">
            Limits applied to every private API response.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-3">
            <Label htmlFor="max-page-size" className="text-sm font-semibold">
              Maximum page size
            </Label>
            <Input
              id="max-page-size"
              type="number"
              min={1}
              max={500}
              value={maxPageSize}
              className="h-11 rounded-xl bg-card border-input"
              onChange={(event) =>
                setMaxPageSize(Number(event.target.value) || 200)
              }
            />
          </div>
          <div className="grid gap-3">
            <Label className="text-sm font-semibold">Roles</Label>
            <label className="flex h-11 items-center gap-3 rounded-xl border border-input bg-card px-4 text-sm cursor-pointer transition-colors hover:border-foreground/30">
              <input
                type="checkbox"
                className="size-5 accent-foreground rounded"
                checked={seedMemberRole}
                onChange={(event) => setSeedMemberRole(event.target.checked)}
              />
              <span className="font-semibold text-foreground">Keep the Member role</span>
            </label>
          </div>
        </div>
      </div>

      <Notice icon={AlertTriangle}>
        SQLite and built-in accounts stay active in this build. Provider changes
        are handled in Eterc Desktop.
      </Notice>
    </div>
  );
}
