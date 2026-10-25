"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Braces,
  Database,
  KeyRound,
  Layers,
  Plus,
  ShieldCheck,
  Table2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EtViewProps } from "@/engine/views-registry";
import type { CmsCollectionWithFields } from "@/modules/cms/cms-types";
import { EmptyState, PageHeader } from "./ui";

export default function CmsDashboard({ data }: EtViewProps) {
  const collections = (data.collections ?? []) as CmsCollectionWithFields[];
  const fieldCount = collections.reduce(
    (total, collection) => total + (collection.fields?.length ?? 0),
    0
  );

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Workspace"
        title="Content overview"
        description="Manage collections, media, and access from one private workspace."
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

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 py-1">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
              <Table2 className="size-4" strokeWidth={1.75} />
            </span>
            <span>
              <span className="block text-xs text-muted-foreground">
                Collections
              </span>
              <span className="type-title mt-0.5 block">
                {collections.length}
              </span>
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-1">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
              <Layers className="size-4" strokeWidth={1.75} />
            </span>
            <span>
              <span className="block text-xs text-muted-foreground">
                Fields
              </span>
              <span className="type-title mt-0.5 block">{fieldCount}</span>
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-1">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
              <ShieldCheck className="size-4" strokeWidth={1.75} />
            </span>
            <span>
              <span className="block text-xs text-muted-foreground">
                API mode
              </span>
              <span className="mt-0.5 block text-sm font-semibold">
                Private by default
              </span>
            </span>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
            <CardTitle>Collections</CardTitle>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/data">
                Manage
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {collections.length === 0 ? (
              <EmptyState
                icon={<Table2 className="size-5" strokeWidth={1.75} />}
                title="No collections yet"
                description="Create your first collection to start modelling content."
                action={
                  <Button asChild variant="outline">
                    <Link href="/admin/data">
                      <Plus className="size-4" />
                      Create a collection
                    </Link>
                  </Button>
                }
              />
            ) : (
              <div className="space-y-2">
                {collections.slice(0, 8).map((collection) => (
                  <Link
                    key={collection.name}
                    href={`/admin/data?collection=${encodeURIComponent(collection.name)}`}
                    className="group flex items-center gap-3 rounded-lg border border-border px-3 py-3 transition-colors hover:bg-surface-subtle"
                  >
                    <span className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground">
                      <Table2 className="size-4" strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {collection.label || collection.name}
                      </span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {collection.name}
                      </span>
                    </span>
                    <span className="hidden text-xs text-muted-foreground sm:block">
                      {collection.fields?.length ?? 0} fields
                    </span>
                    <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
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
  );
}
