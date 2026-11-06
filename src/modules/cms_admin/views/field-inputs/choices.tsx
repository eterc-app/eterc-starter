"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import type { CmsChoice, CmsField } from "@/modules/cms/cms-types";
import {
  as_string,
  as_string_array,
  choice_label,
  field_choices,
  option_bool,
  option_number,
  option_string,
} from "./types";

const CHOICE_COLOR_CLASSES: Record<string, string> = {
  primary: "bg-primary",
  secondary: "bg-muted-foreground",
  info: "bg-brand",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  neutral: "bg-muted-foreground",
};

export function ChoiceMarker({ choice }: { choice: CmsChoice }) {
  if (choice.icon) {
    return (
      <DynamicIcon
        name={choice.icon}
        size={14}
        color={choice.color || undefined}
        className="shrink-0"
      />
    );
  }
  if (!choice.color) return null;
  const colorClass = CHOICE_COLOR_CLASSES[choice.color];
  if (colorClass) {
    return <span className={cn("size-2.5 shrink-0 rounded-full", colorClass)} />;
  }
  return (
    <span
      className="size-2.5 shrink-0 rounded-full border border-border"
      style={{ backgroundColor: choice.color }}
    />
  );
}

function ChoiceValueRow({
  choice,
  selected,
  onSelect,
}: {
  choice: CmsChoice;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        "flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted",
        selected && "bg-muted"
      )}
    >
      <ChoiceMarker choice={choice} />
      <span className="min-w-0 flex-1 truncate">{choice.text}</span>
      {selected ? <Check className="size-4 shrink-0" /> : null}
    </button>
  );
}

function ChoiceSearch({
  query,
  onChange,
}: {
  query: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search choices..."
        className="h-9 rounded-lg border-input bg-card pl-8 text-xs"
      />
    </div>
  );
}

export function ChoiceSelect({
  field,
  value,
  onChange,
  disabled,
  placeholder = "Select an item...",
}: {
  field: CmsField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const choices = field_choices(field);
  const allowNone = option_bool(field, true, "allowNone", "allow_none");
  const allowOther = option_bool(field, false, "allowOther", "allow_other");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = choices.find(
    (choice) => String(choice.value) === String(value)
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return choices;
    return choices.filter(
      (choice) =>
        choice.text.toLowerCase().includes(q) ||
        String(choice.value).toLowerCase().includes(q)
    );
  }, [choices, query]);

  const select = (choice: CmsChoice) => {
    onChange(choice.value);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-expanded={open}
            disabled={disabled}
            className="flex h-13 w-full items-center justify-between gap-2 rounded-lg border border-input bg-card px-4 text-left text-sm text-foreground outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:shadow-[0_0_16px_-8px_var(--ring)] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          >
            <span className="flex min-w-0 items-center gap-2">
              {selected ? <ChoiceMarker choice={selected} /> : null}
              <span
                className={cn(
                  "truncate",
                  !selected && "text-muted-foreground"
                )}
              >
                {selected ? selected.text : placeholder}
              </span>
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-2">
          <ChoiceSearch query={query} onChange={setQuery} />
          <div className="app-scrollbar max-h-60 space-y-0.5 overflow-y-auto pt-1">
            {allowNone ? (
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted"
              >
                <X className="size-3.5" />
                Clear selection
              </button>
            ) : null}
            {filtered.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                No choices match your search.
              </p>
            ) : (
              filtered.map((choice) => (
                <ChoiceValueRow
                  key={`${String(choice.value)}-${choice.text}`}
                  choice={choice}
                  selected={selected?.value === choice.value}
                  onSelect={() => select(choice)}
                />
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>

      {allowOther ? (
        <Input
          value={selected ? "" : as_string(value)}
          disabled={disabled}
          placeholder="Or enter a custom value"
          className="h-13 rounded-lg border-input bg-card"
          onChange={(event) => onChange(event.target.value)}
        />
      ) : null}
    </div>
  );
}

export function ChoiceMultiSelect({
  field,
  value,
  onChange,
  disabled,
  placeholder = "Select items...",
}: {
  field: CmsField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const choices = field_choices(field);
  const allowOther = option_bool(field, false, "allowOther", "allow_other");
  const previewThreshold = Math.max(
    1,
    option_number(field, 3, "previewThreshold", "preview_threshold")
  );
  const values = as_string_array(value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [custom, setCustom] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return choices;
    return choices.filter(
      (choice) =>
        choice.text.toLowerCase().includes(q) ||
        String(choice.value).toLowerCase().includes(q)
    );
  }, [choices, query]);

  const toggle = (choice: CmsChoice) => {
    const key = String(choice.value);
    if (values.includes(key)) {
      onChange(values.filter((entry) => entry !== key));
    } else {
      onChange([...values, key]);
    }
  };

  const selected_choices = choices.filter((choice) =>
    values.includes(String(choice.value))
  );
  const custom_values = values.filter(
    (entry) => !choices.some((choice) => String(choice.value) === entry)
  );
  const preview = selected_choices.slice(0, previewThreshold);

  const add_custom = () => {
    const entry = custom.trim();
    if (!entry || values.includes(entry)) return;
    onChange([...values, entry]);
    setCustom("");
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-expanded={open}
            disabled={disabled}
            className="flex min-h-13 w-full flex-wrap items-center gap-1.5 rounded-lg border border-input bg-card px-4 py-2 text-left text-sm text-foreground outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:shadow-[0_0_16px_-8px_var(--ring)] disabled:cursor-not-allowed disabled:bg-muted"
          >
            {selected_choices.length === 0 && custom_values.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              <>
                {preview.map((choice) => (
                  <Badge
                    key={String(choice.value)}
                    variant="secondary"
                    className="gap-1 rounded-md px-2 py-0.5 text-xs"
                  >
                    <ChoiceMarker choice={choice} />
                    {choice.text}
                  </Badge>
                ))}
                {custom_values.slice(0, Math.max(0, previewThreshold - preview.length)).map((entry) => (
                  <Badge
                    key={entry}
                    variant="secondary"
                    className="rounded-md px-2 py-0.5 text-xs"
                  >
                    {entry}
                  </Badge>
                ))}
                {selected_choices.length + custom_values.length > previewThreshold ? (
                  <Badge variant="outline" className="rounded-md px-2 py-0.5 text-xs">
                    +{selected_choices.length + custom_values.length - previewThreshold} more
                  </Badge>
                ) : null}
              </>
            )}
            <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-2">
          <ChoiceSearch query={query} onChange={setQuery} />
          <div className="app-scrollbar max-h-60 space-y-0.5 overflow-y-auto pt-1">
            {filtered.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                No choices match your search.
              </p>
            ) : (
              filtered.map((choice) => {
                const key = String(choice.value);
                return (
                  <label
                    key={`${key}-${choice.text}`}
                    className="flex min-h-12 cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-sm transition-colors hover:bg-muted"
                  >
                    <Checkbox
                      checked={values.includes(key)}
                      disabled={disabled}
                      onCheckedChange={() => toggle(choice)}
                    />
                    <ChoiceMarker choice={choice} />
                    <span className="min-w-0 flex-1 truncate">{choice.text}</span>
                  </label>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>

      {allowOther ? (
        <div className="flex items-center gap-2">
          <Input
            value={custom}
            disabled={disabled}
            placeholder="Add a custom value"
            className="h-13 rounded-lg border-input bg-card"
            onChange={(event) => setCustom(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add_custom();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            className="rounded-lg"
            disabled={disabled || custom.trim() === ""}
            onClick={add_custom}
          >
            <Plus className="size-4" />
            Add
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function choice_depth(
  choice: CmsChoice,
  by_value: Map<string, CmsChoice>,
  seen = new Set<string>()
): number {
  if (choice.parent === undefined || choice.parent === null) return 0;
  const key = String(choice.parent);
  if (seen.has(key)) return 0;
  const parent = by_value.get(key);
  if (!parent) return 0;
  seen.add(key);
  return 1 + choice_depth(parent, by_value, seen);
}

function CheckboxChoiceList({
  field,
  value,
  onChange,
  disabled,
  tree,
}: {
  field: CmsField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  tree?: boolean;
}) {
  const choices = field_choices(field);
  const allowOther = option_bool(field, false, "allowOther", "allow_other");
  const itemsShown = Math.max(
    1,
    option_number(field, 8, "itemsShown", "items_shown")
  );
  const [showAll, setShowAll] = useState(false);
  const [custom, setCustom] = useState("");
  const values = as_string_array(value);
  const byValue = useMemo(
    () => new Map(choices.map((choice) => [String(choice.value), choice])),
    [choices]
  );
  const visible = showAll ? choices : choices.slice(0, itemsShown);
  const customValues = values.filter(
    (entry) => !choices.some((choice) => String(choice.value) === entry)
  );

  const toggle = (choice: CmsChoice) => {
    const key = String(choice.value);
    if (values.includes(key)) {
      onChange(values.filter((entry) => entry !== key));
    } else {
      onChange([...values, key]);
    }
  };

  const add_custom = () => {
    const entry = custom.trim();
    if (!entry || values.includes(entry)) return;
    onChange([...values, entry]);
    setCustom("");
  };

  return (
    <div className="space-y-2">
      <div className="app-scrollbar max-h-72 space-y-0.5 overflow-y-auto rounded-lg border border-border bg-card p-2">
        {choices.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            Add choices to this field in Data Studio.
          </p>
        ) : (
          visible.map((choice) => {
            const depth = tree ? choice_depth(choice, byValue) : 0;
            const row_style = { paddingLeft: `${depth * 16 + 10}px` };
            return (
              <label
                key={`${String(choice.value)}-${choice.text}`}
                style={row_style}
                className="flex min-h-12 cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-card pr-3 pl-3 text-sm transition-colors hover:bg-muted"
              >
                <Checkbox
                  checked={values.includes(String(choice.value))}
                  disabled={disabled}
                  onCheckedChange={() => toggle(choice)}
                />
                <ChoiceMarker choice={choice} />
                <span className="min-w-0 flex-1 truncate">{choice.text}</span>
              </label>
            );
          })
        )}
      </div>

      {choices.length > itemsShown ? (
        <button
          type="button"
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
          onClick={() => setShowAll((current) => !current)}
        >
          {showAll ? "Show fewer" : `Show all ${choices.length} choices`}
        </button>
      ) : null}

      {customValues.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {customValues.map((entry) => (
            <Badge
              key={entry}
              variant="secondary"
              className="gap-1 rounded-md px-2 py-1 text-xs"
            >
              {entry}
              {!disabled ? (
                <button
                  type="button"
                  aria-label={`Remove ${entry}`}
                  onClick={() =>
                    onChange(values.filter((value) => value !== entry))
                  }
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </Badge>
          ))}
        </div>
      ) : null}

      {allowOther ? (
        <div className="flex items-center gap-2">
          <Input
            value={custom}
            disabled={disabled}
            placeholder="Add another option"
            className="h-13 rounded-lg border-input bg-card"
            onChange={(event) => setCustom(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add_custom();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            className="rounded-lg"
            disabled={disabled || custom.trim() === ""}
            onClick={add_custom}
          >
            <Plus className="size-4" />
            Add
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function CheckboxesInput(props: {
  field: CmsField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  return <CheckboxChoiceList {...props} />;
}

export function CheckboxesTreeInput(props: {
  field: CmsField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  return <CheckboxChoiceList {...props} tree />;
}

export function RadioInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: CmsField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const choices = field_choices(field);
  const allowOther = option_bool(field, false, "allowOther", "allow_other");
  const [custom, setCustom] = useState("");
  const selected = as_string(value);
  const is_custom =
    selected !== "" &&
    !choices.some((choice) => String(choice.value) === selected);

  return (
    <div className="space-y-2">
      <RadioGroup
        value={selected}
        disabled={disabled}
        onValueChange={(next) => onChange(next)}
        className="rounded-lg border border-border bg-card p-3"
      >
        {choices.length === 0 ? (
          <p className="py-2 text-center text-xs text-muted-foreground">
            Add choices to this field in Data Studio.
          </p>
        ) : (
          choices.map((choice) => (
            <label
              key={`${String(choice.value)}-${choice.text}`}
              className="flex cursor-pointer items-center gap-2.5 text-sm"
            >
              <RadioGroupItem value={String(choice.value)} />
              <ChoiceMarker choice={choice} />
              <span>{choice.text}</span>
            </label>
          ))
        )}
      </RadioGroup>

      {allowOther ? (
        <div className="flex items-center gap-2">
          <Input
            value={is_custom ? selected : custom}
            disabled={disabled}
            placeholder="Or enter a custom value"
            className="h-13 rounded-lg border-input bg-card"
            onChange={(event) => {
              setCustom(event.target.value);
              onChange(event.target.value);
            }}
          />
          {is_custom ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Clear custom value"
              disabled={disabled}
              onClick={() => {
                setCustom("");
                onChange("");
              }}
            >
              <X className="size-4" />
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function TagsInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: CmsField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const tags = as_string_array(value);
  const allowCustom = option_bool(field, true, "allowCustom", "allow_custom");
  const alphabetize = option_bool(field, false, "alphabetize");
  const iconRight = option_string(field, "iconRight", "icon_right");
  const suggestions = field_choices(field).map((choice) => choice.text);
  const [draft, setDraft] = useState("");

  const commit = (raw: string) => {
    const next = raw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (next.length === 0) return;
    let merged = [...tags];
    for (const entry of next) {
      if (!merged.includes(entry)) merged.push(entry);
    }
    if (alphabetize) merged = merged.sort((a, b) => a.localeCompare(b));
    onChange(merged);
    setDraft("");
  };

  const remove = (tag: string) => {
    onChange(tags.filter((entry) => entry !== tag));
  };

  return (
    <div className="space-y-2">
      <div className="flex min-h-13 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-card p-2">
        {tags.map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            className="gap-1 rounded-md px-2 py-1 text-xs"
          >
            {tag}
            {!disabled ? (
              <button
                type="button"
                aria-label={`Remove ${tag}`}
                onClick={() => remove(tag)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </Badge>
        ))}
        <Input
          value={draft}
          disabled={disabled}
          placeholder={allowCustom ? "Add tag and press Enter..." : "Choose a tag..."}
          className="h-7 min-w-32 flex-1 border-none bg-transparent p-1 text-xs shadow-none focus-visible:outline-none"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              if (allowCustom || suggestions.includes(draft.trim())) {
                commit(draft);
              }
            }
          }}
          onBlur={() => {
            if (allowCustom && draft.trim() !== "") commit(draft);
          }}
        />
        {iconRight ? (
          <DynamicIcon
            name={iconRight}
            size={14}
            className="shrink-0 text-muted-foreground"
          />
        ) : null}
      </div>

      {suggestions.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {suggestions
            .filter((suggestion) => !tags.includes(suggestion))
            .slice(0, 12)
            .map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                disabled={disabled}
                onClick={() => commit(suggestion)}
                className="rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                + {suggestion}
              </button>
            ))}
        </div>
      ) : null}
    </div>
  );
}

export function choice_summary(field: CmsField, value: unknown): string {
  const choices = field_choices(field);
  if (Array.isArray(value)) {
    return value.map((entry) => choice_label(choices, entry)).join(", ");
  }
  if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((entry) => choice_label(choices, entry)).join(", ");
      }
    } catch {
      // Fall through to the single value label.
    }
  }
  return choice_label(choices, value);
}
