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
import { PageActions } from "@/components/app/PageActions";
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
          <PageActions
            items={[
              {
                label: "Open Data Studio",
                icon: <Database className="size-4" />,
                href: "/admin/data",
                variant: "default",
              },
              {
                label: "API reference",
                icon: <Braces className="size-4" />,
                href: "/api-reference",
                external: true,
              },
              {
                label: "Create a collection",
                icon: <Plus className="size-4" />,
                href: "/admin/data",
              },
              {
                label: "Issue an API key",
                icon: <KeyRound className="size-4" />,
                href: "/admin/access",
              },
              {
                label: "Review project settings",
                icon: <ShieldCheck className="size-4" />,
                href: "/admin/settings",
              },
              {
                label: "Manage users",
                icon: <Users className="size-4" />,
                href: "/administrators/manage",
              },
            ]}
          />
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

      <div className="grid gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
            <CardTitle>Collections</CardTitle>
            <Button
              asChild
              variant="outline"
              size="icon-sm"
              aria-label="Manage collections"
              title="Manage collections"
            >
              <Link href="/admin/data">
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
      </div>
    </div>
  );
}
