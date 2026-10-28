"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  Braces,
  Database,
  KeyRound,
  Plus,
  ShieldCheck,
  Table2,
  Users,
} from "lucide-react";
import { PageActions } from "@/components/app/PageActions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { EtViewProps } from "@/engine/views-registry";
import type { CmsCollectionWithFields } from "@/modules/cms/cms-types";
import { ContentSidebar } from "./ContentSidebar";
import { EmptyState, PageHeader } from "./ui";

export default function CmsDashboard({ data }: EtViewProps) {
  const collections = (data.collections ?? []) as CmsCollectionWithFields[];

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

      <div className="grid gap-6 lg:grid-cols-[248px_minmax(0,1fr)]">
        <ContentSidebar
          collections={collections}
          createHref="/admin/data?new=1"
        />

        <section className="min-w-0 space-y-4">
          <div>
            <h2 className="text-base font-semibold">Collections</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose a collection to manage its records.
            </p>
          </div>

          {collections.length === 0 ? (
            <EmptyState
              icon={<Table2 className="size-5" strokeWidth={1.75} />}
              title="No collections yet"
              description="Create your first collection to start modelling content."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button asChild>
                    <Link href="/admin/data?new=1">
                      <Plus className="size-4" />
                      Create a collection
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/admin/data">Open Data Studio</Link>
                  </Button>
                </div>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {collections.map((collection) => (
                <Link
                  key={collection.name}
                  href={`/admin/data?collection=${encodeURIComponent(collection.name)}`}
                  className="group block"
                >
                  <Card className="h-full transition-colors group-hover:bg-surface-subtle">
                    <CardContent className="flex items-start gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-surface-subtle text-muted-foreground">
                        <Table2 className="size-4" strokeWidth={1.75} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {collection.label || collection.name}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
                          {collection.name}
                        </span>
                        <span className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="tabular-nums">
                            {collection.item_count}{" "}
                            {collection.item_count === 1 ? "item" : "items"}
                          </span>
                          {collection.singleton ? (
                            <Badge variant="outline">Singleton</Badge>
                          ) : null}
                          {collection.hidden ? (
                            <Badge variant="outline">Hidden</Badge>
                          ) : null}
                        </span>
                      </span>
                      <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
