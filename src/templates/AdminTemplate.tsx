"use client";

import { useEffect, useState, type ReactNode } from "react";
import NextImage from "next/image";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  ETERC_DOCS_URL,
  ETERC_GITHUB_URL,
  WEBSITE_NAME,
} from "@/engine/config";
import { to_public_path } from "@/engine/url-aliases";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ArrowUpRight,
  BookOpen,
  Braces,
  ChevronRight,
  ChevronsUpDown,
  Database,
  Image as ImageIcon,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  Moon,
  Package,
  PanelLeft,
  Settings2,
  Sun,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const WORKSPACE_NAV: NavItem[] = [
  { href: "/admin", label: "Content overview", icon: LayoutDashboard },
  { href: "/admin/data", label: "Data Studio", icon: Database },
  { href: "/admin/media", label: "Media library", icon: ImageIcon },
  { href: "/admin/access", label: "Access & API", icon: KeyRound },
  { href: "/admin/settings", label: "Project settings", icon: Settings2 },
  { href: "/administrators/manage", label: "Manage users", icon: Users },
];

const RESOURCE_NAV = [
  {
    href: "/api-reference",
    label: "API reference",
    icon: Braces,
    external: false,
  },
  {
    href: ETERC_DOCS_URL,
    label: "Documentation",
    icon: BookOpen,
    external: true,
  },
  {
    href: ETERC_GITHUB_URL,
    label: "Source",
    icon: Package,
    external: true,
  },
];

function is_active(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

const BREADCRUMB_LABELS: Record<string, string> = {
  "API Reference": "API reference",
  "Database Tables": "Database tables",
  "Data Studio": "Data Studio",
  "Media Library": "Media library",
  "Project Settings": "Project settings",
  "SQL Console": "SQL console",
};

function breadcrumb_label(value: string): string {
  return BREADCRUMB_LABELS[value] ?? value;
}

function breadcrumb_items(
  pathname: string,
  pageTitle: string,
): [string, string] {
  if (is_active(pathname, "/admin")) {
    const labels: Record<string, string> = {
      "/admin": "Content overview",
      "/admin/data": "Data Studio",
      "/admin/media": "Media library",
      "/admin/access": "Access & API",
      "/admin/settings": "Project settings",
    };
    return ["Content", labels[pathname] ?? pageTitle];
  }

  if (is_active(pathname, "/administrators")) {
    return ["Content", "Administrators"];
  }

  return [
    "Workspace",
    pageTitle && pageTitle !== "Admin Panel"
      ? breadcrumb_label(pageTitle.replace(/^Eterc\s+/, ""))
      : "Overview",
  ];
}

export function AdminTemplate({
  children,
  pageTitle = "Admin Panel",
  theme = "default",
}: {
  children: ReactNode;
  pageTitle?: string;
  theme?: string;
}) {
  const pathname = usePathname();
  const current_path = to_public_path(pathname);
  const { resolvedTheme, setTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const nav_items = WORKSPACE_NAV;
  const [section, current] = breadcrumb_items(current_path, pageTitle);
  const dark = resolvedTheme === "dark";

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        setAccountOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const close_mobile = () => setMobileOpen(false);

  const render_sidebar = (mobile: boolean) => (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-5">
        <NextImage
          src="/company-logo.png"
          alt=""
          width={36}
          height={36}
          className="size-9 shrink-0 rounded-lg border border-border object-cover"
          priority
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold leading-5">
            {WEBSITE_NAME}
          </span>
          <span className="block truncate text-xs leading-4 text-muted-foreground">
            CMS workspace
          </span>
        </span>
        {mobile ? (
          <button
            type="button"
            className="grid size-10 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close navigation"
            onClick={close_mobile}
          >
            <X className="size-4" strokeWidth={1.75} />
          </button>
        ) : null}
      </div>

      <nav
        className="app-scrollbar flex-1 overflow-y-auto px-3 pb-4"
        aria-label={mobile ? "Mobile navigation" : "Main navigation"}
      >
        <p className="type-headline px-3 pb-2 pt-4">Workspace</p>
        <div className="space-y-1">
          {nav_items.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/admin"
                ? current_path === "/admin"
                : is_active(current_path, item.href);
            return (
              <a
                key={item.href}
                href={item.href}
                onClick={mobile ? close_mobile : undefined}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                  active
                    ? "bg-muted font-semibold text-foreground"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                  strokeWidth={1.75}
                />
                <span className="truncate">{item.label}</span>
              </a>
            );
          })}
        </div>

        <p className="type-headline px-3 pb-2 pt-6">Resources</p>
        <div className="space-y-1">
          {RESOURCE_NAV.map((item) => {
            const Icon = item.icon;
            const active = !item.external && is_active(current_path, item.href);
            return (
              <a
                key={item.href}
                href={item.href}
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noreferrer" : undefined}
                onClick={mobile ? close_mobile : undefined}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                  active
                    ? "bg-muted font-semibold text-foreground"
                    : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                  strokeWidth={1.75}
                />
                <span className="flex-1 truncate">{item.label}</span>
                {item.external ? (
                  <ArrowUpRight
                    className="size-3.5 text-muted-foreground"
                    strokeWidth={1.75}
                  />
                ) : null}
              </a>
            );
          })}
        </div>
      </nav>

      <div className="border-t border-border p-3">
        <div className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={accountOpen}
            onClick={(event) => {
              event.stopPropagation();
              setAccountOpen((open) => !open);
            }}
            className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-muted"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-surface-subtle text-muted-foreground">
              <UserRound className="size-4" strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold leading-5">
                Administrator
              </span>
              <span className="block truncate text-xs leading-4 text-muted-foreground">
                Eterc account
              </span>
            </span>
            <ChevronsUpDown
              className="size-4 shrink-0 text-muted-foreground"
              strokeWidth={1.75}
            />
          </button>

          {accountOpen ? (
            <div
              role="menu"
              className="absolute bottom-[calc(100%+0.5rem)] left-0 right-0 z-50 overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-[0_16px_40px_-20px_rgb(0_0_0/0.35)]"
            >
              <a
                role="menuitem"
                href="/administrators/update_your_details"
                onClick={mobile ? close_mobile : undefined}
                className="flex h-9 items-center gap-2 rounded-md px-3 text-sm hover:bg-muted"
              >
                <UserRound className="size-4" strokeWidth={1.75} />
                Update details
              </a>
              <a
                role="menuitem"
                href="/administrators/logout"
                onClick={mobile ? close_mobile : undefined}
                className="flex h-9 items-center gap-2 rounded-md px-3 text-sm text-destructive hover:bg-destructive/10"
              >
                <LogOut className="size-4" strokeWidth={1.75} />
                Log out
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <div
      data-theme={theme}
      className="min-h-screen bg-background text-foreground"
      onClick={() => setAccountOpen(false)}
    >
      <div className="flex min-h-screen">
        {!sidebarCollapsed ? (
          <aside className="sticky top-0 hidden h-screen w-[280px] shrink-0 border-r border-border bg-sidebar md:flex">
            {render_sidebar(false)}
          </aside>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              className="grid size-10 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="size-4" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className="hidden size-10 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:grid"
              aria-label={
                sidebarCollapsed ? "Show navigation" : "Hide navigation"
              }
              aria-expanded={!sidebarCollapsed}
              onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            >
              <PanelLeft className="size-4" strokeWidth={1.75} />
            </button>
            <span className="hidden h-5 w-px bg-border md:block" />
            <nav
              aria-label="Breadcrumb"
              className="flex min-w-0 items-center gap-2 text-xs"
            >
              <span className="truncate text-muted-foreground">{section}</span>
              <ChevronRight
                className="size-3.5 shrink-0 text-muted-foreground"
                strokeWidth={1.75}
              />
              <span className="truncate font-semibold text-foreground">
                {current}
              </span>
            </nav>

            <div className="ml-auto flex items-center gap-2">
              <Badge variant="outline" className="hidden sm:inline-flex">
                <LockKeyhole className="size-3" strokeWidth={1.75} />
                Private API
              </Badge>
              <button
                type="button"
                className="grid size-10 place-items-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Switch theme"
                title="Switch theme"
                onClick={() => setTheme(dark ? "light" : "dark")}
              >
                {dark ? (
                  <Sun className="size-4" strokeWidth={1.75} />
                ) : (
                  <Moon className="size-4" strokeWidth={1.75} />
                )}
              </button>
            </div>
          </header>

          <main className="flex-1 bg-background px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <div className="mx-auto w-full max-w-[1560px]">{children}</div>
          </main>
        </div>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden" onClick={close_mobile}>
          <div className="absolute inset-0 bg-overlay" />
          <aside
            className="relative flex h-full w-[280px] flex-col border-r border-border bg-sidebar shadow-[0_24px_64px_-24px_rgb(0_0_0/0.45)]"
            onClick={(event) => event.stopPropagation()}
          >
            {render_sidebar(true)}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
