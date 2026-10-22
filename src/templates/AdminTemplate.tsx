"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  ETERC_DOCS_URL,
  ETERC_GITHUB_URL,
  ENV,
  WEBSITE_NAME,
} from "@/engine/config";
import { to_public_path } from "@/engine/url-aliases";
import { cn } from "@/lib/utils";
import {
  ArrowUpRight,
  Blocks,
  BookOpen,
  Braces,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PanelLeft,
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
  { href: "/control", label: "Dashboard", icon: LayoutDashboard },
  { href: "/administrators/manage", label: "Manage Users", icon: Users },
];

const BUILDER_NAV = [
  { href: "/control/flo/home", label: "Flo" },
  { href: "/control/module-builder", label: "Module Builder" },
  { href: "/control/site-builder", label: "Site Builder" },
  { href: "/control/properties-builder", label: "Properties Builder" },
  { href: "/control/query-builder", label: "Query Builder" },
  { href: "/control/module-relations-builder", label: "Module Relations" },
  { href: "/control/image-uploader-builder", label: "Image Uploader" },
  { href: "/control/plural-maker", label: "Plural Maker" },
  { href: "/control/evo", label: "Evo" },
];

const RESOURCE_NAV = [
  {
    href: "/api-reference",
    label: "API Reference",
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

function builder_active(pathname: string, href: string): boolean {
  if (is_active(pathname, href)) return true;
  const base = href.replace(/\/home$/, "");
  return pathname === base || pathname.startsWith(`${base}/`);
}

function breadcrumb_items(
  pathname: string,
  pageTitle: string,
): [string, string] {
  if (pathname === "/control") {
    const current =
      pageTitle && pageTitle !== "Admin Panel" && pageTitle !== "Eterc Control Panel"
        ? pageTitle.replace(/^Eterc\s+/, "")
        : "Overview";
    return ["Workspace", current];
  }

  if (is_active(pathname, "/administrators")) {
    return ["Workspace", "Administrators"];
  }

  const builder = BUILDER_NAV.find((item) =>
    builder_active(pathname, item.href),
  );
  if (builder) {
    return ["Builders", builder.label];
  }

  return [
    "Workspace",
    pageTitle && pageTitle !== "Admin Panel"
      ? pageTitle.replace(/^Eterc\s+/, "")
      : "Overview",
  ];
}

/**
 * Admin shell — the port of modules/templates/views/admin.php.
 *
 * The shell is deliberately quiet: a compact sidebar, a single breadcrumb row
 * and flat content surfaces. Module views keep the PHP view contract.
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
  const pathname = usePathname();
  const current_path = to_public_path(pathname);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [buildersOpen, setBuildersOpen] = useState(true);
  const [accountOpen, setAccountOpen] = useState(false);

  const nav_items =
    ENV === "dev"
      ? WORKSPACE_NAV
      : WORKSPACE_NAV.filter((item) =>
          item.href.startsWith("/administrators"),
        );
  const buildersActive = BUILDER_NAV.some((item) =>
    builder_active(current_path, item.href),
  );
  const [section, current] = breadcrumb_items(current_path, pageTitle);

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
      <div className="flex items-center gap-2.5 px-3 py-3.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-foreground text-[11px] font-semibold text-background">
          E
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold leading-4">
            {WEBSITE_NAME}
          </span>
          <span className="block truncate text-[11px] leading-4 text-muted-foreground">
            Workspace
          </span>
        </span>
        {mobile ? (
          <button
            type="button"
            className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            aria-label="Close navigation"
            onClick={close_mobile}
          >
            <X className="size-4" strokeWidth={1.75} />
          </button>
        ) : (
          <ChevronsUpDown
            className="size-3.5 text-muted-foreground"
            strokeWidth={1.75}
            aria-hidden="true"
          />
        )}
      </div>

      <nav
        className="flex-1 overflow-y-auto px-2 pb-4"
        aria-label={mobile ? "Mobile navigation" : "Main navigation"}
      >
        <p className="px-2 pb-1.5 pt-2 text-[11px] font-medium text-muted-foreground">
          Platform
        </p>
        <div className="space-y-0.5">
          {nav_items.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/control"
                ? current_path === "/control"
                : is_active(current_path, item.href);
            return (
              <a
                key={item.href}
                href={item.href}
                onClick={mobile ? close_mobile : undefined}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-md px-2 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                  active
                    ? "bg-muted/70 font-medium text-foreground"
                    : "text-foreground/80 hover:bg-muted/50 hover:text-foreground",
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

        {ENV === "dev" ? (
          <div className="mt-2">
            <button
              type="button"
              aria-expanded={buildersOpen}
              onClick={() => setBuildersOpen((open) => !open)}
              className={cn(
                "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                buildersActive
                  ? "text-foreground"
                  : "text-foreground/80 hover:text-foreground",
              )}
            >
              <Blocks
                className="size-4 shrink-0 text-muted-foreground"
                strokeWidth={1.75}
              />
              <span className="flex-1 truncate">Builders</span>
              <ChevronDown
                className={cn(
                  "size-3.5 text-muted-foreground transition-transform",
                  !buildersOpen && "-rotate-90",
                )}
                strokeWidth={1.75}
              />
            </button>

            {buildersOpen ? (
              <div className="mt-0.5 space-y-0.5">
                {BUILDER_NAV.map((item) => {
                  const active = builder_active(current_path, item.href);
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      onClick={mobile ? close_mobile : undefined}
                      className={cn(
                        "flex h-7 items-center rounded-md pl-8 pr-2 text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                        active
                          ? "bg-muted/60 font-medium text-foreground"
                          : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                      )}
                    >
                      <span className="truncate">{item.label}</span>
                    </a>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}

        <p className="px-2 pb-1.5 pt-5 text-[11px] font-medium text-muted-foreground">
          Resources
        </p>
        <div className="space-y-0.5">
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
                  "flex h-8 items-center gap-2 rounded-md px-2 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                  active
                    ? "bg-muted/70 font-medium text-foreground"
                    : "text-foreground/80 hover:bg-muted/50 hover:text-foreground",
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
                    className="size-3.5 text-muted-foreground/50"
                    strokeWidth={1.75}
                  />
                ) : null}
              </a>
            );
          })}
        </div>
      </nav>

      <div className="border-t border-border/70 p-2">
        <div className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={accountOpen}
            onClick={(event) => {
              event.stopPropagation();
              setAccountOpen((open) => !open);
            }}
            className="flex w-full items-center gap-2 rounded-md p-1.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-md border border-border/70 bg-muted/40 text-muted-foreground">
              <UserRound className="size-3.5" strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-medium leading-4">
                Administrator
              </span>
              <span className="block truncate text-[11px] leading-4 text-muted-foreground">
                Eterc account
              </span>
            </span>
            <ChevronsUpDown
              className="size-3.5 shrink-0 text-muted-foreground"
              strokeWidth={1.75}
            />
          </button>

          {accountOpen ? (
            <div
              role="menu"
              className="absolute bottom-[calc(100%+0.25rem)] left-0 right-0 z-50 overflow-hidden rounded-md border border-border/70 bg-popover p-1 text-popover-foreground shadow-sm"
            >
              <a
                role="menuitem"
                href="/administrators/update_your_details"
                onClick={mobile ? close_mobile : undefined}
                className="flex h-8 items-center gap-2 rounded px-2 text-[12.5px] hover:bg-muted/60"
              >
                <UserRound className="size-3.5" strokeWidth={1.75} />
                Update details
              </a>
              <a
                role="menuitem"
                href="/administrators/logout"
                onClick={mobile ? close_mobile : undefined}
                className="flex h-8 items-center gap-2 rounded px-2 text-[12.5px] text-destructive hover:bg-destructive/10"
              >
                <LogOut className="size-3.5" strokeWidth={1.75} />
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
      className="min-h-screen bg-muted/30 text-foreground"
      onClick={() => setAccountOpen(false)}
    >
      <div className="flex min-h-screen">
        {!sidebarCollapsed ? (
          <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 border-r border-border/70 bg-background md:flex">
            {render_sidebar(false)}
          </aside>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-3 px-4 sm:px-6">
            <button
              type="button"
              className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 md:hidden"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="size-4" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className="hidden size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 md:grid"
              aria-label={
                sidebarCollapsed ? "Show navigation" : "Hide navigation"
              }
              aria-expanded={!sidebarCollapsed}
              onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            >
              <PanelLeft className="size-4" strokeWidth={1.75} />
            </button>
            <span className="hidden h-4 w-px bg-border md:block" />
            <nav
              aria-label="Breadcrumb"
              className="flex min-w-0 items-center gap-1.5 text-[12px]"
            >
              <span className="truncate text-muted-foreground">{section}</span>
              <ChevronRight
                className="size-3.5 shrink-0 text-muted-foreground/60"
                strokeWidth={1.75}
              />
              <span className="truncate font-medium text-foreground">
                {current}
              </span>
            </nav>
          </header>

          <main className="flex-1 px-4 pb-8 sm:px-6">
            <div className="mx-auto w-full max-w-[1440px]">{children}</div>
          </main>
        </div>
      </div>

      {mobileOpen ? (
        <div
          className="fixed inset-0 z-50 md:hidden"
          onClick={close_mobile}
        >
          <div className="absolute inset-0 bg-black/20" />
          <aside
            className="relative flex h-full w-[232px] flex-col border-r border-border/70 bg-background shadow-sm"
            onClick={(event) => event.stopPropagation()}
          >
            {render_sidebar(true)}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
