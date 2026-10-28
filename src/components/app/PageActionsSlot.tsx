"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

interface PageActionsContextValue {
  target: HTMLElement | null;
  setTarget: (target: HTMLElement | null) => void;
}

const PageActionsContext = createContext<PageActionsContextValue | null>(null);

export function PageActionsProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const value = useMemo(() => ({ target, setTarget }), [target]);

  return (
    <PageActionsContext.Provider value={value}>
      {children}
    </PageActionsContext.Provider>
  );
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
