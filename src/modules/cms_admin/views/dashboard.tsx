"use client";

import Link from "next/link";
import {
  ArrowRight,
  Braces,
  Database,
  FileText,
  KeyRound,
  Plus,
  ShieldCheck,
  Sparkles,
  Table2,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EtViewProps } from "@/engine/views-registry";
import type {
  CmsApiKey,
  CmsCollectionWithFields,
  CmsRole,
  CmsRuntimeConfig,
  CmsUserSummary,
} from "@/modules/cms/cms-types";
import { PageHeader } from "./ui";

function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <span className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 text-2xl font-semibold leading-none">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CmsDashboard({ data }: EtViewProps) {
  const collections = (data.collections ?? []) as CmsCollectionWithFields[];
  const roles = (data.roles ?? []) as CmsRole[];
  const users = (data.users ?? []) as CmsUserSummary[];
  const keys = (data.keys ?? []) as CmsApiKey[];
  const runtime = data.runtime as CmsRuntimeConfig | undefined;
  const totalRecords = Number(data.totalRecords ?? 0);
  const apiBase = String(data.apiBase ?? "/api/v1/cms");

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-6 p-4 sm:p-6">
      <PageHeader
        eyebrow="Content service"
        title="Content overview"
        description="Your project is API-first. Create collections, manage records, issue API keys and decide which roles can use the app or the API."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/api-reference" target="_blank">
                <Braces className="size-4" />
                API reference
              </Link>
            </Button>
            <Button asChild>
              <Link href="/admin/data">
                <Database className="size-4" />
                Open Data Studio
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Collections"
          value={collections.length}
          hint="Database tables with CMS metadata"
          icon={<Table2 className="size-4" />}
        />
        <Stat
          label="Records"
          value={totalRecords}
          hint="Across every collection"
          icon={<FileText className="size-4" />}
        />
        <Stat
          label="Roles"
          value={roles.length}
          hint={`${users.length} user${users.length === 1 ? "" : "s"} assigned`}
          icon={<Users className="size-4" />}
        />
        <Stat
          label="API keys"
          value={keys.filter((key) => key.active).length}
          hint={`${keys.length} issued in total`}
          icon={<KeyRound className="size-4" />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Collections</CardTitle>
              <CardDescription>Tables available to the content API.</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/data">
                Manage <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {collections.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No collections yet. Open Data Studio to create one.
              </div>
            ) : (
              collections.slice(0, 8).map((collection) => (
                <Link
                  key={collection.name}
                  href={`/admin/data?collection=${encodeURIComponent(collection.name)}`}
                  className="flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/40"
                >
                  <span className="grid size-8 place-items-center rounded-md bg-muted text-muted-foreground">
                    <Table2 className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {collection.label || collection.name}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">
                      {collection.name}
                    </span>
                  </span>
                  <Badge variant="secondary">{collection.item_count} rows</Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-4" />
                Private by default
              </CardTitle>
              <CardDescription>
                Every content endpoint requires a session token or an API key. Roles decide what
                each caller can read or write.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Database</span>
                <span className="font-medium">{runtime?.database.label ?? "SQLite"}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Auth</span>
                <span className="font-medium">{runtime?.auth.label ?? "Built-in accounts"}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">API policy</span>
                <Badge variant="secondary">Authentication required</Badge>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  API base
                </p>
                <p className="mt-1 break-all font-mono text-xs">{apiBase}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-4" />
                Quick actions
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Button asChild variant="outline" className="justify-start">
                <Link href="/admin/data">
                  <Plus className="size-4" />
                  Create a collection
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-start">
                <Link href="/admin/access">
                  <KeyRound className="size-4" />
                  Issue an API key
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-start">
                <Link href="/admin/settings">
                  <ShieldCheck className="size-4" />
                  Review project settings
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-start">
                <Link href="/administrators/manage">
                  <Users className="size-4" />
                  Manage users
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
