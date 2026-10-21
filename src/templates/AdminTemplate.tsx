"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  WEBSITE_NAME,
  ENV,
  ETERC_HOME_URL,
  ETERC_DOCS_URL,
  ETERC_GITHUB_URL,
} from "@/engine/config";
import { FlowTrigger } from "@/modules/trongate_control/FlowTrigger";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  Database,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Settings,
  ShoppingCart,
  Users,
  Wand2,
  X,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/control", label: "Dashboard", icon: LayoutDashboard },
  { href: "/administrators/manage", label: "Manage Users", icon: Users },
  { href: "/control/flo/home", label: "Flo Generator", icon: Wand2 },
  { href: "/control/properties-builder", label: "Properties Builder", icon: Settings },
  { href: "/control/query-builder", label: "Query Builder", icon: Database },
];

/**
 * Admin theme — port of modules/templates/views/admin.php
 * (including the interactions provided by templates_module/js/admin.js).
 *
 * The shell is authored with Tailwind + shadcn primitives; the page content
 * rendered by modules keeps the PHP view contract.
 */
export function AdminTemplate({
  children,
  pageTitle = "Admin Panel",
  theme = "default",
}: {
  children: ReactNode;
  pageTitle?: string;
  theme?: string;
}) {
  const year = new Date().getFullYear();
  const pathname = usePathname();
  const [slideNavOpen, setSlideNavOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Generators and the control panel are development-only, matching the PHP
  // guards. Keep production navigation to routes that are actually available.
  const nav_items =
    ENV === "dev"
      ? NAV_ITEMS
      : NAV_ITEMS.filter((item) => item.href.startsWith("/administrators"));

  useEffect(() => {
    if (!slideNavOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSlideNavOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [slideNavOpen]);

  return (
    <div
      data-theme={theme}
      className="flex min-h-screen flex-col bg-muted/30 text-foreground"
      onClick={() => setSettingsOpen(false)}
    >
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex h-14 items-center justify-between gap-4 px-4 md:px-6">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Open navigation"
              onClick={(event) => {
                event.stopPropagation();
                setSlideNavOpen(true);
              }}
            >
              <Menu className="size-5" />
            </Button>
            <a href="/control" className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
                E
              </span>
              <span className="text-base font-bold tracking-tight">
                {WEBSITE_NAME}
              </span>
              <span className="hidden rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:inline">
                Admin
              </span>
            </a>
          </div>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Utility navigation">
            <Button asChild variant="ghost" size="sm">
              <a href="#">
                <Settings className="size-4" /> Messages (1)
              </a>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <a href="#">
                <ShoppingCart className="size-4" /> Orders
              </a>
            </Button>
          </nav>

          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              aria-haspopup="menu"
              aria-expanded={settingsOpen}
              onClick={(event) => {
                event.stopPropagation();
                setSettingsOpen((open) => !open);
              }}
            >
              <Users className="size-4" />
              <span className="hidden sm:inline">Account</span>
            </Button>

            {settingsOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-56 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
                onClick={(event) => event.stopPropagation()}
              >
                <a
                  role="menuitem"
                  href="/administrators/update_your_details"
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <Users className="size-4" /> Update Your Details
                </a>
                <a
                  role="menuitem"
                  href="/administrators/logout"
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                >
                  <LogOut className="size-4" /> Log Out
                </a>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 overflow-y-auto border-r bg-background md:block">
          <div className="p-3">
            {ENV === "dev" ? <FlowTrigger /> : null}
          </div>
          <nav aria-label="Main navigation" className="space-y-1 px-3 pb-6">
            <p className="px-2 pb-2 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Workspace
            </p>
            {nav_items.map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.href ||
                (item.href !== "/control" &&
                  pathname.startsWith(item.href));
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </a>
              );
            })}

            <p className="px-2 pb-2 pt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Resources
            </p>
            <a
              href={ETERC_DOCS_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <BookOpen className="size-4" /> Documentation
              <ExternalLink className="ml-auto size-3" />
            </a>
            <a
              href={ETERC_GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Package className="size-4" /> Source
              <ExternalLink className="ml-auto size-3" />
            </a>
          </nav>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-6xl">
            {pageTitle !== "Admin Panel" ? (
              <h1 className="mb-6 text-2xl font-bold tracking-tight">
                {pageTitle}
              </h1>
            ) : null}
            {children}
          </div>
        </main>
      </div>

      <footer className="border-t bg-background px-4 py-4 md:px-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 text-xs text-muted-foreground sm:flex-row">
          <p>
            &copy; {year} {WEBSITE_NAME}. PHP semantics, Next.js speed.
          </p>
          <div className="flex items-center gap-3">
            <a href={ETERC_HOME_URL} target="_blank" rel="noreferrer" className="hover:text-foreground">
              Powered by Eterc
            </a>
            <a href={ETERC_DOCS_URL} target="_blank" rel="noreferrer" className="hover:text-foreground">
              Documentation
            </a>
            <a href={ETERC_GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-foreground">
              GitHub
            </a>
          </div>
        </div>
      </footer>

      {slideNavOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            className="absolute inset-0 bg-black/50"
            aria-label="Close navigation"
            onClick={() => setSlideNavOpen(false)}
          />
          <nav
            className="relative flex h-full w-72 max-w-[85vw] flex-col bg-background shadow-xl"
            aria-label="Mobile navigation"
          >
            <div className="flex h-14 items-center justify-between border-b px-4">
              <span className="font-bold">{WEBSITE_NAME}</span>
              <Button variant="ghost" size="icon" onClick={() => setSlideNavOpen(false)}>
                <X className="size-5" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {ENV === "dev" ? <div className="pb-3"><FlowTrigger /></div> : null}
              <div className="space-y-1">
                {nav_items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    >
                      <Icon className="size-4" /> {item.label}
                    </a>
                  );
                })}
              </div>
            </div>
            <div className="border-t p-3">
              <a
                href="/administrators/logout"
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
              >
                <LogOut className="size-4" /> Log Out
              </a>
            </div>
          </nav>
        </div>
      ) : null}
    </div>
  );
}
