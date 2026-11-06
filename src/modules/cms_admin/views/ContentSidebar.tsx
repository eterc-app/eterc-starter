"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Folder,
  Plus,
  RefreshCw,
  Search,
  Table2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CmsCollectionWithFields } from "@/modules/cms/cms-types";

function get_collection_icon(name: string) {
  if (name.includes("user") || name.includes("member")) {
    return "users";
  }
  if (name.includes("class") || name.includes("student") || name.includes("exam")) {
    return "graduation-cap";
  }
  if (name.includes("setting") || name.includes("config")) {
    return "layers";
  }
  return "table-2";
}

export function ContentSidebar({
  collections,
  activeName,
  onSelect,
  onCreate,
  createHref,
  onRefresh,
  busy = false,
  className,
}: {
  collections: CmsCollectionWithFields[];
  activeName?: string | null;
  onSelect?: (name: string) => void;
  onCreate?: () => void;
  createHref?: string;
  onRefresh?: () => void;
  busy?: boolean;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(true);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return collections;
    return collections.filter((collection) =>
      `${collection.label} ${collection.name}`.toLowerCase().includes(needle),
    );
  }, [collections, query]);

  const create_action = onCreate ? (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="w-full justify-start rounded-lg"
      onClick={onCreate}
    >
      <Plus className="size-3.5" />
      New collection
    </Button>
  ) : createHref ? (
    <Button asChild variant="outline" size="sm" className="w-full justify-start rounded-lg">
      <Link href={createHref}>
        <Plus className="size-3.5" />
        New collection
      </Link>
    </Button>
  ) : null;

  return (
    <aside className={cn("min-w-0 lg:self-start", className)}>
      <div className="overflow-hidden rounded-2xl border border-border lg:border-none lg:bg-transparent lg:sticky lg:top-6">
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-3 text-left lg:hidden"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
        >
          <Table2 className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
          <span className="min-w-0 flex-1 text-sm font-semibold">Collections</span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {collections.length}
          </span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              mobileOpen && "rotate-180",
            )}
            strokeWidth={1.75}
          />
        </button>

        <div
          className={cn(
            "border-t border-border lg:border-t-0",
            mobileOpen ? "block" : "hidden lg:block",
          )}
        >
          <div className="px-3 py-3">
            <div className="hidden items-center justify-between gap-2 lg:flex">
              <p className="type-headline">Collections</p>
              <span className="text-xs tabular-nums text-muted-foreground">
                {collections.length}
              </span>
            </div>
            <div className="relative lg:mt-3">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                strokeWidth={1.75}
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search collections"
                aria-label="Search collections"
                className="h-10 pl-9 rounded-lg"
              />
            </div>
          </div>

          <nav
            className="app-scrollbar max-h-[min(56vh,520px)] overflow-y-auto border-t border-border p-2"
            aria-label="Collections"
          >
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                {collections.length === 0
                  ? "No collections yet."
                  : "No collections match."}
              </p>
            ) : (
              <div>
                <button
                  type="button"
                  onClick={() => setGroupOpen((o) => !o)}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  <Folder className="size-3.5" />
                  <span className="flex-1 text-left">V1</span>
                  <ChevronDown
                    className={cn(
                      "size-3.5 transition-transform",
                      !groupOpen && "-rotate-90",
                    )}
                  />
                </button>

                {groupOpen ? (
                  <div className="mt-1 space-y-1 pl-2">
                    {filtered.map((collection) => {
                      const active = collection.name === activeName;
                      const content = (
                        <>
                          <span className="grid size-7 shrink-0 place-items-center rounded-md border border-border bg-surface-subtle text-muted-foreground">
                            <DynamicIcon
                              name={collection.icon || get_collection_icon(collection.name)}
                              color={collection.color || undefined}
                              className="size-3.5"
                              strokeWidth={1.75}
                            />
                          </span>
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {collection.label || collection.name}
                          </span>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {collection.item_count}
                          </span>
                        </>
                      );
                      const rowClass = cn(
                        "flex h-10 w-full items-center gap-2.5 rounded-lg px-2 text-left text-sm transition-colors",
                        active
                          ? "bg-muted font-semibold text-foreground"
                          : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                      );

                      return onSelect ? (
                        <button
                          key={collection.name}
                          type="button"
                          title={`${collection.label || collection.name} (${collection.name})`}
                          aria-current={active ? "page" : undefined}
                          className={rowClass}
                          onClick={() => {
                            setMobileOpen(false);
                            onSelect(collection.name);
                          }}
                        >
                          {content}
                        </button>
                      ) : (
                        <Link
                          key={collection.name}
                          href={`/admin/data?collection=${encodeURIComponent(collection.name)}`}
                          title={`${collection.label || collection.name} (${collection.name})`}
                          className={rowClass}
                        >
                          {content}
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            )}
          </nav>

          {create_action || onRefresh ? (
            <div className="space-y-1 border-t border-border p-2">
              {create_action}
              {onRefresh ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start rounded-lg"
                  onClick={onRefresh}
                  disabled={busy}
                >
                  <RefreshCw className={cn("size-3.5", busy && "animate-spin")} />
                  Refresh schema
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
