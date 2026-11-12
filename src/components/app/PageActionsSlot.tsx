"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

export interface PageNavbarMeta {
  section?: string;
  title?: string;
  icon?: ReactNode;
  onBack?: (() => void) | null;
  badge?: ReactNode;
  search?: ReactNode;
  pageSidebar?: ReactNode;
  rightSidebar?: boolean;
  rightSidebarWidth?: "default" | "wide";
  rightSidebarHeader?: boolean;
  refresh?: {
    label: string;
    onRefresh: () => void;
    busy?: boolean;
  };
}

interface PageActionsContextValue {
  target: HTMLElement | null;
  setTarget: (target: HTMLElement | null) => void;
  rightSidebarTarget: HTMLElement | null;
  setRightSidebarTarget: (target: HTMLElement | null) => void;
  rightSidebarCollapsed: boolean;
  setRightSidebarCollapsed: (collapsed: boolean | ((current: boolean) => boolean)) => void;
}

const PageActionsContext = createContext<PageActionsContextValue | null>(null);

const sidebar_storage_prefix = "eterc-admin-right-sidebar:";
const sidebar_listeners = new Set<() => void>();
const sidebar_memory_preferences = new Map<string, boolean>();
let sidebar_read_error_logged = false;

let currentNavbarMeta: PageNavbarMeta | null = null;
const navbarListeners = new Set<() => void>();

function emitNavbarChange() {
  navbarListeners.forEach((listener) => listener());
}

function get_sidebar_collapsed(pageKey: string): boolean {
  if (sidebar_memory_preferences.has(pageKey)) {
    return sidebar_memory_preferences.get(pageKey) ?? true;
  }
  try {
    const saved = window.localStorage.getItem(
      `${sidebar_storage_prefix}${pageKey}`
    );
    if (saved !== null) return saved !== "open";
    return sidebar_memory_preferences.get(pageKey) ?? true;
  } catch (error) {
    if (!sidebar_read_error_logged) {
      console.error("Could not load this page's sidebar preference.", error);
      sidebar_read_error_logged = true;
    }
    return sidebar_memory_preferences.get(pageKey) ?? true;
  }
}

function subscribe_sidebar(listener: () => void): () => void {
  sidebar_listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    sidebar_listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function setGlobalNavbarMeta(meta: PageNavbarMeta | null) {
  if (
    currentNavbarMeta?.section === meta?.section &&
    currentNavbarMeta?.title === meta?.title &&
    currentNavbarMeta?.onBack === meta?.onBack &&
    currentNavbarMeta?.icon === meta?.icon &&
    currentNavbarMeta?.badge === meta?.badge &&
    currentNavbarMeta?.search === meta?.search &&
    currentNavbarMeta?.pageSidebar === meta?.pageSidebar &&
    currentNavbarMeta?.rightSidebar === meta?.rightSidebar &&
    currentNavbarMeta?.rightSidebarWidth === meta?.rightSidebarWidth &&
    currentNavbarMeta?.rightSidebarHeader === meta?.rightSidebarHeader &&
    currentNavbarMeta?.refresh?.label === meta?.refresh?.label &&
    currentNavbarMeta?.refresh?.onRefresh === meta?.refresh?.onRefresh &&
    currentNavbarMeta?.refresh?.busy === meta?.refresh?.busy
  ) {
    return;
  }
  currentNavbarMeta = meta;
  emitNavbarChange();
}

export function PageActionsProvider({
  children,
  pageKey,
}: {
  children: ReactNode;
  pageKey: string;
}) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [rightSidebarTarget, setRightSidebarTarget] = useState<HTMLElement | null>(null);
  const subscribeRightSidebar = useCallback(
    (listener: () => void) => subscribe_sidebar(listener),
    []
  );
  const getRightSidebarSnapshot = useCallback(
    () => get_sidebar_collapsed(pageKey),
    [pageKey]
  );
  const rightSidebarCollapsed = useSyncExternalStore(
    subscribeRightSidebar,
    getRightSidebarSnapshot,
    () => true
  );
  const setRightSidebarCollapsed = useCallback(
    (next: boolean | ((current: boolean) => boolean)) => {
      const collapsed =
        typeof next === "function"
          ? next(get_sidebar_collapsed(pageKey))
          : next;
      try {
        window.localStorage.setItem(
          `${sidebar_storage_prefix}${pageKey}`,
          collapsed ? "collapsed" : "open"
        );
        sidebar_memory_preferences.delete(pageKey);
      } catch (error) {
        sidebar_memory_preferences.set(pageKey, collapsed);
        toast.error(
          error instanceof Error
            ? `Could not save this page's sidebar preference: ${error.message}`
            : "Could not save this page's sidebar preference."
        );
      }
      sidebar_listeners.forEach((listener) => listener());
    },
    [pageKey]
  );

  const value = useMemo(
    () => ({
      target,
      setTarget,
      rightSidebarTarget,
      setRightSidebarTarget,
      rightSidebarCollapsed,
      setRightSidebarCollapsed,
    }),
    [
      rightSidebarCollapsed,
      rightSidebarTarget,
      setRightSidebarCollapsed,
      target,
    ]
  );

  return (
    <PageActionsContext.Provider value={value}>
      {children}
    </PageActionsContext.Provider>
  );
}

export function usePageRightSidebar() {
  const context = useContext(PageActionsContext);
  if (!context) {
    throw new Error("usePageRightSidebar must be used inside PageActionsProvider.");
  }
  return {
    collapsed: context.rightSidebarCollapsed,
    setCollapsed: context.setRightSidebarCollapsed,
  };
}

export function usePageNavbarMeta(): PageNavbarMeta | null {
  return useSyncExternalStore(
    (callback) => {
      navbarListeners.add(callback);
      return () => {
        navbarListeners.delete(callback);
      };
    },
    () => currentNavbarMeta,
    () => null
  );
}

export function useSetNavbarMeta(meta: PageNavbarMeta | null) {
  useEffect(() => {
    setGlobalNavbarMeta(meta);
    return () => {
      setGlobalNavbarMeta(null);
    };
  }, [meta]);
}

export function PageActionsSlot({ className }: { className?: string }) {
  const context = useContext(PageActionsContext);
  const setTarget = context?.setTarget;
  const setTargetRef = useCallback(
    (node: HTMLElement | null) => setTarget?.(node),
    [setTarget]
  );

  if (!context) {
    throw new Error("PageActionsSlot must be used inside PageActionsProvider.");
  }

  return (
    <div
      ref={setTargetRef}
      role="group"
      aria-label="Current page actions"
      data-testid="topbar-page-actions"
      className={className}
    />
  );
}

export function PageActionsPortal({ children }: { children: ReactNode }) {
  const context = useContext(PageActionsContext);

  if (!context?.target) return null;

  return createPortal(children, context.target);
}

export function PageRightSidebarSlot() {
  const context = useContext(PageActionsContext);
  const setTarget = context?.setRightSidebarTarget;
  const setTargetRef = useCallback(
    (node: HTMLElement | null) => setTarget?.(node),
    [setTarget]
  );

  if (!context) {
    throw new Error("PageRightSidebarSlot must be used inside PageActionsProvider.");
  }

  return <div ref={setTargetRef} className="h-full min-h-0 w-full" />;
}

export function PageRightSidebarPortal({ children }: { children: ReactNode }) {
  const context = useContext(PageActionsContext);

  if (!context?.rightSidebarTarget) return null;

  return createPortal(children, context.rightSidebarTarget);
}
