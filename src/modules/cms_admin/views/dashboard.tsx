"use client";

import Link from "next/link";
import {
  ArrowRight,
  Braces,
  Database,
  KeyRound,
  Plus,
  ShieldCheck,
  Sparkles,
  Table2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EtViewProps } from "@/engine/views-registry";
import type { CmsCollectionWithFields } from "@/modules/cms/cms-types";
import { PageHeader } from "./ui";

export default function CmsDashboard({ data }: EtViewProps) {
  const collections = (data.collections ?? []) as CmsCollectionWithFields[];

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Content overview"
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

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Collections</CardTitle>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/data">
                Manage <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {collections.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center">
                <Button asChild variant="outline">
                  <Link href="/admin/data">
                    <Plus className="size-4" />
                    Create a collection
                  </Link>
                </Button>
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
                </Link>
              ))
            )}
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
  );
}
