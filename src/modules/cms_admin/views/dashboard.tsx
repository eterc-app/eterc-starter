"use client";

import Link from "next/link";
import {
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
import { PageActionsPortal } from "@/components/app/PageActionsSlot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { EtViewProps } from "@/engine/views-registry";
import type { CmsCollectionWithFields } from "@/modules/cms/cms-types";
import { ContentSidebar } from "./ContentSidebar";
import { EmptyState } from "./ui";

export default function CmsDashboard({ data }: EtViewProps) {
  const collections = (data.collections ?? []) as CmsCollectionWithFields[];

  return (
    <div className="app-page">
      <PageActionsPortal>
        <PageActions
          items={[
            {
              label: "Open Data Studio",
              icon: <Database className="size-4" />,
              href: "/admin/data",
              variant: "default",
            },
            {
              label: "Open Content",
              icon: <Layers className="size-4" />,
              href: "/admin/content",
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
      </PageActionsPortal>

      <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        <ContentSidebar
          collections={collections}
          createHref="/admin/data"
        />

        <section className="min-w-0 space-y-4">
          <div>
            <h2 className="text-base font-semibold">Collections</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose a collection to manage its records in Content.
            </p>
          </div>

          {collections.length === 0 ? (
            <EmptyState
              icon={<Table2 className="size-5" strokeWidth={1.75} />}
              title="No collections yet"
              description="Create your first collection in Data Studio to start modelling content."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button asChild>
                    <Link href="/admin/data">
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
            <div className="space-y-2">
              {collections.map((collection) => (
                <Link
                  key={collection.name}
                  href={`/admin/content?collection=${encodeURIComponent(collection.name)}`}
                  className="group block"
                >
                  <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-transparent px-4 py-3 transition-colors hover:border-foreground/30 hover:bg-surface-subtle">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-surface-subtle text-muted-foreground">
                        <Table2 className="size-4" strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-foreground">
                            {collection.label || collection.name}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {collection.name}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {collection.item_count}{" "}
                        {collection.item_count === 1 ? "item" : "items"}
                      </span>
                      {collection.singleton ? (
                        <Badge variant="outline">Singleton</Badge>
                      ) : null}
                      {collection.hidden ? (
                        <Badge variant="outline">Hidden</Badge>
                      ) : null}
                      <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
