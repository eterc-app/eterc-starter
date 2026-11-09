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

export interface PageNavbarMeta {
  section?: string;
  title?: string;
  icon?: ReactNode;
  onBack?: (() => void) | null;
  badge?: ReactNode;
  search?: ReactNode;
  pageSidebar?: ReactNode;
  rightSidebar?: boolean;
  rightSidebarCollapsed?: boolean;
}

interface PageActionsContextValue {
  target: HTMLElement | null;
  setTarget: (target: HTMLElement | null) => void;
  rightSidebarTarget: HTMLElement | null;
  setRightSidebarTarget: (target: HTMLElement | null) => void;
}

const PageActionsContext = createContext<PageActionsContextValue | null>(null);

let currentNavbarMeta: PageNavbarMeta | null = null;
const navbarListeners = new Set<() => void>();

function emitNavbarChange() {
  navbarListeners.forEach((listener) => listener());
}

export function setGlobalNavbarMeta(meta: PageNavbarMeta | null) {
  if (
    currentNavbarMeta?.section === meta?.section &&
    currentNavbarMeta?.title === meta?.title &&
    currentNavbarMeta?.onBack === meta?.onBack &&
    currentNavbarMeta?.search === meta?.search &&
    currentNavbarMeta?.pageSidebar === meta?.pageSidebar &&
    currentNavbarMeta?.rightSidebar === meta?.rightSidebar &&
    currentNavbarMeta?.rightSidebarCollapsed === meta?.rightSidebarCollapsed
  ) {
    return;
  }
  currentNavbarMeta = meta;
  emitNavbarChange();
}

export function PageActionsProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [rightSidebarTarget, setRightSidebarTarget] = useState<HTMLElement | null>(null);
  const value = useMemo(
    () => ({ target, setTarget, rightSidebarTarget, setRightSidebarTarget }),
    [rightSidebarTarget, target]
  );

  return (
    <PageActionsContext.Provider value={value}>
      {children}
    </PageActionsContext.Provider>
  );
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
