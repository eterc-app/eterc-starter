"use client";

import React, { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import iconNamesData from "@/lib/icon-names.json";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const ALL_ICONS = iconNamesData as string[];
const INITIAL_LIMIT = 120;

export interface IconPickerProps {
  value?: string;
  onChange: (value: string) => void;
  color?: string;
  disabled?: boolean;
  className?: string;
  popoverClassName?: string;
  placeholder?: string;
}

export function IconPicker({
  value = "",
  onChange,
  color,
  disabled = false,
  className,
  popoverClassName,
  placeholder = "Select an icon",
}: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(INITIAL_LIMIT);

  const filteredIcons = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return ALL_ICONS;
    return ALL_ICONS.filter((name) => name.toLowerCase().includes(q));
  }, [query]);

  const visibleIcons = useMemo(() => {
    return filteredIcons.slice(0, limit);
  }, [filteredIcons, limit]);

  const handleSelect = (name: string) => {
    onChange(name);
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-9 w-full items-center justify-between rounded-md border border-input bg-card px-3 py-1 text-sm shadow-xs transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        >
          <div className="flex items-center gap-2.5 truncate">
            {value ? (
              <DynamicIcon
                name={value}
                size={18}
                color={color ? color : undefined}
                className="shrink-0"
              />
            ) : (
              <DynamicIcon
                name="box"
                size={18}
                className="shrink-0 text-muted-foreground"
              />
            )}
            <span
              className={cn(
                "truncate text-xs",
                value ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {value || placeholder}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {value && !disabled ? (
              <div
                role="button"
                tabIndex={0}
                aria-label="Clear icon"
                onClick={handleClear}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onChange("");
                  }
                }}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </div>
            ) : null}
          </div>
        </button>
      </PopoverTrigger>

      <PopoverContent className={cn("w-80 p-3", popoverClassName)} align="start">
        <div className="grid gap-2.5">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search 1,700+ icons..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(INITIAL_LIMIT);
              }}
              className="h-8 pl-8 text-xs"
              autoFocus
            />
          </div>

          <ScrollArea className="h-56 w-full rounded-md border border-border">
            {visibleIcons.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center p-4 text-center">
                <p className="text-xs text-muted-foreground">
                  No icons matching &ldquo;{query}&rdquo;
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-6 gap-1 p-2">
                {visibleIcons.map((name) => {
                  const isSelected = value === name;
                  return (
                    <button
                      key={name}
                      type="button"
                      title={name}
                      aria-label={`Select ${name} icon`}
                      onClick={() => handleSelect(name)}
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-accent hover:text-accent-foreground",
                        isSelected
                          ? "bg-accent text-accent-foreground font-semibold"
                          : "text-muted-foreground",
                      )}
                    >
                      <DynamicIcon
                        name={name}
                        size={18}
                        color={isSelected && color ? color : undefined}
                      />
                    </button>
                  );
                })}
              </div>
            )}

            {filteredIcons.length > limit ? (
              <div className="p-2 pt-0 text-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-full text-xs text-muted-foreground"
                  onClick={() => setLimit((prev) => prev + INITIAL_LIMIT)}
                >
                  Load {filteredIcons.length - limit} more icons...
                </Button>
              </div>
            ) : null}
          </ScrollArea>

          <div className="flex items-center justify-between text-xs text-muted-foreground px-0.5">
            <span>
              {filteredIcons.length} icon{filteredIcons.length === 1 ? "" : "s"}
            </span>
            {value ? (
              <span className="font-mono text-xs truncate max-w-[140px]">
                {value}
              </span>
            ) : null}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
