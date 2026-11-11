"use client";

import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Boxes,
  Check,
  ChevronDown,
  Info,
  Link2,
  Loader2,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { cms_field_interface } from "@/modules/cms/cms-types";
import type {
  CmsCollectionWithFields,
  CmsField,
  CmsRepeaterField,
} from "@/modules/cms/cms-types";
import { cms_normalize_repeater_fields } from "@/modules/cms/cms-interfaces";
import { cms_call } from "../ui";
import {
  as_array,
  as_object,
  as_string,
  default_value_for_field,
  display_template,
  item_label,
  item_primary_key,
  option_array,
  option_bool,
  option_number,
  option_string,
  related_collection,
  type FieldRenderer,
} from "./types";

interface RelationCollection {
  name: string;
  label: string;
  primary_key: string;
  display_template: string;
  fields: CmsField[];
}

interface RelationResult {
  collection: RelationCollection;
  rows: Record<string, unknown>[];
  total: number;
}

interface RelationState {
  loading: boolean;
  error: string;
  collection: RelationCollection | null;
  rows: Record<string, unknown>[];
  total: number;
}

const EMPTY_RELATION: RelationState = {
  loading: false,
  error: "",
  collection: null,
  rows: [],
  total: 0,
};

function collection_hint(
  collections: CmsCollectionWithFields[],
  name: string
): CmsCollectionWithFields | null {
  return collections.find((collection) => collection.name === name) ?? null;
}

function useRelationOptions(
  collectionName: string,
  search: string,
  limit: number,
  enabled: boolean
): RelationState {
  const [state, setState] = useState<RelationState>(EMPTY_RELATION);

  useEffect(() => {
    if (!enabled || !collectionName) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setState((current) => ({ ...current, loading: true, error: "" }));
      void cms_call<RelationResult>("data_relation_options", {
        collection: collectionName,
        search: search.trim(),
        limit,
      })
        .then((result) => {
          if (cancelled) return;
          setState({
            loading: false,
            error: "",
            collection: result.collection,
            rows: Array.isArray(result.rows) ? result.rows : [],
            total: Number(result.total ?? 0),
          });
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setState({
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : "Could not load related items.",
            collection: null,
            rows: [],
            total: 0,
          });
        });
    }, search.trim() === "" ? 0 : 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [collectionName, enabled, limit, search]);

  return state;
}

function relation_id(value: unknown, primaryKey: string): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && !Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    const item = object.item;
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return as_string((item as Record<string, unknown>)[primaryKey]);
    }
    return as_string(
      object[primaryKey] ?? object.id ?? object.value ?? object.item
    );
  }
  return as_string(value);
}

function relation_ids(value: unknown, primaryKey: string): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => relation_id(entry, primaryKey))
      .filter((entry) => entry !== "");
  }
  if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      return relation_ids(JSON.parse(value) as unknown, primaryKey);
    } catch {
      return [];
    }
  }
  const single = relation_id(value, primaryKey);
  return single ? [single] : [];
}

function RelationTrigger({
  label,
  placeholder,
  open,
  disabled,
  hasValue,
}: {
  label: string;
  placeholder: string;
  open: boolean;
  disabled?: boolean;
  hasValue: boolean;
}) {
  return (
    <PopoverTrigger asChild>
      <button
        type="button"
        aria-expanded={open}
        disabled={disabled}
        className="flex min-h-13 w-full items-center justify-between gap-2 rounded-lg border border-input bg-card px-4 py-2 text-left text-sm text-foreground outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:shadow-[0_0_16px_-8px_var(--ring)] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
      >
        <span className={cn("min-w-0 flex-1 truncate", !hasValue && "text-muted-foreground")}>
          {hasValue ? label : placeholder}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </button>
    </PopoverTrigger>
  );
}

function RelationSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search related items..."
        className="h-9 rounded-lg border-input bg-card pl-8 text-xs"
      />
    </div>
  );
}

function RelationError({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-md border border-border bg-card p-2 text-xs text-destructive">
      {message}
    </p>
  );
}

function RelationEmpty({ loading }: { loading: boolean }) {
  if (loading) {
    return (
      <div className="flex h-20 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return (
    <div
      role="status"
      className="rounded-lg border border-border bg-card p-4 text-center text-xs text-muted-foreground"
    >
      No related items found.
    </div>
  );
}

export function RelationInput({
  field,
  value,
  onChange,
  disabled,
  collections = [],
}: {
  field: CmsField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  collections?: CmsCollectionWithFields[];
}) {
  const collectionName = related_collection(field);
  const hint = collection_hint(collections, collectionName);
  const template = display_template(field) || hint?.display_template || "";
  const allowNone = option_bool(field, true, "allowNone", "allow_none");
  const limit = Math.min(
    50,
    Math.max(1, option_number(field, 25, "limit"))
  );
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const state = useRelationOptions(collectionName, search, limit, true);
  const metadata = state.collection ?? hint;
  const pk = item_primary_key(metadata);
  const selectedId = relation_id(value, pk);
  const selectedRow = state.rows.find(
    (row) => String(row[pk]) === selectedId
  );
  const selectedLabel = selectedRow
    ? item_label(selectedRow, metadata, template)
    : selectedId
      ? `#${selectedId}`
      : "";

  if (!collectionName) {
    return (
      <div className="space-y-2">
        <Input
          value={selectedId}
          disabled={disabled}
          placeholder="Related item ID"
          className="h-13 rounded-lg border-input bg-card"
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <RelationTrigger
        label={selectedLabel}
        placeholder="Select an item..."
        open={open}
        disabled={disabled}
        hasValue={selectedLabel !== ""}
      />
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-2">
        <RelationSearch value={search} onChange={setSearch} />
        <div className="app-scrollbar max-h-64 space-y-0.5 overflow-y-auto pt-1">
          {allowNone ? (
            <button
              type="button"
              className="flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              <X className="size-3.5" />
              Clear selection
            </button>
          ) : null}
          {state.error ? <RelationError message={state.error} /> : null}
          {!state.error && state.rows.length === 0 ? (
            <RelationEmpty loading={state.loading} />
          ) : (
            state.rows.map((row) => {
              const id = String(row[pk] ?? "");
              const label = item_label(row, metadata, template);
              const selected = id === selectedId;
              return (
                <button
                  key={id}
                  type="button"
                  className={cn(
                    "flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted",
                    selected && "bg-muted"
                  )}
                  onClick={() => {
                    onChange(
                      field.type === "integer" || field.type === "relation"
                        ? Number(id)
                        : id
                    );
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  {selected ? <Check className="size-4 shrink-0" /> : null}
                </button>
              );
            })
          )}
        </div>
        {state.total > state.rows.length ? (
          <p className="px-1 pt-1 text-xs text-muted-foreground">
            Showing {state.rows.length} of {state.total}. Search to narrow the
            list.
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

export function RelationMultiInput({
  field,
  value,
  onChange,
  disabled,
  collections = [],
}: {
  field: CmsField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  collections?: CmsCollectionWithFields[];
}) {
  const collectionName = related_collection(field);
  const hint = collection_hint(collections, collectionName);
  const template = display_template(field) || hint?.display_template || "";
  const limit = Math.min(
    50,
    Math.max(1, option_number(field, 25, "limit"))
  );
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const state = useRelationOptions(collectionName, search, limit, true);
  const metadata = state.collection ?? hint;
  const pk = item_primary_key(metadata);
  const ids = relation_ids(value, pk);
  const label_map = new Map<string, string>();
  for (const row of state.rows) {
    label_map.set(String(row[pk] ?? ""), item_label(row, metadata, template));
  }

  if (!collectionName) {
    return (
      <div className="space-y-2">
        <Textarea
          value={Array.isArray(value) ? value.map(String).join(", ") : as_string(value)}
          disabled={disabled}
          rows={2}
          placeholder="Related item IDs, separated by commas"
          className="rounded-lg border-input bg-card font-mono text-xs"
          onChange={(event) =>
            onChange(
              event.target.value
                .split(",")
                .map((entry) => entry.trim())
                .filter(Boolean)
            )
          }
        />
      </div>
    );
  }

  const toggle = (id: string) => {
    if (ids.includes(id)) {
      onChange(ids.filter((entry) => entry !== id));
    } else {
      onChange([...ids, id]);
    }
  };

  return (
    <div className="space-y-2">
      {ids.length === 0 ? (
        <div
          role="status"
          className="flex min-h-13 items-center gap-3 rounded-xl border border-border bg-card px-4 text-sm text-foreground"
        >
          <Info className="size-5 shrink-0" />
          <span>No items</span>
        </div>
      ) : (
        <div className="space-y-1.5">
          {ids.map((id) => {
            const label = label_map.get(id) ?? `#${id}`;
            return (
              <div
                key={id}
                className="flex min-h-13 items-center gap-3 rounded-xl border border-input bg-card px-4 text-sm text-foreground"
              >
                <span className="min-w-0 flex-1 truncate">{label}</span>
                {!disabled ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${label}`}
                    onClick={() => toggle(id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="lg"
            className="w-full justify-start"
            disabled={disabled}
          >
            <Plus className="size-4" />
            Add existing
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-2">
          <RelationSearch value={search} onChange={setSearch} />
          <div className="app-scrollbar max-h-64 space-y-0.5 overflow-y-auto pt-1">
            {state.error ? <RelationError message={state.error} /> : null}
            {!state.error && state.rows.length === 0 ? (
              <RelationEmpty loading={state.loading} />
            ) : (
              state.rows.map((row) => {
                const id = String(row[pk] ?? "");
                const label = item_label(row, metadata, template);
                return (
                  <label
                    key={id}
                    className="flex min-h-12 cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-sm transition-colors hover:bg-muted"
                  >
                    <Checkbox
                      checked={ids.includes(id)}
                      disabled={disabled}
                      onCheckedChange={() => toggle(id)}
                    />
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                  </label>
                );
              })
            )}
          </div>
          {state.total > state.rows.length ? (
            <p className="px-1 pt-1 text-xs text-muted-foreground">
              Showing {state.rows.length} of {state.total}. Search to narrow the
              list.
            </p>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function sort_tree_rows(
  rows: Record<string, unknown>[],
  pk: string,
  parentField: string
): Array<{ row: Record<string, unknown>; depth: number }> {
  const byId = new Map<string, Record<string, unknown>>();
  for (const row of rows) byId.set(String(row[pk] ?? ""), row);
  const children = new Map<string, Record<string, unknown>[]>();
  const roots: Record<string, unknown>[] = [];
  for (const row of rows) {
    const parent = row[parentField];
    const parentId = parent === null || parent === undefined ? "" : String(parent);
    if (parentId && byId.has(parentId)) {
      const list = children.get(parentId) ?? [];
      list.push(row);
      children.set(parentId, list);
    } else {
      roots.push(row);
    }
  }
  const result: Array<{ row: Record<string, unknown>; depth: number }> = [];
  const visit = (row: Record<string, unknown>, depth: number, seen: Set<string>) => {
    const id = String(row[pk] ?? "");
    if (seen.has(id)) return;
    seen.add(id);
    result.push({ row, depth });
    for (const child of children.get(id) ?? []) visit(child, depth + 1, seen);
  };
  const seen = new Set<string>();
  for (const root of roots) visit(root, 0, seen);
  for (const row of rows) visit(row, 0, seen);
  return result;
}

export function TreeRelationInput({
  field,
  value,
  onChange,
  disabled,
  collections = [],
}: {
  field: CmsField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  collections?: CmsCollectionWithFields[];
}) {
  const collectionName = related_collection(field);
  const hint = collection_hint(collections, collectionName);
  const template = display_template(field) || hint?.display_template || "";
  const parentField = option_string(field, "parentField", "parent_field") || "parent";
  const allowNone = option_bool(field, true, "allowNone", "allow_none");
  const limit = 50;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const state = useRelationOptions(collectionName, search, limit, true);
  const metadata = state.collection ?? hint;
  const pk = item_primary_key(metadata);
  const selectedId = relation_id(value, pk);
  const tree = sort_tree_rows(state.rows, pk, parentField);
  const selected = state.rows.find((row) => String(row[pk]) === selectedId);

  if (!collectionName) {
    return (
      <RelationInput
        field={field}
        value={value}
        onChange={onChange}
        disabled={disabled}
        collections={collections}
      />
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <RelationTrigger
        label={selected ? item_label(selected, metadata, template) : selectedId ? `#${selectedId}` : ""}
        placeholder="Select a tree item..."
        open={open}
        disabled={disabled}
        hasValue={selectedId !== ""}
      />
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-2">
        <RelationSearch value={search} onChange={setSearch} />
        <div className="app-scrollbar max-h-64 space-y-0.5 overflow-y-auto pt-1">
          {allowNone ? (
            <button
              type="button"
              className="flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              <X className="size-3.5" />
              Clear selection
            </button>
          ) : null}
          {state.error ? <RelationError message={state.error} /> : null}
          {!state.error && tree.length === 0 ? (
            <RelationEmpty loading={state.loading} />
          ) : (
            tree.map(({ row, depth }) => {
              const id = String(row[pk] ?? "");
              const row_style = { paddingLeft: `${depth * 16 + 10}px` };
              return (
                <button
                  key={id}
                  type="button"
                  style={row_style}
                  className={cn(
                    "flex min-h-9 w-full items-center gap-2 rounded-md pr-2.5 py-2 text-left text-sm transition-colors hover:bg-muted",
                    id === selectedId && "bg-muted"
                  )}
                  onClick={() => {
                    onChange(
                      field.type === "integer" ? Number(id) : id
                    );
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {item_label(row, metadata, template)}
                  </span>
                  {id === selectedId ? <Check className="size-4 shrink-0" /> : null}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface BuilderBlock {
  collection: string;
  item: string;
  label: string;
}

function read_builder_blocks(value: unknown): BuilderBlock[] {
  return as_array(value)
    .map((entry): BuilderBlock | null => {
      const object = as_object(entry);
      const collection = as_string(
        object.collection ?? object.collection_name ?? object.name
      );
      if (!collection) return null;
      const itemObject = as_object(object.item);
      const item = as_string(
        object.item && typeof object.item === "object"
          ? itemObject.id ?? itemObject.value
          : object.item ?? object.id ?? object.value
      );
      return {
        collection,
        item,
        label: as_string(object.label ?? object.title),
      };
    })
    .filter((entry): entry is BuilderBlock => entry !== null);
}

export function BuilderInput({
  field,
  value,
  onChange,
  disabled,
  collections = [],
}: {
  field: CmsField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  collections?: CmsCollectionWithFields[];
}) {
  const blocks = read_builder_blocks(value);
  const configured = option_array(field, "allowedCollections", "allowed_collections", "collections")
    .map((entry) => (typeof entry === "string" ? entry : as_string(as_object(entry).collection)))
    .filter(Boolean);
  const available = (configured.length > 0
    ? collections.filter((collection) => configured.includes(collection.name))
    : collections
  ).filter((collection) => !collection.system);
  const [collectionName, setCollectionName] = useState(
    available[0]?.name ?? ""
  );
  const selectedCollection =
    collections.find((collection) => collection.name === collectionName) ?? null;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const state = useRelationOptions(
    collectionName,
    search,
    Math.min(50, Math.max(1, option_number(field, 25, "limit"))),
    true
  );
  const metadata = state.collection ?? selectedCollection;
  const pk = item_primary_key(metadata);

  const add_block = (id: unknown) => {
    const row = state.rows.find((entry) => String(entry[pk]) === String(id));
    const label = row ? item_label(row, metadata, display_template(field)) : `#${String(id)}`;
    if (blocks.some((block) => block.collection === collectionName && block.item === String(id))) {
      return;
    }
    onChange([
      ...blocks,
      { collection: collectionName, item: String(id), label },
    ]);
  };

  return (
    <div className="space-y-2">
      {blocks.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-4 text-center text-xs text-muted-foreground">
          No blocks yet. Choose a collection and add its first item.
        </div>
      ) : (
        blocks.map((block, index) => {
          const collection =
            collections.find((entry) => entry.name === block.collection) ?? null;
          return (
            <div
              key={`${block.collection}-${block.item}-${index}`}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-2.5"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-surface-subtle text-muted-foreground">
                <Boxes className="size-4" strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {block.label || `#${block.item}`}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {collection?.label || block.collection} · #{block.item}
                </p>
              </div>
              <div className="flex items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Move block up"
                  disabled={disabled || index === 0}
                  onClick={() => {
                    const next = [...blocks];
                    const [item] = next.splice(index, 1);
                    next.splice(index - 1, 0, item);
                    onChange(next);
                  }}
                >
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Move block down"
                  disabled={disabled || index === blocks.length - 1}
                  onClick={() => {
                    const next = [...blocks];
                    const [item] = next.splice(index, 1);
                    next.splice(index + 1, 0, item);
                    onChange(next);
                  }}
                >
                  <ArrowDown className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Remove block"
                  disabled={disabled}
                  onClick={() => onChange(blocks.filter((_, i) => i !== index))}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          );
        })
      )}

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <select
          value={collectionName}
          disabled={disabled || available.length === 0}
          onChange={(event) => setCollectionName(event.target.value)}
          className="h-13 rounded-lg border border-input bg-card px-4 text-sm text-foreground outline-none disabled:bg-muted disabled:text-muted-foreground"
        >
          {available.length === 0 ? (
            <option value="">No collections</option>
          ) : (
            available.map((collection) => (
              <option key={collection.name} value={collection.name}>
                {collection.label || collection.name}
              </option>
            ))
          )}
        </select>

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled || !collectionName}
              className="flex h-13 w-full items-center justify-between gap-2 rounded-lg border border-input bg-card px-4 text-left text-sm text-muted-foreground outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:shadow-[0_0_16px_-8px_var(--ring)] disabled:cursor-not-allowed disabled:bg-muted"
            >
              <span className="truncate">Add item...</span>
              <Plus className="size-4 shrink-0" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-2">
            <RelationSearch value={search} onChange={setSearch} />
            <div className="app-scrollbar max-h-64 space-y-0.5 overflow-y-auto pt-1">
              {state.error ? <RelationError message={state.error} /> : null}
              {!state.error && state.rows.length === 0 ? (
                <RelationEmpty loading={state.loading} />
              ) : (
                state.rows.map((row) => {
                  const id = String(row[pk] ?? "");
                  const label = item_label(row, metadata, display_template(field));
                  return (
                    <button
                      key={id}
                      type="button"
                      className="flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted"
                      onClick={() => {
                        add_block(id);
                        setOpen(false);
                      }}
                    >
                      <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                    </button>
                  );
                })
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

function repeater_subfield(
  parent: CmsField,
  subfield: CmsRepeaterField,
  index: number
): CmsField {
  const type = subfield.type ?? "string";
  return {
    id: parent.id * 1000 + index,
    collection_id: parent.collection_id,
    name: subfield.field,
    label: subfield.name || subfield.field,
    type,
    interface: subfield.interface ?? cms_field_interface(type),
    options: subfield.options ?? {},
    required: subfield.required === true,
    unique: false,
    hidden: false,
    readonly: false,
    validation: { match: "all", conditions: [] },
    validation_message: "",
    conditions: [],
    display_options: {},
    clear_hidden_value_on_save: false,
    group: null,
    sort: index,
    created_at: parent.created_at,
    updated_at: parent.updated_at,
  };
}

export function RepeaterInput({
  field,
  value,
  onChange,
  disabled,
  renderField,
}: {
  field: CmsField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  renderField: FieldRenderer;
}) {
  const subfields = cms_normalize_repeater_fields(field.options?.fields);
  const items = as_array(value).map((entry) => as_object(entry));
  const addLabel = option_string(field, "addLabel", "add_label") || "Create New";

  const update = (index: number, name: string, next: unknown) => {
    onChange(
      items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [name]: next } : item
      )
    );
  };

  const add = () => {
    const empty: Record<string, unknown> = {};
    for (const subfield of subfields) {
      const synthetic = repeater_subfield(field, subfield, 0);
      empty[subfield.field] = default_value_for_field(synthetic);
    }
    onChange([...items, empty]);
  };

  return (
    <div className="space-y-2">
      {subfields.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-4 text-center text-xs text-muted-foreground">
          Configure the repeater sub-fields in Data Studio first.
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-4 text-center text-xs text-muted-foreground">
          No items yet.
        </div>
      ) : (
        items.map((item, index) => (
          <div
            key={index}
            className="rounded-lg border border-border bg-card p-3"
          >
            <div className="mb-3 flex items-center justify-between gap-2 border-b border-border pb-2">
              <span className="text-xs font-semibold text-muted-foreground">
                Item {index + 1}
              </span>
              <div className="flex items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Move item up"
                  disabled={disabled || index === 0}
                  onClick={() => {
                    const next = [...items];
                    const [entry] = next.splice(index, 1);
                    next.splice(index - 1, 0, entry);
                    onChange(next);
                  }}
                >
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Move item down"
                  disabled={disabled || index === items.length - 1}
                  onClick={() => {
                    const next = [...items];
                    const [entry] = next.splice(index, 1);
                    next.splice(index + 1, 0, entry);
                    onChange(next);
                  }}
                >
                  <ArrowDown className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Remove item"
                  disabled={disabled}
                  onClick={() => onChange(items.filter((_, i) => i !== index))}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {subfields.map((subfield, subfieldIndex) => {
                const synthetic = repeater_subfield(
                  field,
                  subfield,
                  subfieldIndex
                );
                return (
                  <div
                    key={subfield.field}
                    className={cn(
                      "grid gap-2",
                      subfield.width === "full" && "sm:col-span-2"
                    )}
                  >
                    <span className="flex items-center gap-1 text-xs font-semibold text-foreground">
                      {synthetic.label || synthetic.name}
                      {synthetic.required ? (
                        <span className="text-destructive">*</span>
                      ) : null}
                    </span>
                    {renderField(
                      synthetic,
                      item[subfield.field],
                      (next) => update(index, subfield.field, next)
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      <Button
        type="button"
        variant="outline"
        className="rounded-lg"
        disabled={disabled || subfields.length === 0}
        onClick={add}
      >
        <Plus className="size-4" />
        {addLabel}
      </Button>
    </div>
  );
}

interface TranslationLanguage {
  code: string;
  label: string;
}

function translation_languages(field: CmsField): TranslationLanguage[] {
  const configured = option_array(field, "languages");
  const languages = configured
    .map((entry): TranslationLanguage | null => {
      if (typeof entry === "string") return { code: entry, label: entry };
      const object = as_object(entry);
      const code = as_string(object.code ?? object.value ?? object.language);
      if (!code) return null;
      return { code, label: as_string(object.label ?? object.name) || code };
    })
    .filter((entry): entry is TranslationLanguage => entry !== null);
  if (languages.length > 0) return languages;
  return [{ code: "en", label: "English" }];
}

export function TranslationsInput({
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
  const languages = translation_languages(field);
  const defaultLanguage = option_string(field, "defaultLanguage", "default_language") || languages[0].code;
  const translations = as_object(value);
  const [active, setActive] = useState(defaultLanguage);
  const current = active;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1">
        {languages.map((language) => (
          <Button
            key={language.code}
            type="button"
            variant={current === language.code ? "secondary" : "ghost"}
            size="sm"
            className="h-8 rounded-md px-2.5 text-xs"
            aria-pressed={current === language.code}
            disabled={disabled}
            onClick={() => setActive(language.code)}
          >
            {language.label}
            {language.code === defaultLanguage ? (
              <Badge variant="outline" className="ml-1 px-1 py-0 text-xs">
                Default
              </Badge>
            ) : null}
          </Button>
        ))}
      </div>
      <Textarea
        value={as_string(translations[current])}
        disabled={disabled}
        rows={5}
        placeholder={`Content in ${languages.find((language) => language.code === current)?.label ?? current}`}
        className="rounded-lg border-input bg-card"
        onChange={(event) =>
          onChange({
            ...translations,
            [current]: event.target.value,
          })
        }
      />
    </div>
  );
}
