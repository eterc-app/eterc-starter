"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Copy,
  Database,
  ExternalLink,
  FileJson2,
  KeyRound,
  Layers,
  Lock,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Terminal,
  Tv,
  X,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ScalarReference } from "./ScalarReference";
import type { OpenApiDocument } from "@/engine/api";
import type { CmsPermission, CmsApiKey } from "@/modules/cms/cms-types";

export interface WorkbenchField {
  name: string;
  label: string;
  type: string;
  interface?: string;
  required: boolean;
  unique: boolean;
  hidden: boolean;
  readonly: boolean;
}

export interface WorkbenchCollection {
  id: number;
  name: string;
  label: string;
  icon: string;
  primary_key: string;
  singleton: boolean;
  hidden: boolean;
  system: boolean;
  item_count: number;
  hasUiRoute: boolean;
  uiRoutePath: string | null;
  adminDataPath: string;
  fields: WorkbenchField[];
}

export interface WorkbenchRole {
  id: number;
  name: string;
  admin_access: boolean;
  app_access: boolean;
  user_count: number;
}

export interface ApiWorkbenchProps {
  collections: WorkbenchCollection[];
  roles: WorkbenchRole[];
  permissions: Record<number, CmsPermission[]>;
  apiKeys: CmsApiKey[];
  openapiDocument: OpenApiDocument;
}

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";
type AuthMode = "session" | "key" | "anonymous";
type SystemEndpoint = "sys-health" | "sys-me" | "sys-modules" | "cms-health" | "cms-me";

const SYSTEM_ENDPOINTS: Array<{
  id: SystemEndpoint;
  name: string;
  path: string;
  method: "GET";
  description: string;
  authRequired: boolean;
}> = [
  {
    id: "cms-health",
    name: "CMS Health",
    path: "/api/v1/cms/health",
    method: "GET",
    description: "Verify CMS service status & authentication identity.",
    authRequired: false,
  },
  {
    id: "cms-me",
    name: "Current Principal",
    path: "/api/v1/cms/me",
    method: "GET",
    description: "Check authenticated user, active role, and effective permissions.",
    authRequired: true,
  },
  {
    id: "sys-health",
    name: "System Health",
    path: "/api/v1/system/health",
    method: "GET",
    description: "Confirm Next.js runtime, environment, and version.",
    authRequired: false,
  },
  {
    id: "sys-me",
    name: "Admin Identity",
    path: "/api/v1/system/me",
    method: "GET",
    description: "Current administrator profile for control session.",
    authRequired: true,
  },
  {
    id: "sys-modules",
    name: "Modules List",
    path: "/api/v1/system/modules",
    method: "GET",
    description: "List of installed framework modules in this project.",
    authRequired: true,
  },
];

function generateSamplePayload(fields: WorkbenchField[], primaryKey: string): string {
  const sample: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.name === primaryKey) continue;
    if (field.readonly || field.hidden) continue;

    switch (field.type) {
      case "integer":
      case "decimal":
        sample[field.name] = 1;
        break;
      case "boolean":
        sample[field.name] = true;
        break;
      case "json":
        sample[field.name] = { key: "value" };
        break;
      case "dateTime":
      case "timestamp":
        sample[field.name] = new Date().toISOString();
        break;
      default:
        sample[field.name] = `Sample ${field.label || field.name}`;
        break;
    }
  }
  return JSON.stringify(sample, null, 2);
}

export function ApiWorkbench({
  collections,
  roles,
  permissions,
  apiKeys,
  openapiDocument,
}: ApiWorkbenchProps) {
  const [activeTab, setActiveTab] = useState<"explorer" | "scalar">("explorer");
  const [search, setSearch] = useState("");
  const [selectedCollection, setSelectedCollection] = useState<string>(
    collections[0]?.name ?? "cms-health",
  );
  const [selectedSystem, setSelectedSystem] = useState<SystemEndpoint | null>(
    collections.length === 0 ? "cms-health" : null,
  );

  // Runner state
  const [method, setMethod] = useState<HttpMethod>("GET");
  const [useId, setUseId] = useState(false);
  const [recordId, setRecordId] = useState("1");
  const [limit, setLimit] = useState("10");
  const [page, setPage] = useState("1");
  const [sortField, setSortField] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [authMode, setAuthMode] = useState<AuthMode>("session");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [requestBody, setRequestBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  const [responseStatusText, setResponseStatusText] = useState("");
  const [responseDuration, setResponseDuration] = useState<number | null>(null);
  const [responseSize, setResponseSize] = useState<string | null>(null);
  const [responseData, setResponseData] = useState<string | null>(null);
  const [copiedResponse, setCopiedResponse] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);

  // Active collection
  const currentCollection = useMemo(
    () => collections.find((c) => c.name === selectedCollection),
    [collections, selectedCollection],
  );

  const currentSystem = useMemo(
    () => SYSTEM_ENDPOINTS.find((s) => s.id === selectedSystem),
    [selectedSystem],
  );

  // Filtered collections
  const filteredCollections = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return collections;
    return collections.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.label.toLowerCase().includes(q),
    );
  }, [collections, search]);

  const filteredSystem = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return SYSTEM_ENDPOINTS;
    return SYSTEM_ENDPOINTS.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.path.toLowerCase().includes(q),
    );
  }, [search]);

  // When selecting a collection
  const handleSelectCollection = useCallback(
    (name: string) => {
      setSelectedCollection(name);
      setSelectedSystem(null);
      setResponseStatus(null);
      setResponseData(null);
      const col = collections.find((c) => c.name === name);
      if (col) {
        setSortField(col.primary_key);
        setRequestBody(generateSamplePayload(col.fields, col.primary_key));
      }
    },
    [collections],
  );

  const handleSelectSystem = useCallback((endpoint: SystemEndpoint) => {
    setSelectedSystem(endpoint);
    setResponseStatus(null);
    setResponseData(null);
  }, []);

  // Compute effective path for current action
  const computedUrl = useMemo(() => {
    if (currentSystem) return currentSystem.path;
    if (!currentCollection) return "";
    let url = `/api/v1/cms/items/${currentCollection.name}`;
    if (useId && recordId.trim()) {
      url += `/${encodeURIComponent(recordId.trim())}`;
    } else if (method === "GET") {
      const params = new URLSearchParams();
      if (limit) params.set("limit", limit);
      if (page) params.set("page", page);
      if (sortField) params.set("sort", sortField);
      if (sortDir) params.set("direction", sortDir);
      const query = params.toString();
      if (query) url += `?${query}`;
    }
    return url;
  }, [currentSystem, currentCollection, useId, recordId, method, limit, page, sortField, sortDir]);

  // Execute API test request
  const handleSendRequest = async () => {
    setLoading(true);
    setResponseStatus(null);
    setResponseData(null);
    const start = performance.now();

    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
      };

      if ((method === "POST" || method === "PATCH") && !currentSystem) {
        headers["Content-Type"] = "application/json";
      }

      if (authMode === "key" && apiKeyInput.trim()) {
        headers["Authorization"] = `Bearer ${apiKeyInput.trim()}`;
      }

      const fetchOptions: RequestInit = {
        method: currentSystem ? currentSystem.method : method,
        headers,
        credentials: authMode === "session" ? "include" : "omit",
      };

      if ((method === "POST" || method === "PATCH") && !currentSystem && requestBody.trim()) {
        fetchOptions.body = requestBody.trim();
      }

      const res = await fetch(computedUrl, fetchOptions);
      const duration = Math.round(performance.now() - start);
      setResponseDuration(duration);
      setResponseStatus(res.status);
      setResponseStatusText(res.statusText || (res.ok ? "OK" : "Error"));

      const text = await res.text();
      setResponseSize(`${(new TextEncoder().encode(text).length / 1024).toFixed(1)} KB`);

      try {
        const parsed = JSON.parse(text);
        setResponseData(JSON.stringify(parsed, null, 2));
      } catch {
        setResponseData(text || "(Empty response body)");
      }
    } catch (err) {
      const duration = Math.round(performance.now() - start);
      setResponseDuration(duration);
      setResponseStatus(0);
      setResponseStatusText("Network Error");
      setResponseData(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, type: "path" | "response") => {
    void navigator.clipboard.writeText(text);
    if (type === "path") {
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    } else {
      setCopiedResponse(true);
      setTimeout(() => setCopiedResponse(false), 2000);
    }
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      {/* Top Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            CMS Admin
          </Link>
          <span aria-hidden="true" className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">API Explorer</span>
            <Badge variant="outline" className="text-xs">
              REST v1
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border bg-muted p-0.5">
            <button
              type="button"
              onClick={() => setActiveTab("explorer")}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                activeTab === "explorer"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              API Workbench
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("scalar")}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                activeTab === "scalar"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Scalar Docs
            </button>
          </div>

          <a
            href="/api/openapi"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <FileJson2 className="size-3.5" />
            OpenAPI JSON
          </a>
        </div>
      </header>

      {/* Main View */}
      {activeTab === "scalar" ? (
        <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          <ScalarReference document={openapiDocument} />
        </main>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[280px_1fr] lg:grid-cols-[300px_1fr]">
          {/* Left Sidebar */}
          <aside className="flex flex-col border-r border-border bg-card">
            {/* Search Input */}
            <div className="border-b border-border p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Filter collections & endpoints…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
                {search ? (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                ) : null}
              </div>
            </div>

            {/* Collections & Endpoints Navigation */}
            <div className="app-scrollbar flex-1 overflow-y-auto p-2 space-y-4">
              {/* Content Collections */}
              <div>
                <div className="flex items-center justify-between px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                  <span>Collections</span>
                  <span className="tabular-nums">{collections.length}</span>
                </div>
                <div className="space-y-0.5">
                  {filteredCollections.map((col) => {
                    const isSelected = selectedCollection === col.name && !selectedSystem;
                    return (
                      <button
                        key={col.name}
                        type="button"
                        onClick={() => handleSelectCollection(col.name)}
                        className={cn(
                          "group flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition-colors",
                          isSelected
                            ? "bg-secondary text-foreground font-semibold"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <Database className="size-3.5 shrink-0" />
                          <span className="truncate">{col.label || col.name}</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {col.hasUiRoute ? (
                            <span
                              title="UI Page active"
                              className="text-xs text-muted-foreground"
                            >
                              <Tv className="size-3" />
                            </span>
                          ) : null}
                          <span
                            title="Private collection"
                            className="text-xs text-muted-foreground"
                          >
                            <Lock className="size-3" />
                          </span>
                          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                            {col.item_count}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                  {filteredCollections.length === 0 ? (
                    <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                      No matching collections
                    </div>
                  ) : null}
                </div>
              </div>

              {/* System & Health Endpoints */}
              <div>
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                  System APIs
                </div>
                <div className="space-y-0.5">
                  {filteredSystem.map((sys) => {
                    const isSelected = selectedSystem === sys.id;
                    return (
                      <button
                        key={sys.id}
                        type="button"
                        onClick={() => handleSelectSystem(sys.id)}
                        className={cn(
                          "group flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition-colors",
                          isSelected
                            ? "bg-secondary text-foreground font-semibold"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <Zap className="size-3.5 shrink-0" />
                          <span className="truncate">{sys.name}</span>
                        </div>
                        <Badge variant="outline" className="text-xs font-mono">
                          {sys.method}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </aside>

          {/* Right Main Content */}
          <main className="app-scrollbar min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            {currentCollection && !currentSystem ? (
              <>
                {/* Collection Summary & Status Banner */}
                <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-foreground">
                        <Database className="size-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h1 className="text-base font-semibold">
                            {currentCollection.label || currentCollection.name}
                          </h1>
                          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                            {currentCollection.name}
                          </code>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Base endpoint:{" "}
                          <span className="font-mono text-foreground">
                            /api/v1/cms/items/{currentCollection.name}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1.5"
                        onClick={() =>
                          handleCopy(`/api/v1/cms/items/${currentCollection.name}`, "path")
                        }
                      >
                        {copiedPath ? <Check className="size-3" /> : <Copy className="size-3" />}
                        {copiedPath ? "Copied" : "Copy API Path"}
                      </Button>
                      <Button asChild size="sm" variant="outline" className="h-7 text-xs gap-1.5">
                        <Link href={currentCollection.adminDataPath}>
                          <ExternalLink className="size-3" />
                          Data Studio
                        </Link>
                      </Button>
                      {currentCollection.hasUiRoute && currentCollection.uiRoutePath ? (
                        <Button asChild size="sm" variant="outline" className="h-7 text-xs gap-1.5">
                          <Link href={currentCollection.uiRoutePath} target="_blank">
                            <Tv className="size-3" />
                            Frontend UI
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {/* Status Pills: Private vs Public, UI Interface, Auth Policy */}
                  <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                    {/* Security Pill */}
                    <Badge variant="outline" className="gap-1.5 py-1">
                      <Lock className="size-3 text-warning" />
                      <span className="font-semibold">Private Collection</span>
                    </Badge>

                    {/* UI Interface Indicator */}
                    {currentCollection.hasUiRoute ? (
                      <Badge variant="success" className="gap-1.5 py-1">
                        <Tv className="size-3" />
                        <span>UI Interface Active ({currentCollection.uiRoutePath})</span>
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1.5 py-1 text-muted-foreground">
                        <Layers className="size-3" />
                        <span>Headless (API & Data Studio)</span>
                      </Badge>
                    )}

                    {/* Primary Key */}
                    <Badge variant="secondary" className="gap-1.5 py-1">
                      <KeyRound className="size-3" />
                      <span>Primary Key: {currentCollection.primary_key}</span>
                    </Badge>

                    {/* Record Count */}
                    <Badge variant="secondary" className="gap-1.5 py-1">
                      <span>{currentCollection.item_count} records</span>
                    </Badge>
                  </div>
                </div>

                {/* Roles & Access Matrix */}
                <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="size-4 text-muted-foreground" />
                      <h2 className="text-sm font-semibold">Access Policy & Roles</h2>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Controls who can read and write to this collection
                    </span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {/* Admin Role */}
                    <div className="rounded-lg border border-border bg-surface-subtle p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold">Administrator</span>
                        <Badge variant="success" className="text-xs">
                          Full Access
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-1.5 text-xs">
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono">Read: ✓</span>
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono">Create: ✓</span>
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono">Update: ✓</span>
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono">Delete: ✓</span>
                      </div>
                    </div>

                    {/* Other Defined Roles */}
                    {roles
                      .filter((r) => !r.admin_access)
                      .map((role) => {
                        const rolePerms = permissions[role.id] ?? [];
                        const canRead = rolePerms.some(
                          (p) =>
                            (p.collection === currentCollection.name || p.collection === "*") &&
                            p.action === "read",
                        );
                        const canCreate = rolePerms.some(
                          (p) =>
                            (p.collection === currentCollection.name || p.collection === "*") &&
                            p.action === "create",
                        );
                        const canUpdate = rolePerms.some(
                          (p) =>
                            (p.collection === currentCollection.name || p.collection === "*") &&
                            p.action === "update",
                        );
                        const canDelete = rolePerms.some(
                          (p) =>
                            (p.collection === currentCollection.name || p.collection === "*") &&
                            p.action === "delete",
                        );

                        return (
                          <div
                            key={role.id}
                            className="rounded-lg border border-border bg-surface-subtle p-3 space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold">{role.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {role.user_count} users
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5 text-xs font-mono">
                              <span
                                className={cn(
                                  "rounded px-1.5 py-0.5",
                                  canRead
                                    ? "bg-success/10 text-success"
                                    : "bg-muted text-muted-foreground",
                                )}
                              >
                                Read: {canRead ? "✓" : "✗"}
                              </span>
                              <span
                                className={cn(
                                  "rounded px-1.5 py-0.5",
                                  canCreate
                                    ? "bg-success/10 text-success"
                                    : "bg-muted text-muted-foreground",
                                )}
                              >
                                Create: {canCreate ? "✓" : "✗"}
                              </span>
                              <span
                                className={cn(
                                  "rounded px-1.5 py-0.5",
                                  canUpdate
                                    ? "bg-success/10 text-success"
                                    : "bg-muted text-muted-foreground",
                                )}
                              >
                                Update: {canUpdate ? "✓" : "✗"}
                              </span>
                              <span
                                className={cn(
                                  "rounded px-1.5 py-0.5",
                                  canDelete
                                    ? "bg-success/10 text-success"
                                    : "bg-muted text-muted-foreground",
                                )}
                              >
                                Delete: {canDelete ? "✓" : "✗"}
                              </span>
                            </div>
                          </div>
                        );
                      })}

                    {/* Anonymous / Public */}
                    <div className="rounded-lg border border-border bg-surface-subtle p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold">Anonymous / Public</span>
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          Blocked
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-1.5 text-xs font-mono text-muted-foreground">
                        <span className="rounded bg-muted px-1.5 py-0.5">Read: ✗</span>
                        <span className="rounded bg-muted px-1.5 py-0.5">Create: ✗</span>
                        <span className="rounded bg-muted px-1.5 py-0.5">Update: ✗</span>
                        <span className="rounded bg-muted px-1.5 py-0.5">Delete: ✗</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Schema Fields Strip */}
                <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-semibold">Fields & Types</h2>
                    <span className="text-xs text-muted-foreground">
                      {currentCollection.fields.length} columns defined
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {currentCollection.fields.map((f) => (
                      <div
                        key={f.name}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-subtle px-2.5 py-1 text-xs"
                      >
                        <span className="font-mono font-medium text-foreground">{f.name}</span>
                        <span className="text-muted-foreground">({f.type})</span>
                        {f.name === currentCollection.primary_key ? (
                          <span className="rounded bg-foreground px-1 text-xs font-semibold text-background">
                            PK
                          </span>
                        ) : null}
                        {f.required ? (
                          <span className="text-xs text-destructive">*</span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Interactive API Workbench Runner */}
                <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Terminal className="size-4 text-muted-foreground" />
                      <h2 className="text-sm font-semibold">Test API Endpoint</h2>
                    </div>
                    {/* Method Selector */}
                    <div className="flex items-center gap-1">
                      {(["GET", "POST", "PATCH", "DELETE"] as HttpMethod[]).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            setMethod(m);
                            if (m === "POST") setUseId(false);
                            else if (m === "PATCH" || m === "DELETE") setUseId(true);
                          }}
                          className={cn(
                            "rounded-md px-2.5 py-1 font-mono text-xs font-semibold transition-colors",
                            method === m
                              ? "bg-foreground text-background"
                              : "bg-muted text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Target URL Preview & ID Toggle */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex min-w-0 flex-1 items-center rounded-lg border border-border bg-surface-subtle px-3 py-1.5 font-mono text-xs">
                      <span className="mr-2 font-semibold text-foreground">{method}</span>
                      <span className="truncate text-muted-foreground">{computedUrl}</span>
                    </div>

                    {method === "GET" ? (
                      <button
                        type="button"
                        onClick={() => setUseId(!useId)}
                        className={cn(
                          "rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium transition-colors",
                          useId ? "bg-secondary text-foreground" : "bg-card text-muted-foreground",
                        )}
                      >
                        {useId ? "Target: Single record" : "Target: List collection"}
                      </button>
                    ) : null}
                  </div>

                  {/* Options row: ID or Query params */}
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {useId || method === "PATCH" || method === "DELETE" ? (
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                          Record ID (:id)
                        </label>
                        <Input
                          type="text"
                          value={recordId}
                          onChange={(e) => setRecordId(e.target.value)}
                          placeholder="e.g. 1"
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                    ) : (
                      <>
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                            Limit
                          </label>
                          <Input
                            type="number"
                            value={limit}
                            onChange={(e) => setLimit(e.target.value)}
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                            Page
                          </label>
                          <Input
                            type="number"
                            value={page}
                            onChange={(e) => setPage(e.target.value)}
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                            Sort
                          </label>
                          <Input
                            type="text"
                            value={sortField}
                            onChange={(e) => setSortField(e.target.value)}
                            placeholder="column name"
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                            Direction
                          </label>
                          <select
                            value={sortDir}
                            onChange={(e) => setSortDir(e.target.value as "asc" | "desc")}
                            className="h-8 w-full rounded-lg border border-border bg-card px-2 text-xs font-mono text-foreground"
                          >
                            <option value="desc">desc</option>
                            <option value="asc">asc</option>
                          </select>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Auth Mode Selector */}
                  <div className="space-y-2 border-t border-border pt-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-muted-foreground">
                        Test Authentication
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setAuthMode("session")}
                          className={cn(
                            "rounded-md px-2 py-0.5 text-xs font-semibold transition-colors",
                            authMode === "session"
                              ? "bg-secondary text-foreground"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          Admin Session
                        </button>
                        <button
                          type="button"
                          onClick={() => setAuthMode("key")}
                          className={cn(
                            "rounded-md px-2 py-0.5 text-xs font-semibold transition-colors",
                            authMode === "key"
                              ? "bg-secondary text-foreground"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          API Key
                        </button>
                        <button
                          type="button"
                          onClick={() => setAuthMode("anonymous")}
                          className={cn(
                            "rounded-md px-2 py-0.5 text-xs font-semibold transition-colors",
                            authMode === "anonymous"
                              ? "bg-secondary text-foreground"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          Anonymous (Test 401/403)
                        </button>
                      </div>
                    </div>

                    {authMode === "key" ? (
                      <div className="flex gap-2">
                        <Input
                          type="text"
                          placeholder="Paste API Key (etk_...)"
                          value={apiKeyInput}
                          onChange={(e) => setApiKeyInput(e.target.value)}
                          className="h-8 text-xs font-mono"
                        />
                        {apiKeys.length > 0 ? (
                          <select
                            onChange={(e) => setApiKeyInput(e.target.value)}
                            className="h-8 rounded-lg border border-border bg-card px-2 text-xs font-mono text-foreground"
                          >
                            <option value="">Select active key…</option>
                            {apiKeys.map((k) => (
                              <option key={k.id} value={k.key_prefix}>
                                {k.name} ({k.key_prefix}…)
                              </option>
                            ))}
                          </select>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  {/* Body Editor for POST / PATCH */}
                  {method === "POST" || method === "PATCH" ? (
                    <div className="space-y-1.5 border-t border-border pt-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-muted-foreground">
                          Request JSON Body
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setRequestBody(
                              generateSamplePayload(
                                currentCollection.fields,
                                currentCollection.primary_key,
                              ),
                            )
                          }
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Reset to Schema Sample
                        </button>
                      </div>
                      <textarea
                        value={requestBody}
                        onChange={(e) => setRequestBody(e.target.value)}
                        rows={6}
                        className="app-scrollbar w-full rounded-lg border border-border bg-surface-subtle p-3 font-mono text-xs text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      />
                    </div>
                  ) : null}

                  {/* Submit Action */}
                  <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
                    <Button
                      size="sm"
                      onClick={() => void handleSendRequest()}
                      disabled={loading}
                      className="gap-2"
                    >
                      {loading ? (
                        <RefreshCw className="size-3.5 animate-spin" />
                      ) : (
                        <Play className="size-3.5 fill-current" />
                      )}
                      <span>Send Request</span>
                    </Button>
                  </div>

                  {/* Response Display */}
                  {responseStatus !== null ? (
                    <div className="rounded-lg border border-border bg-surface-subtle p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              responseStatus >= 200 && responseStatus < 300
                                ? "success"
                                : responseStatus >= 400 && responseStatus < 500
                                ? "warning"
                                : "destructive"
                            }
                            className="font-mono text-xs"
                          >
                            {responseStatus} {responseStatusText}
                          </Badge>
                          {responseDuration !== null ? (
                            <span className="text-xs text-muted-foreground">
                              {responseDuration} ms
                            </span>
                          ) : null}
                          {responseSize ? (
                            <span className="text-xs text-muted-foreground">{responseSize}</span>
                          ) : null}
                        </div>

                        {responseData ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-xs gap-1"
                            onClick={() => handleCopy(responseData, "response")}
                          >
                            {copiedResponse ? (
                              <Check className="size-3" />
                            ) : (
                              <Copy className="size-3" />
                            )}
                            {copiedResponse ? "Copied" : "Copy JSON"}
                          </Button>
                        ) : null}
                      </div>

                      <pre className="app-scrollbar max-h-80 overflow-auto rounded border border-border bg-card p-3 font-mono text-xs leading-5 text-foreground whitespace-pre-wrap">
                        {responseData}
                      </pre>
                    </div>
                  ) : null}
                </div>
              </>
            ) : currentSystem ? (
              /* System Endpoint View */
              <div className="space-y-6">
                <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h1 className="text-base font-semibold">{currentSystem.name}</h1>
                      <div className="font-mono text-xs text-muted-foreground">
                        {currentSystem.path}
                      </div>
                    </div>
                    <Badge variant="outline" className="font-mono text-xs">
                      {currentSystem.method}
                    </Badge>
                  </div>

                  <p className="text-xs text-muted-foreground">{currentSystem.description}</p>

                  <div className="flex items-center justify-between border-t border-border pt-3">
                    <Badge
                      variant={currentSystem.authRequired ? "warning" : "success"}
                      className="text-xs"
                    >
                      {currentSystem.authRequired
                        ? "Authentication required"
                        : "Publicly accessible"}
                    </Badge>

                    <Button
                      size="sm"
                      onClick={() => void handleSendRequest()}
                      disabled={loading}
                      className="gap-2"
                    >
                      {loading ? (
                        <RefreshCw className="size-3.5 animate-spin" />
                      ) : (
                        <Play className="size-3.5 fill-current" />
                      )}
                      <span>Test Endpoint</span>
                    </Button>
                  </div>

                  {responseStatus !== null ? (
                    <div className="rounded-lg border border-border bg-surface-subtle p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              responseStatus >= 200 && responseStatus < 300
                                ? "success"
                                : responseStatus >= 400 && responseStatus < 500
                                ? "warning"
                                : "destructive"
                            }
                            className="font-mono text-xs"
                          >
                            {responseStatus} {responseStatusText}
                          </Badge>
                          {responseDuration !== null ? (
                            <span className="text-xs text-muted-foreground">
                              {responseDuration} ms
                            </span>
                          ) : null}
                        </div>
                        {responseData ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-xs gap-1"
                            onClick={() => handleCopy(responseData, "response")}
                          >
                            {copiedResponse ? (
                              <Check className="size-3" />
                            ) : (
                              <Copy className="size-3" />
                            )}
                            {copiedResponse ? "Copied" : "Copy JSON"}
                          </Button>
                        ) : null}
                      </div>

                      <pre className="app-scrollbar max-h-80 overflow-auto rounded border border-border bg-card p-3 font-mono text-xs leading-5 text-foreground whitespace-pre-wrap">
                        {responseData}
                      </pre>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </main>
        </div>
      )}
    </div>
  );
}
