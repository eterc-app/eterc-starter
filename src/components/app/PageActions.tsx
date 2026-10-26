"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface PageAction {
  label: string;
  icon: ReactNode;
  href?: string;
  external?: boolean;
  onSelect?: () => void;
  variant?: "default" | "outline" | "destructive";
  disabled?: boolean;
}

function action_variant(variant: PageAction["variant"]) {
  if (variant === "default" || variant === "destructive") return variant;
  return "outline";
}

export function PageActions({
  items,
  label = "Page actions",
}: {
  items: PageAction[];
  label?: string;
}) {
  if (items.length === 0) return null;

  if (items.length === 1) {
    const item = items[0];
    const variant = action_variant(item.variant);
    const icon = item.icon;

    if (item.href) {
      const absolute = /^https?:\/\//.test(item.href);
      return (
        <Button
          asChild
          variant={variant}
          size="icon"
          title={item.label}
          aria-label={item.label}
          aria-disabled={item.disabled || undefined}
        >
          {item.external || absolute ? (
            <a
              href={item.href}
              target={item.external ? "_blank" : undefined}
              rel={item.external ? "noreferrer" : undefined}
            >
              {icon}
            </a>
          ) : (
            <Link href={item.href}>{icon}</Link>
          )}
        </Button>
      );
    }

    return (
      <Button
        type="button"
        variant={variant}
        size="icon"
        title={item.label}
        aria-label={item.label}
        disabled={item.disabled}
        onClick={item.onSelect}
      >
        {icon}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          title={label}
          aria-label={label}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        {items.map((item) => {
          const content = (
            <>
              {item.icon}
              {item.label}
            </>
          );
          const variant = item.variant === "destructive" ? "destructive" : "default";

          if (item.href) {
            const absolute = /^https?:\/\//.test(item.href);
            return (
              <DropdownMenuItem
                key={item.label}
                asChild
                variant={variant}
                disabled={item.disabled}
              >
                {item.external || absolute ? (
                  <a
                    href={item.href}
                    target={item.external ? "_blank" : undefined}
                    rel={item.external ? "noreferrer" : undefined}
                  >
                    {content}
                  </a>
                ) : (
                  <Link href={item.href}>{content}</Link>
                )}
              </DropdownMenuItem>
            );
          }

          return (
            <DropdownMenuItem
              key={item.label}
              variant={variant}
              disabled={item.disabled}
              onSelect={item.onSelect}
            >
              {content}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
