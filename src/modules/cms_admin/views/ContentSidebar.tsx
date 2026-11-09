"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Folder,
  Plus,
  RefreshCw,
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
  layout = "page",
  className,
}: {
  collections: CmsCollectionWithFields[];
  activeName?: string | null;
  onSelect?: (name: string) => void;
  onCreate?: () => void;
  createHref?: string;
  onRefresh?: () => void;
  busy?: boolean;
  layout?: "page" | "navigation";
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(true);
  const navigationLayout = layout === "navigation";

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
    <aside
      className={cn(
        navigationLayout
          ? "flex min-h-0 flex-1 flex-col"
          : "min-w-0 lg:self-start",
        className,
      )}
    >
      <div
        className={cn(
          "overflow-hidden rounded-xl border border-border bg-card lg:sticky lg:top-6",
          navigationLayout &&
            "flex min-h-0 flex-1 flex-col rounded-none border-0 bg-transparent lg:static",
        )}
      >
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2 px-3 py-3 text-left lg:hidden",
            navigationLayout && "hidden",
          )}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
        >
          <Table2 className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
          <span className="min-w-0 flex-1 text-sm font-semibold">Collections</span>
          <span className="rounded-full bg-surface-subtle px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
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
            navigationLayout
              ? "flex min-h-0 flex-1 flex-col"
              : mobileOpen
                ? "block"
                : "hidden lg:block",
          )}
        >
          <div className="px-3 py-3">
            {!navigationLayout ? (
              <div className="hidden items-center justify-between gap-2 lg:flex">
                <p className="type-headline">Collections</p>
                <span className="rounded-full bg-surface-subtle px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                  {collections.length}
                </span>
              </div>
            ) : null}
            <div className="lg:mt-3">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                aria-label="Search collections"
                className="h-10 rounded-lg"
              />
            </div>
          </div>

          <nav
            className={cn(
              "app-scrollbar max-h-[min(56vh,520px)] overflow-y-auto border-t border-border px-2 py-3",
              navigationLayout && "min-h-0 max-h-none flex-1",
            )}
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
                  aria-expanded={groupOpen}
                  onClick={() => setGroupOpen((o) => !o)}
                  className="sidebar-meta mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
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
                  <div className="space-y-0.5">
                    {filtered.map((collection) => {
                      const active = collection.name === activeName;
                      const content = (
                        <>
                          <span
                            className={cn(
                              "grid size-7 shrink-0 place-items-center rounded-md border text-muted-foreground transition-colors",
                              active
                                ? "border-border bg-card"
                                : "border-transparent bg-surface-subtle",
                            )}
                          >
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
                        </>
                      );
                      const rowClass = cn(
                        "flex h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-sm transition-colors",
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
