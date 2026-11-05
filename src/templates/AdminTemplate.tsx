"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  ETERC_DOCS_URL,
  ETERC_GITHUB_URL,
  WEBSITE_NAME,
} from "@/engine/config";
import { to_public_path } from "@/engine/url-aliases";
import {
  PageActionsProvider,
  PageActionsSlot,
  usePageNavbarMeta,
} from "@/components/app/PageActionsSlot";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  Bookmark,
  Bot,
  Bug,
  ChevronRight,
  ChevronsUpDown,
  Database,
  Image as ImageIcon,
  Languages,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Palette,
  PanelLeft,
  PanelRight,
  Rabbit,
  Settings2,
  Shapes,
  Shield,
  SlidersHorizontal,
  SquareTerminal,
  Store,
  Sun,
  UserRound,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

interface SidebarItem {
  href: string;
  label: string;
  ariaLabel?: string;
  icon: LucideIcon;
  external?: boolean;
}

interface SidebarGroup {
  id: string;
  items: SidebarItem[];
}

const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    id: "data-content",
    items: [
      { href: "/admin/content", label: "Content", icon: Layers },
      { href: "/admin/data", label: "Data Model", ariaLabel: "Data Studio", icon: Database },
      { href: "/admin/media", label: "Media library", icon: ImageIcon },
      { href: "#", label: "Flows", icon: Zap },
    ],
  },
  {
    id: "roles-access",
    items: [
      { href: "/administrators/manage", label: "User Roles", ariaLabel: "Manage users", icon: Users },
      { href: "/admin/access", label: "Access Policies", ariaLabel: "Access & API", icon: Shield },
    ],
  },
  {
    id: "settings-customization",
    items: [
      { href: "/admin/settings", label: "Settings", ariaLabel: "Project settings", icon: SlidersHorizontal },
      { href: "#", label: "Appearance", icon: Palette },
      /**   { href: "#", label: "Bookmarks", icon: Bookmark },
         { href: "#", label: "Translations", icon: Languages },
         { href: "#", label: "AI", icon: Bot }, */
    ],
  },
  {
    id: "system-support",
    items: [
      { href: "/api-reference", label: "System Logs", ariaLabel: "System logs", icon: SquareTerminal },
      { href: `${ETERC_GITHUB_URL}/issues`, label: "Report Bug", icon: Bug, external: true },
      { href: `${ETERC_GITHUB_URL}/discussions`, label: "Request Feature", icon: BadgeCheck, external: true },
    ],
  },
];

function is_active(pathname: string, href: string): boolean {
  if (href === "#") return false;
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const BREADCRUMB_LABELS: Record<string, string> = {
  "API Reference": "System Logs",
  "Database Tables": "Database tables",
  "Content": "Content",
  "Data Studio": "Data Model",
  "Media Library": "Media library",
  "Project Settings": "Settings",
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
      "/admin": "Overview",
      "/admin/content": "Content",
      "/admin/data": "Data Model",
      "/admin/media": "Media library",
      "/admin/access": "Access Policies",
      "/admin/profile": "Profile & API keys",
      "/admin/settings": "Settings",
    };
    if (pathname.startsWith("/admin/content")) {
      return ["Content", pageTitle && pageTitle !== "Content" ? pageTitle : "Records"];
    }
    if (pathname.startsWith("/admin/data")) {
      return ["Data Model", pageTitle && pageTitle !== "Data Studio" ? pageTitle : "Schema"];
    }
    return ["Workspace", labels[pathname] ?? pageTitle];
  }

  if (is_active(pathname, "/administrators")) {
    return ["Access", "User Roles"];
  }

  return [
    "Workspace",
    pageTitle && pageTitle !== "Admin Panel"
      ? breadcrumb_label(pageTitle.replace(/^Eterc\s+/, ""))
      : "Overview",
  ];
}

function TopHeader({
  section,
  current,
  sidebarCollapsed,
  setSidebarCollapsed,
  setMobileOpen,
  dark,
  setTheme,
}: {
  section: string;
  current: string;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  setMobileOpen: (open: boolean) => void;
  dark: boolean;
  setTheme: (theme: string) => void;
}) {
  const navbarMeta = usePageNavbarMeta();
  const displaySection = navbarMeta?.section ?? section;
  const displayTitle = navbarMeta?.title ?? current;

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background px-4 sm:px-6 lg:px-8">
      <button
        type="button"
        className="grid size-10 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
        aria-label="Open navigation"
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="size-4" strokeWidth={1.75} />
      </button>

      {sidebarCollapsed ? (
        <button
          type="button"
          className="hidden size-10 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:grid"
          aria-label="Show navigation"
          aria-expanded={false}
          onClick={() => setSidebarCollapsed(false)}
        >
          <PanelLeft className="size-4" strokeWidth={1.75} />
        </button>
      ) : null}

      {sidebarCollapsed ? (
        <span className="hidden h-5 w-px bg-border md:block" />
      ) : null}

      <div className="flex min-w-0 items-center gap-3">
        {navbarMeta?.onBack ? (
          <button
            type="button"
            onClick={navbarMeta.onBack}
            className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-surface-subtle text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Go back"
            title="Go back"
          >
            <ArrowLeft className="size-4" strokeWidth={2} />
          </button>
        ) : (
          <span className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-surface-subtle text-muted-foreground">
            {navbarMeta?.icon ?? <LayoutDashboard className="size-4" strokeWidth={1.75} />}
          </span>
        )}

        <div className="flex min-w-0 flex-col justify-center">
          <span className="type-headline truncate text-xs font-medium text-muted-foreground leading-tight">
            {displaySection}
          </span>
          <div className="flex items-center gap-2">
            <span className="truncate text-base font-semibold tracking-tight text-foreground leading-tight">
              {displayTitle}
            </span>
            {navbarMeta?.badge}
          </div>
        </div>
      </div>

      {navbarMeta?.search ? (
        <div className="hidden min-w-0 flex-1 max-w-sm sm:block sm:ml-4">
          {navbarMeta.search}
        </div>
      ) : null}

      <div className="ml-auto flex items-center gap-2">
        <PageActionsSlot className="flex items-center gap-2 empty:hidden" />
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
  );
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

  const render_collapsed_sidebar = () => (
    <div className="flex h-full w-full flex-col items-center bg-sidebar py-3">
      <button
        type="button"
        className="grid size-10 place-items-center rounded-lg text-foreground transition-colors hover:bg-muted"
        aria-label="Show navigation"
        title="Show navigation"
        onClick={() => setSidebarCollapsed(false)}
      >
        <PanelLeft className="size-4" strokeWidth={1.75} />
      </button>

      <nav
        className="app-scrollbar flex flex-1 flex-col items-center gap-1 overflow-y-auto px-1 py-2"
        aria-label="Collapsed navigation"
      >
        {SIDEBAR_GROUPS.map((group, groupIdx) => (
          <div key={group.id} className="flex flex-col items-center">
            {groupIdx > 0 ? (
              <span className="my-2 h-px w-6 bg-border" aria-hidden="true" />
            ) : null}
            <div className="flex flex-col items-center gap-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = is_active(current_path, item.href);

                return (
                  <a
                    key={item.label}
                    href={item.href}
                    title={item.label}
                    aria-label={item.ariaLabel ?? item.label}
                    aria-current={active ? "page" : undefined}
                    onClick={(e) => {
                      if (item.label === "Appearance") {
                        e.preventDefault();
                        setTheme(dark ? "light" : "dark");
                      } else if (item.href === "#") {
                        e.preventDefault();
                        toast.info(`${item.label} will be available in the next Eterc release.`);
                      }
                    }}
                    className={cn(
                      "grid size-10 place-items-center rounded-lg transition-colors",
                      active
                        ? "bg-muted text-foreground"
                        : "text-foreground hover:bg-muted/70",
                    )}
                  >
                    <Icon className="size-5" strokeWidth={1.75} />
                  </a>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-2">
        <button
          type="button"
          aria-label="Account"
          title="Account"
          onClick={() => setAccountOpen((open) => !open)}
          className="grid size-10 place-items-center rounded-lg border border-border bg-surface-subtle text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <UserRound className="size-4" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );

  const render_sidebar = (mobile: boolean) => (
    <div className="flex h-full w-full flex-col bg-sidebar text-foreground">
      {/* Top Header - exact matching from attached image */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
        <div className="min-w-0 flex-1">
          <span className="sidebar-brand block truncate text-xs font-semibold uppercase tracking-wider text-foreground">
            ETERC APP
          </span>
          <span className="sidebar-subtitle block truncate text-xs text-muted-foreground">
            ercent.com backend
          </span>
        </div>
        {mobile ? (
          <button
            type="button"
            className="grid size-8 place-items-center rounded-md text-foreground transition-colors hover:bg-muted"
            aria-label="Close navigation"
            onClick={close_mobile}
          >
            <X className="size-4" strokeWidth={1.75} />
          </button>
        ) : (
          <button
            type="button"
            className="grid size-8 place-items-center rounded-md text-foreground transition-colors hover:bg-muted"
            aria-label="Hide navigation"
            title="Hide navigation"
            onClick={() => setSidebarCollapsed(true)}
          >
            <PanelRight className="size-4" strokeWidth={1.75} />
          </button>
        )}
      </div>

      {/* Nav Groups separated by Dividers - exact matching from attached image */}
      <nav
        className="app-scrollbar flex-1 overflow-y-auto px-2.5 py-2.5"
        aria-label={mobile ? "Mobile navigation" : "Main navigation"}
      >
        {SIDEBAR_GROUPS.map((group, groupIdx) => (
          <div key={group.id}>
            {groupIdx > 0 ? (
              <div className="my-2 mx-1 h-px bg-border" />
            ) : null}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = is_active(current_path, item.href);

                const handleClick = (e: React.MouseEvent) => {
                  if (item.label === "Appearance") {
                    e.preventDefault();
                    setTheme(dark ? "light" : "dark");
                  } else if (item.href === "#") {
                    e.preventDefault();
                    toast.info(`${item.label} will be available in the next Eterc release.`);
                  } else if (mobile) {
                    close_mobile();
                  }
                };

                return (
                  <a
                    key={item.label}
                    href={item.href}
                    target={item.external ? "_blank" : undefined}
                    rel={item.external ? "noreferrer" : undefined}
                    aria-label={item.ariaLabel ?? item.label}
                    aria-current={active ? "page" : undefined}
                    onClick={handleClick}
                    className={cn(
                      "flex h-10 items-center gap-3 rounded-lg px-3 transition-colors",
                      active
                        ? "bg-muted font-medium text-foreground"
                        : "text-foreground hover:bg-muted/70",
                    )}
                  >
                    <Icon
                      className="size-5 shrink-0 text-foreground"
                      strokeWidth={1.75}
                    />
                    <span className="sidebar-text flex-1 truncate font-medium text-foreground">
                      {item.label}
                    </span>
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
          </div>
        ))}
      </nav>

      {/* Bottom Footer Area */}
      <div className="border-t border-border p-2">
        <div className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={accountOpen}
            onClick={(event) => {
              event.stopPropagation();
              setAccountOpen((open) => !open);
            }}
            className="flex w-full items-center gap-2 rounded-lg p-1.5 text-left transition-colors hover:bg-muted"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-surface-subtle text-muted-foreground">
              <UserRound className="size-4" strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1 space-y-0.5">
              <span className="sidebar-meta block truncate font-medium text-foreground leading-tight">
                Administrator
              </span>
              <span className="sidebar-meta block truncate text-xs text-muted-foreground leading-tight">
                Eterc account
              </span>
            </span>
            <ChevronsUpDown
              className="-mr-1 size-3.5 shrink-0 text-muted-foreground"
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
                href="/admin/profile"
                onClick={mobile ? close_mobile : undefined}
                className="flex h-9 items-center gap-2 rounded-md px-3 text-sm hover:bg-muted"
              >
                <UserRound className="size-4" strokeWidth={1.75} />
                Profile & API keys
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
    <PageActionsProvider>
      <div
        data-theme={theme}
        className="min-h-screen bg-background text-foreground"
        onClick={() => setAccountOpen(false)}
      >
        <div className="flex min-h-screen">
          {sidebarCollapsed ? (
            <aside className="sticky top-0 hidden h-screen w-14 shrink-0 border-r border-border bg-sidebar md:flex">
              {render_collapsed_sidebar()}
            </aside>
          ) : (
            <aside className="sticky top-0 hidden h-screen w-(--sidebar-width) shrink-0 border-r border-border bg-sidebar md:flex">
              {render_sidebar(false)}
            </aside>
          )}

          <div className="flex min-w-0 flex-1 flex-col">
            <TopHeader
              section={section}
              current={current}
              sidebarCollapsed={sidebarCollapsed}
              setSidebarCollapsed={setSidebarCollapsed}
              setMobileOpen={setMobileOpen}
              dark={dark}
              setTheme={setTheme}
            />

            <main className="flex-1 bg-background px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
              <div className="mx-auto w-full max-w-[1560px]">{children}</div>
            </main>
          </div>
        </div>

        {mobileOpen ? (
          <div className="fixed inset-0 z-50 md:hidden" onClick={close_mobile}>
            <div className="absolute inset-0 bg-overlay" />
            <aside
              className="relative flex h-full w-(--sidebar-width) flex-col border-r border-border bg-sidebar shadow-[0_24px_64px_-24px_rgb(0_0_0/0.45)]"
              onClick={(event) => event.stopPropagation()}
            >
              {render_sidebar(true)}
            </aside>
          </div>
        ) : null}
      </div>
    </PageActionsProvider>
  );
}
