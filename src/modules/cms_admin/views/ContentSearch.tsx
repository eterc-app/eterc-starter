"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Filter,
  GripVertical,
  Plus,
  Search,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { CmsField } from "@/modules/cms/cms-types";
import { is_alias_field } from "./field-inputs/types";

export type FilterOperator =
  | "_eq"
  | "_neq"
  | "_contains"
  | "_not_contains"
  | "_icontains"
  | "_starts_with"
  | "_not_starts_with"
  | "_not_istarts_with"
  | "_ends_with"
  | "_not_ends_with"
  | "_iends_with"
  | "_not_iends_with"
  | "_ieq"
  | "_nieq"
  | "_gt"
  | "_gte"
  | "_lt"
  | "_lte"
  | "_empty"
  | "_nempty"
  | "_null"
  | "_nnull"
  | "_in"
  | "_not_in";

export type FilterJunction = "and" | "or";

export interface FilterCondition {
  kind: "condition";
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
}

export interface FilterGroup {
  kind: "group";
  id: string;
  junction: FilterJunction;
  children: FilterNode[];
}

export type FilterNode = FilterCondition | FilterGroup;

const filter_operators: { value: FilterOperator; label: string }[] = [
  { value: "_contains", label: "Contains" },
  { value: "_not_contains", label: "Doesn't contain" },
  { value: "_icontains", label: "Contains (insensitive)" },
  { value: "_starts_with", label: "Starts with" },
  { value: "_not_starts_with", label: "Doesn't start with" },
  { value: "_not_istarts_with", label: "Doesn't start with (insensitive)" },
  { value: "_ends_with", label: "Ends with" },
  { value: "_not_ends_with", label: "Doesn't end with" },
  { value: "_iends_with", label: "Ends with (insensitive)" },
  { value: "_not_iends_with", label: "Doesn't end with (insensitive)" },
  { value: "_eq", label: "Equals" },
  { value: "_neq", label: "Doesn't equal" },
  { value: "_ieq", label: "Equals (insensitive)" },
  { value: "_nieq", label: "Doesn't equal (insensitive)" },
  { value: "_gt", label: "Greater than" },
  { value: "_gte", label: "Greater than or equal" },
  { value: "_lt", label: "Less than" },
  { value: "_lte", label: "Less than or equal" },
  { value: "_empty", label: "Is empty" },
  { value: "_nempty", label: "Isn't empty" },
  { value: "_null", label: "Is null" },
  { value: "_nnull", label: "Isn't null" },
  { value: "_in", label: "Is one of" },
  { value: "_not_in", label: "Is not one of" },
];

const text_operators: FilterOperator[] = [
  "_contains",
  "_not_contains",
  "_icontains",
  "_starts_with",
  "_not_starts_with",
  "_not_istarts_with",
  "_ends_with",
  "_not_ends_with",
  "_iends_with",
  "_not_iends_with",
  "_eq",
  "_neq",
  "_ieq",
  "_nieq",
  "_in",
  "_not_in",
  "_empty",
  "_nempty",
  "_null",
  "_nnull",
];

const numeric_operators: FilterOperator[] = [
  "_eq",
  "_neq",
  "_gt",
  "_gte",
  "_lt",
  "_lte",
  "_in",
  "_not_in",
  "_null",
  "_nnull",
];

const date_operators: FilterOperator[] = [
  "_eq",
  "_neq",
  "_gt",
  "_gte",
  "_lt",
  "_lte",
  "_null",
  "_nnull",
];

const boolean_operators: FilterOperator[] = ["_eq", "_neq", "_null", "_nnull"];

const select_operators: FilterOperator[] = [
  "_eq",
  "_neq",
  "_ieq",
  "_nieq",
  "_in",
  "_not_in",
  "_empty",
  "_nempty",
  "_null",
  "_nnull",
];

function filter_operators_for_field(field?: CmsField) {
  if (!field) return filter_operators;
  let allowed: FilterOperator[];
  switch (field.type) {
    case "integer":
    case "decimal":
      allowed = numeric_operators;
      break;
    case "datetime":
      allowed = date_operators;
      break;
    case "boolean":
      allowed = boolean_operators;
      break;
    case "select":
      allowed = select_operators;
      break;
    case "json":
      allowed = ["_null", "_nnull"];
      break;
    default:
      allowed = text_operators;
  }
  return filter_operators.filter((operator) =>
    allowed.includes(operator.value)
  );
}

export function filter_requires_value(operator: FilterOperator): boolean {
  return !["_empty", "_nempty", "_null", "_nnull"].includes(operator);
}

function filter_list_values(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function new_filter_id(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function filter_group_targets(
  group: FilterGroup,
  root = true
): { id: string; label: string }[] {
  const targets = root
    ? [{ id: group.id, label: "All filters" }]
    : [
        {
          id: group.id,
          label: `${group.junction.toUpperCase()} group — ${
            group.junction === "and"
              ? "All of the following"
              : "Any of the following"
          }`,
        },
      ];
  return [
    ...targets,
    ...group.children.flatMap((node) =>
      node.kind === "group" ? filter_group_targets(node, false) : []
    ),
  ];
}

export function create_filter_group(
  junction: FilterJunction = "and"
): FilterGroup {
  return {
    kind: "group",
    id: new_filter_id("group"),
    junction,
    children: [],
  };
}

export function create_filter_condition(field: CmsField): FilterCondition {
  return {
    kind: "condition",
    id: new_filter_id("condition"),
    field: field.name,
    operator: default_filter_operator(field),
    value: "",
  };
}

function default_filter_operator(field?: CmsField): FilterOperator {
  if (!field) return "_contains";
  if (
    field.type === "integer" ||
    field.type === "decimal" ||
    field.type === "datetime" ||
    field.type === "boolean" ||
    field.type === "select"
  ) {
    return "_eq";
  }
  return "_contains";
}

function filter_value_kind(
  field?: CmsField
): "text" | "number" | "boolean" | "date" {
  if (!field) return "text";
  if (field.type === "integer" || field.type === "decimal") return "number";
  if (field.type === "boolean") return "boolean";
  if (field.type === "datetime") return "date";
  return "text";
}

function valid_filter_condition(
  condition: FilterCondition,
  fields: CmsField[]
): boolean {
  const field = fields.find((item) => item.name === condition.field);
  if (!field) return false;
  if (!filter_requires_value(condition.operator)) return true;
  const is_list =
    condition.operator === "_in" || condition.operator === "_not_in";
  const values = is_list
    ? filter_list_values(condition.value)
    : [condition.value.trim()];
  if (values.length === 0) return false;
  if (field.type === "integer" || field.type === "decimal") {
    return values.every(
      (value) => value !== "" && !Number.isNaN(Number(value))
    );
  }
  if (field.type === "boolean") {
    return values.every((value) =>
      ["true", "false", "1", "0", "yes", "no", "on", "off"].includes(
        value.toLowerCase()
      )
    );
  }
  return true;
}

function filter_scalar_value(
  field: CmsField | undefined,
  raw: string
): unknown {
  if (!field) return raw;
  if (field.type === "integer" || field.type === "decimal") {
    return Number(raw);
  }
  if (field.type === "boolean") {
    const normalized = raw.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return 1;
    if (["false", "0", "no", "off"].includes(normalized)) return 0;
  }
  return raw;
}

function condition_filter_payload(
  condition: FilterCondition,
  fields: CmsField[]
): Record<string, unknown> | null {
  if (!valid_filter_condition(condition, fields)) return null;
  const field = fields.find((item) => item.name === condition.field);
  let value: unknown = condition.value;
  if (!filter_requires_value(condition.operator)) {
    value = true;
  } else if (
    condition.operator === "_in" ||
    condition.operator === "_not_in"
  ) {
    value = filter_list_values(condition.value).map((item) =>
      filter_scalar_value(field, item)
    );
  } else {
    value = filter_scalar_value(field, condition.value);
  }
  return { [condition.field]: { [condition.operator]: value } };
}

export function filter_group_payload(
  group: FilterGroup,
  fields: CmsField[]
): Record<string, unknown> | undefined {
  const conditions: Record<string, unknown>[] = [];
  for (const node of group.children) {
    if (node.kind === "group") {
      const nested = filter_group_payload(node, fields);
      if (nested) conditions.push(nested);
      continue;
    }
    const payload = condition_filter_payload(node, fields);
    if (payload) conditions.push(payload);
  }
  if (conditions.length === 0) return undefined;
  return {
    [group.junction === "and" ? "_and" : "_or"]: conditions,
  };
}

export function filter_conditions(group: FilterGroup): FilterCondition[] {
  return group.children.flatMap((node) =>
    node.kind === "group" ? filter_conditions(node) : [node]
  );
}

export function add_filter_node(
  group: FilterGroup,
  parentId: string,
  node: FilterNode
): FilterGroup {
  if (group.id === parentId) {
    return { ...group, children: [...group.children, node] };
  }
  return {
    ...group,
    children: group.children.map((child) =>
      child.kind === "group" ? add_filter_node(child, parentId, node) : child
    ),
  };
}

export function remove_filter_node(
  group: FilterGroup,
  nodeId: string
): FilterGroup {
  return {
    ...group,
    children: group.children
      .filter((node) => node.id !== nodeId)
      .map((node) =>
        node.kind === "group" ? remove_filter_node(node, nodeId) : node
      ),
  };
}

export function update_filter_condition(
  group: FilterGroup,
  conditionId: string,
  changes: Partial<
    Pick<FilterCondition, "field" | "operator" | "value">
  >
): FilterGroup {
  return {
    ...group,
    children: group.children.map((node) => {
      if (node.kind === "condition") {
        return node.id === conditionId ? { ...node, ...changes } : node;
      }
      return update_filter_condition(node, conditionId, changes);
    }),
  };
}

export function set_filter_group_junction(
  group: FilterGroup,
  groupId: string,
  junction: FilterJunction
): FilterGroup {
  if (group.id === groupId) return { ...group, junction };
  return {
    ...group,
    children: group.children.map((node) =>
      node.kind === "group"
        ? set_filter_group_junction(node, groupId, junction)
        : node
    ),
  };
}

function reorder_within_group(
  group: FilterGroup,
  fromId: string,
  toId: string
): FilterGroup | null {
  const fromIndex = group.children.findIndex((node) => node.id === fromId);
  const toIndex = group.children.findIndex((node) => node.id === toId);
  if (fromIndex >= 0 && toIndex >= 0) {
    if (fromIndex === toIndex) return group;
    const children = [...group.children];
    const [moved] = children.splice(fromIndex, 1);
    children.splice(toIndex, 0, moved);
    return { ...group, children };
  }
  for (let index = 0; index < group.children.length; index += 1) {
    const node = group.children[index];
    if (node.kind !== "group") continue;
    const updated = reorder_within_group(node, fromId, toId);
    if (updated) {
      const children = [...group.children];
      children[index] = updated;
      return { ...group, children };
    }
  }
  return null;
}

export function reorder_filter_nodes(
  group: FilterGroup,
  fromId: string,
  toId: string
): FilterGroup {
  return reorder_within_group(group, fromId, toId) ?? group;
}

/* -------------------------------------------------------------------------- */
/* Field picker                                                               */
/* -------------------------------------------------------------------------- */

export function AddFilterMenu({
  groupId,
  targetGroups,
  fields,
  onAddCondition,
  onAddGroup,
}: {
  groupId: string;
  targetGroups: { id: string; label: string }[];
  fields: CmsField[];
  onAddCondition: (groupId: string, field: CmsField) => string | void;
  onAddGroup: (groupId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [targetGroupId, setTargetGroupId] = useState(groupId);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedRef = useRef(false);

  const picker = useMemo(() => {
    const groupNames = new Set<string>();
    for (const field of fields) {
      if (field.group) groupNames.add(field.group);
    }

    const groups = new Map<
      string,
      { name: string; label: string; sort: number; children: CmsField[] }
    >();
    for (const field of fields) {
      if (!field.group || is_alias_field(field)) continue;
      const parent = fields.find((item) => item.name === field.group);
      const entry = groups.get(field.group) ?? {
        name: field.group,
        label: parent?.label || field.group,
        sort: parent?.sort ?? field.sort,
        children: [],
      };
      entry.children.push(field);
      groups.set(field.group, entry);
    }

    const topLevel = fields.filter(
      (field) =>
        !field.group &&
        !is_alias_field(field) &&
        !groupNames.has(field.name)
    );

    const entries: (
      | { type: "field"; field: CmsField; sort: number }
      | {
          type: "group";
          group: { name: string; label: string; children: CmsField[] };
          sort: number;
        }
    )[] = [
      ...topLevel.map((field) => ({
        type: "field" as const,
        field,
        sort: field.sort,
      })),
      ...[...groups.values()].map((group) => ({
        type: "group" as const,
        group,
        sort: group.sort,
      })),
    ].sort((left, right) => left.sort - right.sort);

    const searchable = fields
      .filter((field) => !is_alias_field(field))
      .sort((left, right) => left.sort - right.sort);

    return { entries, searchable, groups };
  }, [fields]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, activeGroup]);

  const close = () => {
    setOpen(false);
    setQuery("");
    setActiveGroup(null);
    setTargetGroupId(groupId);
  };

  const choose_field = (field: CmsField) => {
    selectedRef.current = true;
    onAddCondition(targetGroupId, field);
    close();
  };

  const add_group = () => {
    selectedRef.current = true;
    onAddGroup(targetGroupId);
    close();
  };

  const normalized_query = query.trim().toLowerCase();
  const active_group = activeGroup
    ? picker.groups.get(activeGroup) ?? null
    : null;

  const search_matches = normalized_query
    ? picker.searchable.filter((field) =>
        (field.label || field.name)
          .toLowerCase()
          .includes(normalized_query)
      )
    : [];

  const group_matches = active_group
    ? active_group.children.filter(
        (field) =>
          !normalized_query ||
          (field.label || field.name)
            .toLowerCase()
            .includes(normalized_query)
      )
    : [];

  const empty_results =
    (active_group ? group_matches.length === 0 : search_matches.length === 0) &&
    Boolean(normalized_query);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
          setActiveGroup(null);
          setTargetGroupId(groupId);
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-expanded={open}
          className="flex h-8 w-full items-center gap-2 rounded-xl border border-border bg-card px-2.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted"
        >
          <Plus className="size-3.5" />
          <span>Add Filter</span>
          <ChevronDown
            className={cn(
              "ml-auto size-3.5 transition-transform",
              open && "rotate-180"
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={6}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => {
          if (!selectedRef.current) return;
          selectedRef.current = false;
          event.preventDefault();
        }}
        className="!w-[21.25rem] max-w-[calc(100vw-2rem)] gap-0 rounded-xl p-1"
      >
        {active_group ? (
          <button
            type="button"
            onClick={() => {
              setActiveGroup(null);
              setQuery("");
            }}
            className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-semibold hover:bg-accent"
          >
            <ArrowLeft className="size-4 text-muted-foreground" />
            <span className="truncate">{active_group.label}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={add_group}
            className="flex min-h-9 w-full items-center rounded-md px-2 text-left text-sm font-semibold hover:bg-accent"
          >
            And / Or group
          </button>
        )}

        <div className="my-1 h-px bg-border" />

        {targetGroups.length > 1 ? (
          <div className="flex items-center gap-2 px-2 py-1">
            <span className="shrink-0 text-xs text-muted-foreground">
              Add to
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="min-w-0 truncate rounded px-1.5 py-1 text-left text-xs font-medium hover:bg-accent"
                >
                  {targetGroups.find((group) => group.id === targetGroupId)
                    ?.label ?? "All filters"}
                  <ChevronDown className="ml-1 inline size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-64 w-64 overflow-y-auto">
                {targetGroups.map((group) => (
                  <DropdownMenuItem
                    key={group.id}
                    onSelect={() => setTargetGroupId(group.id)}
                  >
                    {group.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}

        <div className="px-1 pb-1">
          <div className="relative flex h-9 items-center rounded-lg border border-input bg-card focus-within:border-foreground">
            <Input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  close();
                }
              }}
              placeholder="Search"
              aria-label="Search fields"
              className="h-full rounded-lg border-0 bg-transparent pl-2.5 pr-8 text-sm shadow-none focus-visible:border-0 focus-visible:shadow-none"
            />
            <Search className="pointer-events-none absolute right-2.5 size-4 text-muted-foreground" />
          </div>
        </div>

        <div className="app-scrollbar max-h-64 overflow-y-auto p-1">
          {active_group
            ? group_matches.map((field) => (
                <button
                  key={field.name}
                  type="button"
                  onClick={() => choose_field(field)}
                  className="flex min-h-9 w-full items-center rounded-md px-2 text-left text-sm font-medium hover:bg-accent"
                >
                  {field.label || field.name}
                </button>
              ))
            : normalized_query
              ? search_matches.map((field) => (
                  <button
                    key={field.name}
                    type="button"
                    onClick={() => choose_field(field)}
                    className="flex min-h-9 w-full items-center rounded-md px-2 text-left text-sm font-medium hover:bg-accent"
                  >
                    {field.label || field.name}
                  </button>
                ))
              : picker.entries.map((entry) =>
                  entry.type === "field" ? (
                    <button
                      key={entry.field.name}
                      type="button"
                      onClick={() => choose_field(entry.field)}
                      className="flex min-h-9 w-full items-center rounded-md px-2 text-left text-sm font-medium hover:bg-accent"
                    >
                      {entry.field.label || entry.field.name}
                    </button>
                  ) : (
                    <button
                      key={entry.group.name}
                      type="button"
                      onClick={() => {
                        setActiveGroup(entry.group.name);
                        setQuery("");
                      }}
                      className="flex min-h-9 w-full items-center rounded-md px-2 text-left text-sm font-medium hover:bg-accent"
                    >
                      <span className="truncate">{entry.group.label}</span>
                      <ChevronRight className="ml-auto size-4 text-muted-foreground" />
                    </button>
                  )
                )}
          {empty_results ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              No fields found.
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* -------------------------------------------------------------------------- */
/* Filter chips                                                               */
/* -------------------------------------------------------------------------- */

function FilterConditionRow({
  condition,
  fields,
  autoFocus,
  dragging,
  onChange,
  onRemove,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  condition: FilterCondition;
  fields: CmsField[];
  autoFocus: boolean;
  dragging: boolean;
  onChange: (
    id: string,
    changes: Partial<
      Pick<FilterCondition, "field" | "operator" | "value">
    >,
    commit?: boolean
  ) => void;
  onRemove: (id: string) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
}) {
  const valueRef = useRef<HTMLInputElement>(null);
  const field = fields.find((item) => item.name === condition.field);
  const operators = filter_operators_for_field(field);
  const operator_label =
    filter_operators.find((item) => item.value === condition.operator)
      ?.label ?? condition.operator;
  const remove_filter_button = (
    <button
      type="button"
      aria-label="Remove filter"
      title="Remove filter"
      onClick={() => onRemove(condition.id)}
      className="grid size-4 shrink-0 place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover/filter-row:opacity-100 focus-visible:opacity-100"
    >
      <X className="size-2.5" />
    </button>
  );

  useEffect(() => {
    if (!autoFocus) return;
    const frame = requestAnimationFrame(() => valueRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [autoFocus]);

  const change_field = (next_field: CmsField) => {
    const next_operators = filter_operators_for_field(next_field);
    const operator = next_operators.some(
      (item) => item.value === condition.operator
    )
      ? condition.operator
      : default_filter_operator(next_field);
    const same_value_kind =
      filter_value_kind(field) === filter_value_kind(next_field);
    onChange(condition.id, {
      field: next_field.name,
      operator,
      value: same_value_kind ? condition.value : "",
    });
  };

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
      className={cn("group/filter-row flex w-fit max-w-full items-center gap-1", dragging && "opacity-50")}
    >
      <div className="inline-flex min-h-7 min-w-0 max-w-full items-center gap-0.5 overflow-hidden rounded-full border border-border bg-card px-1.5 text-xs">
      <button
        type="button"
        draggable
        aria-label={`Drag ${field?.label || condition.field} filter`}
        title="Drag to reorder"
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", condition.id);
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        className="grid size-3 shrink-0 cursor-grab place-items-center rounded-full text-muted-foreground hover:bg-muted active:cursor-grabbing"
      >
        <GripVertical className="size-2.5" />
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Filter field"
            className="max-w-36 shrink truncate rounded px-0.5 font-semibold outline-none hover:bg-muted"
          >
            {field?.label || condition.field}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto">
          {fields
            .filter((item) => !is_alias_field(item))
            .sort((left, right) => left.sort - right.sort)
            .map((item) => (
              <DropdownMenuItem
                key={item.name}
                onSelect={() => change_field(item)}
              >
                <span className="flex-1 truncate">
                  {item.label || item.name}
                </span>
                {item.name === condition.field ? (
                  <Check className="size-4" />
                ) : null}
              </DropdownMenuItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Filter operator"
            className="max-w-36 shrink truncate whitespace-nowrap rounded px-0.5 text-muted-foreground outline-none hover:bg-muted hover:text-foreground"
          >
            {operator_label}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto">
          {operators.map((item) => (
            <DropdownMenuItem
              key={item.value}
              onSelect={() =>
                onChange(condition.id, { operator: item.value })
              }
            >
              <span className="flex-1">{item.label}</span>
              {condition.operator === item.value ? (
                <Check className="size-4" />
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {filter_requires_value(condition.operator) ? (
        <Input
          ref={valueRef}
          aria-label="Filter value"
          value={condition.value}
          onChange={(event) =>
            onChange(condition.id, { value: event.target.value }, false)
          }
          onBlur={() => onChange(condition.id, { value: condition.value })}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
            if (event.key === "Escape") {
              event.stopPropagation();
              event.currentTarget.blur();
            }
          }}
          inputMode={
            field?.type === "integer" || field?.type === "decimal"
              ? "decimal"
              : undefined
          }
          autoComplete="off"
          spellCheck={false}
          placeholder="--"
          className="h-6 w-auto min-w-[2ch] max-w-56 flex-none border-0 bg-transparent px-0 text-xs shadow-none focus-visible:border-0 focus-visible:shadow-none [field-sizing:content]"
        />
      ) : null}
      </div>
      {remove_filter_button}
    </div>
  );
}

function FilterGroupPill({
  group,
  dragging,
  onSetJunction,
  onRemove,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  group: FilterGroup;
  dragging: boolean;
  onSetJunction: (groupId: string, junction: FilterJunction) => void;
  onRemove: (id: string) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
}) {
  const or = group.junction === "or";
  const remove_filter_button = (
    <button
      type="button"
      aria-label="Remove AND/OR group"
      title="Remove filter group"
      onClick={() => onRemove(group.id)}
      className="grid size-4 shrink-0 place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover/group-row:opacity-100 focus-visible:opacity-100"
    >
      <X className="size-2.5" />
    </button>
  );
  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
      className={cn(
        "group/group-row flex w-fit max-w-full items-center gap-1",
        dragging && "opacity-50"
      )}
    >
      <div className="inline-flex min-h-7 min-w-0 max-w-full items-center gap-1 overflow-hidden rounded-full border border-border bg-card px-1.5 text-xs">
      <button
        type="button"
        draggable
        aria-label="Drag filter group"
        title="Drag to reorder"
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", group.id);
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        className="grid size-3 shrink-0 cursor-grab place-items-center rounded-full text-muted-foreground hover:bg-muted active:cursor-grabbing"
      >
        <GripVertical className="size-2.5" />
      </button>

      <button
        type="button"
        aria-label={`Match filters with ${or ? "OR" : "AND"}. Click to switch.`}
        title="Switch AND / OR"
        onClick={() => onSetJunction(group.id, or ? "and" : "or")}
        className="flex min-w-0 max-w-64 flex-none items-center gap-1 rounded-full py-0.5 text-left text-xs"
      >
        <span
          className={cn(
            "inline-flex h-3.5 min-w-6 items-center justify-center rounded-md bg-muted px-1 text-xs font-semibold",
            or && "text-filter-or"
          )}
        >
          {group.junction.toUpperCase()}
        </span>
        <span className="truncate text-muted-foreground">
          — {or ? "Any of the following" : "All of the following"}
        </span>
      </button>
      </div>
      {remove_filter_button}
    </div>
  );
}

function FilterGroupEditor({
  group,
  depth,
  fields,
  draggedNodeId,
  autoFocusId,
  onAddCondition,
  onAddGroup,
  onChangeCondition,
  onRemoveNode,
  onSetJunction,
  onReorderNodes,
  onDragStartNode,
  onDragEndNode,
  targetGroups,
}: {
  group: FilterGroup;
  depth: number;
  fields: CmsField[];
  draggedNodeId: string | null;
  autoFocusId: string | null;
  onAddCondition: (groupId: string, field: CmsField) => string;
  onAddGroup: (groupId: string) => void;
  onChangeCondition: (
    id: string,
    changes: Partial<
      Pick<FilterCondition, "field" | "operator" | "value">
    >,
    commit?: boolean
  ) => void;
  onRemoveNode: (id: string) => void;
  onSetJunction: (groupId: string, junction: FilterJunction) => void;
  onReorderNodes: (fromId: string, toId: string) => void;
  onDragStartNode: (id: string) => void;
  onDragEndNode: () => void;
  targetGroups: { id: string; label: string }[];
}) {
  const root = depth === 0;
  const drop_on = (targetId: string) => {
    if (!draggedNodeId || draggedNodeId === targetId) return;
    onReorderNodes(draggedNodeId, targetId);
    onDragEndNode();
  };

  return (
    <div className="flex flex-col gap-1.5">
      {!root ? (
        <FilterGroupPill
          group={group}
          dragging={draggedNodeId === group.id}
          onSetJunction={onSetJunction}
          onRemove={onRemoveNode}
          onDragStart={() => onDragStartNode(group.id)}
          onDragEnd={onDragEndNode}
          onDrop={() => drop_on(group.id)}
        />
      ) : null}

      {group.children.map((node) =>
        node.kind === "group" ? (
          <FilterGroupEditor
            key={node.id}
            group={node}
            depth={depth + 1}
            fields={fields}
            draggedNodeId={draggedNodeId}
            autoFocusId={autoFocusId}
            onAddCondition={onAddCondition}
            onAddGroup={onAddGroup}
            onChangeCondition={onChangeCondition}
            onRemoveNode={onRemoveNode}
            onSetJunction={onSetJunction}
            onReorderNodes={onReorderNodes}
            onDragStartNode={onDragStartNode}
            onDragEndNode={onDragEndNode}
            targetGroups={targetGroups}
          />
        ) : (
          <FilterConditionRow
            key={node.id}
            condition={node}
            fields={fields}
            autoFocus={autoFocusId === node.id}
            dragging={draggedNodeId === node.id}
            onChange={onChangeCondition}
            onRemove={onRemoveNode}
            onDragStart={() => onDragStartNode(node.id)}
            onDragEnd={onDragEndNode}
            onDrop={() => drop_on(node.id)}
          />
        )
      )}

      {root ? (
        <AddFilterMenu
          groupId={group.id}
          targetGroups={targetGroups}
          fields={fields}
          onAddCondition={onAddCondition}
          onAddGroup={onAddGroup}
        />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Search + filter surface                                                    */
/* -------------------------------------------------------------------------- */

export function ContentSearch({
  value,
  onChange,
  onSubmit,
  onClear,
  fields,
  filterGroup,
  onAddCondition,
  onAddGroup,
  onChangeCondition,
  onRemoveNode,
  onSetJunction,
  onReorderNodes,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event?: FormEvent) => void;
  onClear: () => void;
  fields: CmsField[];
  filterGroup: FilterGroup;
  onAddCondition: (groupId: string, field: CmsField) => string;
  onAddGroup: (groupId: string) => void;
  onChangeCondition: (
    id: string,
    changes: Partial<
      Pick<FilterCondition, "field" | "operator" | "value">
    >,
    commit?: boolean
  ) => void;
  onRemoveNode: (id: string) => void;
  onSetJunction: (groupId: string, junction: FilterJunction) => void;
  onReorderNodes: (fromId: string, toId: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [autoFocusId, setAutoFocusId] = useState<string | null>(null);
  const navbarInputRef = useRef<HTMLInputElement>(null);
  const menuInputRef = useRef<HTMLInputElement>(null);

  const active_filter_count = useMemo(
    () =>
      filter_conditions(filterGroup).filter((condition) =>
        valid_filter_condition(condition, fields)
      ).length,
    [fields, filterGroup]
  );

  const add_condition = (groupId: string, field: CmsField) => {
    const id = onAddCondition(groupId, field);
    setAutoFocusId(id);
    return id;
  };

  useEffect(() => {
    if (filtersOpen) {
      menuInputRef.current?.focus();
    } else if (open) {
      navbarInputRef.current?.focus();
    }
  }, [filtersOpen, open]);

  if (!open) {
    return (
      <button
        type="button"
        className="grid size-8 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title="Search and filter"
        aria-label="Search and filter"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4" strokeWidth={1.75} />
      </button>
    );
  }

  return (
    <Popover
      open={filtersOpen}
      onOpenChange={(next) => {
        setFiltersOpen(next);
        if (!next) {
          setAutoFocusId(null);
          setDraggedNodeId(null);
          setOpen(false);
        }
      }}
    >
      <div className="flex w-full max-w-[34rem] items-center">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(event);
          }}
          className="relative flex h-10 w-full items-center rounded-xl border border-border bg-card transition-colors focus-within:border-foreground"
        >
          {!filtersOpen ? (
            <>
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-foreground" />
              <Input
                ref={navbarInputRef}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Escape") return;
                  if (value) onClear();
                  else setOpen(false);
                }}
                placeholder={placeholder}
                className="h-full w-full rounded-xl border-0 bg-transparent pl-9 pr-20 text-sm shadow-none"
              />
            </>
          ) : null}
          {!filtersOpen && value ? (
            <button
              type="button"
              aria-label="Clear search"
              title="Clear search"
              onClick={onClear}
              className="absolute right-10 grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={
                active_filter_count > 0
                  ? `Search filters (${active_filter_count} active)`
                  : "Search filters"
              }
              aria-expanded={filtersOpen}
              title="Search filters"
              className={cn(
                "absolute right-1 grid size-8 place-items-center rounded-lg text-foreground transition-colors hover:bg-muted",
                active_filter_count > 0 && "text-primary"
              )}
            >
              <Filter className="size-4" strokeWidth={2} />
              {active_filter_count > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-xs font-semibold leading-none text-primary-foreground">
                  {active_filter_count > 9 ? "9+" : active_filter_count}
                </span>
              ) : null}
            </button>
          </PopoverTrigger>
        </form>

        <PopoverContent
          align="end"
          sideOffset={-40}
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="!w-[25.5rem] max-w-[calc(100vw-2rem)] gap-0 rounded-2xl border border-border bg-muted p-2 shadow-[0_24px_60px_-24px_rgb(0_0_0/0.45)]"
        >
          <div className="app-scrollbar flex max-h-[min(70vh,32rem)] flex-col overflow-y-auto">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                onSubmit(event);
              }}
              className="relative mb-2 flex h-9 shrink-0 items-center rounded-lg border border-input bg-transparent focus-within:border-foreground"
            >
              <Search className="pointer-events-none absolute left-2.5 size-4 text-foreground" />
              <Input
                ref={menuInputRef}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.stopPropagation();
                    setFiltersOpen(false);
                  }
                }}
                placeholder={placeholder}
                aria-label="Search content"
                className="h-full rounded-lg border-0 bg-transparent pl-9 pr-9 text-sm shadow-none focus-visible:border-0 focus-visible:shadow-none"
              />
              {value ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  title="Clear search"
                  onClick={onClear}
                  className="absolute right-1 grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </form>
            <FilterGroupEditor
              group={filterGroup}
              depth={0}
              fields={fields}
              draggedNodeId={draggedNodeId}
              autoFocusId={autoFocusId}
              onAddCondition={add_condition}
              onAddGroup={onAddGroup}
              onChangeCondition={onChangeCondition}
              onRemoveNode={onRemoveNode}
              onSetJunction={onSetJunction}
              onReorderNodes={onReorderNodes}
              onDragStartNode={setDraggedNodeId}
              onDragEndNode={() => setDraggedNodeId(null)}
              targetGroups={filter_group_targets(filterGroup)}
            />
          </div>
        </PopoverContent>
      </div>
    </Popover>
  );
}
