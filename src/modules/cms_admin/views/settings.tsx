"use client";

import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileCode2,
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
import { Textarea } from "@/components/ui/textarea";
import type { EtViewProps } from "@/engine/views-registry";
import type {
  CmsProviderDefinition,
  CmsRuntimeConfig,
} from "@/modules/cms/cms-types";
import { BusyButton, CopyButton, PageHeader, cms_call } from "./ui";

interface ProviderCatalog {
  databases: CmsProviderDefinition[];
  auth: CmsProviderDefinition[];
}

function provider_by_id(
  providers: CmsProviderDefinition[],
  id: string
): CmsProviderDefinition {
  return providers.find((provider) => provider.id === id) ?? providers[0];
}

function values_for(
  provider: CmsProviderDefinition,
  values: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const field of provider.fields) {
    result[field.key] = values[field.key] ?? "";
  }
  return result;
}

function StatusPill({
  status,
  message,
}: {
  status?: string;
  message?: string;
}) {
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
      {message ? "Not verified" : "Not configured"}
    </span>
  );
}

function ProviderGrid({
  providers,
  selected,
  onSelect,
}: {
  providers: CmsProviderDefinition[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {providers.map((provider) => {
        const active = provider.id === selected;
        return (
          <button
            key={provider.id}
            type="button"
            onClick={() => onSelect(provider.id)}
            className={`rounded-lg border p-3 text-left transition-colors ${
              active
                ? "border-foreground/25 bg-muted/50 ring-1 ring-foreground/10"
                : "hover:bg-muted/30"
            }`}
          >
            <span className="text-sm font-medium">{provider.name}</span>
          </button>
        );
      })}
    </div>
  );
}

function ProviderFields({
  provider,
  values,
  onChange,
}: {
  provider: CmsProviderDefinition;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  if (provider.fields.length === 0) return null;
  return (
    <div className="space-y-3">
      {provider.fields.map((field) => (
        <div key={field.key} className="space-y-1.5">
          <Label htmlFor={`provider-${provider.id}-${field.key}`}>
            {field.label}
            {field.required ? <span className="ml-1 text-destructive">*</span> : null}
          </Label>
          {field.key.toLowerCase().includes("json") ? (
            <Textarea
              id={`provider-${provider.id}-${field.key}`}
              value={values[field.key] ?? ""}
              rows={5}
              placeholder={field.placeholder}
              className="font-mono text-xs"
              onChange={(event) => onChange(field.key, event.target.value)}
            />
          ) : (
            <Input
              id={`provider-${provider.id}-${field.key}`}
              type={field.secret ? "password" : "text"}
              value={values[field.key] ?? ""}
              placeholder={
                values[field.key] === "__stored__"
                  ? "Stored secret — leave unchanged to keep it"
                  : field.placeholder
              }
              onChange={(event) => onChange(field.key, event.target.value)}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default function ProjectSettings({ data }: EtViewProps) {
  const initialRuntime = data.runtime as CmsRuntimeConfig;
  const initialProviders = data.providers as ProviderCatalog;
  const [runtime, setRuntime] = useState<CmsRuntimeConfig>(initialRuntime);
  const [providers] = useState<ProviderCatalog>(initialProviders);
  const [databaseProviderId, setDatabaseProviderId] = useState(initialRuntime.database.provider);
  const [authProviderId, setAuthProviderId] = useState(initialRuntime.auth.provider);
  const [databaseValues, setDatabaseValues] = useState<Record<string, string>>(
    values_for(
      provider_by_id(initialProviders.databases, initialRuntime.database.provider),
      initialRuntime.database.values
    )
  );
  const [authValues, setAuthValues] = useState<Record<string, string>>(
    values_for(
      provider_by_id(initialProviders.auth, initialRuntime.auth.provider),
      initialRuntime.auth.values
    )
  );
  const [maxPageSize, setMaxPageSize] = useState(initialRuntime.cms.max_page_size);
  const [seedMemberRole, setSeedMemberRole] = useState(initialRuntime.cms.seed_member_role);
  const [databaseStatus, setDatabaseStatus] = useState(initialRuntime.database.status);
  const [databaseMessage, setDatabaseMessage] = useState(initialRuntime.database.message ?? "");
  const [authStatus, setAuthStatus] = useState(initialRuntime.auth.status);
  const [authMessage, setAuthMessage] = useState(initialRuntime.auth.message ?? "");
  const [envPreview, setEnvPreview] = useState<Record<string, string>>(
    (data.envPreview as Record<string, string>) ?? {}
  );
  const [allowEnvWrite] = useState(Boolean(data.allowEnvWrite));
  const [testingDatabase, setTestingDatabase] = useState(false);
  const [testingAuth, setTestingAuth] = useState(false);
  const [saving, setSaving] = useState(false);
  const [writingEnv, setWritingEnv] = useState(false);
  const [utilityBusy, setUtilityBusy] = useState(false);

  const databaseProvider = useMemo(
    () => provider_by_id(providers.databases, databaseProviderId),
    [databaseProviderId, providers.databases]
  );
  const authProvider = useMemo(
    () => provider_by_id(providers.auth, authProviderId),
    [authProviderId, providers.auth]
  );

  const selectDatabase = useCallback(
    (id: string) => {
      setDatabaseProviderId(id);
      const provider = provider_by_id(providers.databases, id);
      const values =
        id === runtime.database.provider
          ? runtime.database.values
          : ({} as Record<string, string>);
      setDatabaseValues(values_for(provider, values));
      setDatabaseStatus("unconfigured");
      setDatabaseMessage("Not verified");
    },
    [providers.databases, runtime.database]
  );

  const selectAuth = useCallback(
    (id: string) => {
      setAuthProviderId(id);
      const provider = provider_by_id(providers.auth, id);
      const values =
        id === runtime.auth.provider ? runtime.auth.values : ({} as Record<string, string>);
      setAuthValues(values_for(provider, values));
      setAuthStatus("unconfigured");
      setAuthMessage("Not verified");
    },
    [providers.auth, runtime.auth]
  );

  const testDatabase = useCallback(async () => {
    setTestingDatabase(true);
    try {
      const result = await cms_call<{ ok: boolean; message: string; details?: Record<string, string> }>(
        "settings_test",
        { kind: "database", provider: databaseProviderId, values: databaseValues }
      );
      setDatabaseStatus(result.ok ? "verified" : "error");
      setDatabaseMessage(result.message);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connection test failed.";
      setDatabaseStatus("error");
      setDatabaseMessage(message);
      toast.error(message);
    } finally {
      setTestingDatabase(false);
    }
  }, [databaseProviderId, databaseValues]);

  const testAuth = useCallback(async () => {
    setTestingAuth(true);
    try {
      const result = await cms_call<{ ok: boolean; message: string }>("settings_test", {
        kind: "auth",
        provider: authProviderId,
        values: authValues,
      });
      setAuthStatus(result.ok ? "verified" : "error");
      setAuthMessage(result.message);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Auth test failed.";
      setAuthStatus("error");
      setAuthMessage(message);
      toast.error(message);
    } finally {
      setTestingAuth(false);
    }
  }, [authProviderId, authValues]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const result = await cms_call<{ runtime: CmsRuntimeConfig; envPreview: Record<string, string> }>(
        "settings_save",
        {
          database: {
            provider: databaseProviderId,
            values: databaseValues,
            status: databaseStatus,
            message: databaseMessage,
            verified_at:
              databaseStatus === "verified" ? Math.floor(Date.now() / 1000) : null,
          },
          auth: {
            provider: authProviderId,
            values: authValues,
            status: authStatus,
            message: authMessage,
            verified_at: authStatus === "verified" ? Math.floor(Date.now() / 1000) : null,
          },
          cms: {
            max_page_size: maxPageSize,
            seed_member_role: seedMemberRole,
          },
        }
      );
      setRuntime(result.runtime);
      setEnvPreview(result.envPreview);
      toast.success("Project settings saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }, [
    authMessage,
    authProviderId,
    authStatus,
    authValues,
    databaseMessage,
    databaseProviderId,
    databaseStatus,
    databaseValues,
    maxPageSize,
    seedMemberRole,
  ]);

  const writeEnv = useCallback(async () => {
    setWritingEnv(true);
    try {
      await cms_call("settings_write_env");
      toast.success(".env updated. Restart the dev server to apply changes.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not write .env.");
    } finally {
      setWritingEnv(false);
    }
  }, []);

  const createStarter = useCallback(async () => {
    setUtilityBusy(true);
    try {
      await cms_call("settings_bootstrap");
      toast.success("Starter Posts collection is ready.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the starter collection.");
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
      toast.error(error instanceof Error ? error.message : "Could not refresh the schema.");
    } finally {
      setUtilityBusy(false);
    }
  }, []);

  const envText = useMemo(
    () =>
      Object.entries(envPreview)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n"),
    [envPreview]
  );

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
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Database className="size-4" />
                Database
              </CardTitle>
            </div>
            <StatusPill status={databaseStatus} message={databaseMessage} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ProviderGrid
            providers={providers.databases}
            selected={databaseProviderId}
            onSelect={selectDatabase}
          />
          <div className="space-y-3">
            <ProviderFields
              provider={databaseProvider}
              values={databaseValues}
              onChange={(key, value) => {
                setDatabaseValues((values) => ({ ...values, [key]: value }));
                setDatabaseStatus("unconfigured");
                setDatabaseMessage("Not verified");
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <BusyButton
                type="button"
                variant="outline"
                busy={testingDatabase}
                onClick={testDatabase}
              >
                {testingDatabase ? null : <RefreshCw className="size-4" />}
                Test connection
              </BusyButton>
              {databaseMessage ? (
                <p className="text-xs text-muted-foreground">{databaseMessage}</p>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="size-4" />
                Authentication
              </CardTitle>
            </div>
            <StatusPill status={authStatus} message={authMessage} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ProviderGrid
            providers={providers.auth}
            selected={authProviderId}
            onSelect={selectAuth}
          />
          <div className="space-y-3">
            <ProviderFields
              provider={authProvider}
              values={authValues}
              onChange={(key, value) => {
                setAuthValues((values) => ({ ...values, [key]: value }));
                setAuthStatus("unconfigured");
                setAuthMessage("Not verified");
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <BusyButton type="button" variant="outline" busy={testingAuth} onClick={testAuth}>
                {testingAuth ? null : <RefreshCw className="size-4" />}
                Test provider
              </BusyButton>
              {authMessage ? (
                <p className="text-xs text-muted-foreground">{authMessage}</p>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
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
                onChange={(event) => setMaxPageSize(Number(event.target.value) || 200)}
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
            <CardTitle className="flex items-center gap-2">
              <FileCode2 className="size-4" />
              Environment preview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <pre className="max-h-72 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-[11px] leading-5">
              {envText || "No environment variables yet."}
            </pre>
            <div className="flex flex-wrap gap-2">
              <CopyButton value={envText} label="Copy .env" />
              {allowEnvWrite ? (
                <BusyButton
                  type="button"
                  variant="outline"
                  busy={writingEnv}
                  onClick={writeEnv}
                >
                  <ClipboardCheck className="size-4" />
                  Write .env
                </BusyButton>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4" />
            Utilities
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <BusyButton type="button" variant="outline" busy={utilityBusy} onClick={createStarter}>
            <Sparkles className="size-4" />
            Create starter Posts collection
          </BusyButton>
          <BusyButton type="button" variant="outline" busy={utilityBusy} onClick={refreshSchema}>
            <RefreshCw className="size-4" />
            Refresh schema
          </BusyButton>
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p>SQLite and built-in accounts stay active in this build.</p>
      </div>
    </div>
  );
}
