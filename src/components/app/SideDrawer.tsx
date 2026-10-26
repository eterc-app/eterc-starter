"use client";

import type { ReactNode } from "react";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export function SideDrawer({
  open,
  onOpenChange,
  title,
  description,
  side = "left",
  className,
  bodyClassName,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  side?: "left" | "right";
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={side} className={cn("max-w-[360px]", className)}>
        <SheetHeader className="p-4 pr-12">
          <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="mt-1 text-xs leading-5">
              {description}
            </DialogDescription>
          ) : null}
        </SheetHeader>
        <SheetBody className={cn("p-3", bodyClassName)}>
          {children}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

export interface SectionDrawerItem {
  value: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  badge?: ReactNode;
}

export function SectionDrawer({
  open,
  onOpenChange,
  title,
  description,
  items,
  value,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  items: SectionDrawerItem[];
  value: string;
  onSelect: (value: string) => void;
}) {
  return (
    <SideDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
    >
      <nav className="space-y-1" aria-label={title}>
        {items.map((item) => {
          const active = item.value === value;
          return (
            <button
              key={item.value}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => onSelect(item.value)}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                active
                  ? "border-border bg-card"
                  : "border-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground"
              )}
            >
              {item.icon ? (
                <span className="mt-0.5 shrink-0 text-current">{item.icon}</span>
              ) : null}
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "block truncate text-sm",
                      active ? "font-semibold text-foreground" : "font-medium"
                    )}
                  >
                    {item.label}
                  </span>
                  {item.badge}
                </span>
                {item.description ? (
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {item.description}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </nav>
    </SideDrawer>
  );
}
