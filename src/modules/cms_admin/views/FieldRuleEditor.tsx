"use client";

import { useState, type DragEvent } from "react";
import { Check, ChevronDown, GripVertical, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { AddFilterMenu } from "./ContentSearch";
import type {
  CmsField,
  CmsFieldRuleCondition,
  CmsFieldRuleGroup,
  CmsRuleOperator,
} from "@/modules/cms/cms-types";

const OPERATORS: Array<{ value: CmsRuleOperator; label: string }> = [
  { value: "_eq", label: "equals" },
  { value: "_neq", label: "does not equal" },
  { value: "_contains", label: "contains" },
  { value: "_not_contains", label: "does not contain" },
  { value: "_starts_with", label: "starts with" },
  { value: "_ends_with", label: "ends with" },
  { value: "_gt", label: "is greater than" },
  { value: "_gte", label: "is greater than or equal" },
  { value: "_lt", label: "is less than" },
  { value: "_lte", label: "is less than or equal" },
  { value: "_null", label: "is empty" },
  { value: "_in", label: "is one of" },
];

function is_group(
  node: CmsFieldRuleGroup | CmsFieldRuleCondition
): node is CmsFieldRuleGroup {
  return "conditions" in node;
}

function update_node(
  root: CmsFieldRuleGroup,
  path: number[],
  update: (node: CmsFieldRuleGroup | CmsFieldRuleCondition) =>
    CmsFieldRuleGroup | CmsFieldRuleCondition
): CmsFieldRuleGroup {
  if (path.length === 0) return update(root) as CmsFieldRuleGroup;
  const [index, ...rest] = path;
  return {
    ...root,
    conditions: root.conditions.map((node, nodeIndex) => {
      if (nodeIndex !== index) return node;
      if (!is_group(node)) {
        return rest.length === 0 ? update(node) : node;
      }
      return update_node(node, rest, update);
    }),
  };
}

function parse_list(value: string): string[] {
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function default_rule_operator(field: CmsField): CmsRuleOperator {
  if (field.type === "json") return "_null";
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

function rule_group_targets(
  group: CmsFieldRuleGroup,
  path: number[] = []
): { id: string; label: string }[] {
  const isRoot = path.length === 0;
  const label = isRoot
    ? "All rules"
    : `${group.match === "all" ? "AND" : "OR"} group — ${
        group.match === "all" ? "All" : "Any"
      } of the following`;
  return [
    { id: isRoot ? "root" : path.join("."), label },
    ...group.conditions.flatMap((node, index) =>
      is_group(node) ? rule_group_targets(node, [...path, index]) : []
    ),
  ];
}

function rule_group_path(id: string): number[] {
  return id === "root" ? [] : id.split(".").map(Number);
}

function RuleGroupEditor({
  group,
  fields,
  onChange,
  depth = 0,
}: {
  group: CmsFieldRuleGroup;
  fields: CmsField[];
  onChange: (group: CmsFieldRuleGroup) => void;
  depth?: number;
}) {
  const [draggingNode, setDraggingNode] = useState<{
    parentPath: number[];
    index: number;
  } | null>(null);

  const updateAt = (
    path: number[],
    update: (node: CmsFieldRuleGroup | CmsFieldRuleCondition) =>
      CmsFieldRuleGroup | CmsFieldRuleCondition
  ) => onChange(update_node(group, path, update));

  const handleDrop = (
    event: DragEvent<HTMLDivElement>,
    parentPath: number[],
    targetIndex: number
  ) => {
    event.preventDefault();
    const dragged = draggingNode;
    if (
      !dragged ||
      dragged.index === targetIndex ||
      dragged.parentPath.length !== parentPath.length ||
      !dragged.parentPath.every((part, index) => part === parentPath[index])
    ) {
      setDraggingNode(null);
      return;
    }

    updateAt(parentPath, (node) => {
      if (!is_group(node)) return node;
      const conditions = [...node.conditions];
      const [moved] = conditions.splice(dragged.index, 1);
      conditions.splice(targetIndex, 0, moved);
      return { ...node, conditions };
    });
    setDraggingNode(null);
  };

  const addCondition = (parentPath: number[], field: CmsField) => {
    const operator = default_rule_operator(field);
    updateAt(parentPath, (node) => {
      if (!is_group(node)) return node;
      return {
        ...node,
        conditions: [
          ...node.conditions,
          {
            field: field.name,
            operator,
            value:
              operator === "_null" ? true : operator === "_in" ? [] : "",
          },
        ],
      };
    });
  };

  const addGroup = (parentPath: number[]) => {
    updateAt(parentPath, (node) => {
      if (!is_group(node)) return node;
      return {
        ...node,
        conditions: [
          ...node.conditions,
          { match: "all", conditions: [] },
        ],
      };
    });
  };

  const renderGroup = (
    current: CmsFieldRuleGroup,
    path: number[],
    level: number
  ) => {
    const parentPath = path.slice(0, -1);
    const groupIndex = path[path.length - 1] ?? -1;
    const dragging =
      level > 0 &&
      draggingNode?.index === groupIndex &&
      draggingNode.parentPath.length === parentPath.length &&
      draggingNode.parentPath.every(
        (part, index) => part === parentPath[index]
      );

    return (
    <div className="flex flex-col gap-1.5">
      <div
        className={
          level === 0
            ? "flex flex-col gap-1.5 rounded-2xl border border-border bg-card p-2"
            : "flex flex-col gap-1.5"
        }
      >
        {current.conditions.length === 0 ? (
          <></>
        ) : (
          current.conditions.map((node, index) => {
            const nodePath = [...path, index];
            if (is_group(node)) {
              return (
                <div key={nodePath.join("-")}>
                  {renderGroup(node, nodePath, level + 1)}
                </div>
              );
            }

            const operator = node.operator;
            const field = fields.find((item) => item.name === node.field);
            const operatorLabel =
              OPERATORS.find((item) => item.value === operator)?.label ??
              operator;
            const pillId = nodePath.join("-");
            const dragging =
              draggingNode?.index === index &&
              draggingNode.parentPath.length === path.length &&
              draggingNode.parentPath.every((part, partIndex) => part === path[partIndex]);

            return (
              <div
                key={pillId}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => handleDrop(event, path, index)}
                className={`group/filter-row flex w-fit max-w-full items-center gap-1 ${
                  dragging ? "opacity-50" : ""
                }`}
              >
                <div className="inline-flex min-h-7 min-w-0 max-w-full items-center gap-0.5 overflow-hidden rounded-full border border-border bg-card px-1.5 text-xs">
                  <button
                    type="button"
                    draggable
                    aria-label="Drag filter to reorder"
                    title="Drag to reorder"
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", pillId);
                      setDraggingNode({ parentPath: [...path], index });
                    }}
                    onDragEnd={() => setDraggingNode(null)}
                    className="grid size-3 shrink-0 cursor-grab place-items-center rounded-full text-muted-foreground hover:bg-muted active:cursor-grabbing"
                  >
                    <GripVertical className="size-2.5" />
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label="Rule field"
                        title={field?.label || node.field}
                        className="max-w-36 shrink truncate rounded px-0.5 font-semibold outline-none hover:bg-muted"
                      >
                        {field?.label || node.field}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      className="max-h-72 w-56 overflow-y-auto"
                    >
                      {fields.map((item) => (
                        <DropdownMenuItem
                          key={item.name}
                          onSelect={() =>
                            updateAt(nodePath, (entry) =>
                              is_group(entry)
                                ? entry
                                : { ...entry, field: item.name }
                            )
                          }
                        >
                          <span className="flex-1 truncate">
                            {item.label || item.name}
                          </span>
                          {item.name === node.field ? (
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
                        aria-label="Rule operator"
                        title={operatorLabel}
                        className="max-w-36 shrink truncate whitespace-nowrap rounded px-0.5 text-muted-foreground outline-none hover:bg-muted hover:text-foreground"
                      >
                        {operatorLabel}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      className="max-h-72 w-56 overflow-y-auto"
                    >
                      {OPERATORS.map((item) => (
                        <DropdownMenuItem
                          key={item.value}
                          onSelect={() =>
                            updateAt(nodePath, (entry) =>
                              is_group(entry)
                                ? entry
                                : {
                                    ...entry,
                                    operator: item.value,
                                    value:
                                      item.value === "_null"
                                        ? true
                                        : item.value === "_in"
                                          ? []
                                          : "",
                                  }
                            )
                          }
                        >
                          <span className="flex-1">{item.label}</span>
                          {operator === item.value ? (
                            <Check className="size-4" />
                          ) : null}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {operator === "_null" ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label="Empty check"
                          className="shrink truncate rounded px-0.5 text-muted-foreground outline-none hover:bg-muted hover:text-foreground"
                        >
                          {Boolean(node.value) ? "is empty" : "is not empty"}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {[true, false].map((isEmpty) => (
                          <DropdownMenuItem
                            key={String(isEmpty)}
                            onSelect={() =>
                              updateAt(nodePath, (entry) =>
                                is_group(entry)
                                  ? entry
                                  : { ...entry, value: isEmpty }
                              )
                            }
                          >
                            <span className="flex-1">
                              {isEmpty ? "is empty" : "is not empty"}
                            </span>
                            {Boolean(node.value) === isEmpty ? (
                              <Check className="size-4" />
                            ) : null}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <Input
                      aria-label="Rule value"
                      value={
                        operator === "_in" && Array.isArray(node.value)
                          ? node.value.join(", ")
                          : String(node.value ?? "")
                      }
                      placeholder="---"
                      onChange={(event) =>
                        updateAt(nodePath, (entry) =>
                          is_group(entry)
                            ? entry
                            : {
                                ...entry,
                                value:
                                  operator === "_in"
                                    ? parse_list(event.target.value)
                                    : event.target.value,
                              }
                        )
                      }
                      className="field-rule-value h-6 w-auto min-w-[2ch] max-w-56 flex-none border-0 bg-transparent px-0 text-xs shadow-none focus-visible:border-0 focus-visible:shadow-none [field-sizing:content]"
                    />
                  )}
                </div>
                <button
                  type="button"
                  aria-label="Remove rule"
                  title="Remove filter"
                  onClick={() =>
                    updateAt(path, (parent) =>
                      is_group(parent)
                        ? {
                            ...parent,
                            conditions: parent.conditions.filter(
                              (_, itemIndex) => itemIndex !== index
                            ),
                          }
                        : parent
                    )
                  }
                  className="grid size-4 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="size-2.5" />
                </button>
              </div>
            );
          })
        )}

        {level === 0 ? (
          <AddFilterMenu
            groupId="root"
            fields={fields}
            targetGroups={rule_group_targets(group)}
            onAddCondition={(groupId, field) =>
              addCondition(rule_group_path(groupId), field)
            }
            onAddGroup={(groupId) => addGroup(rule_group_path(groupId))}
          />
        ) : null}

        <div
          onDragOver={
            level > 0
              ? (event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }
              : undefined
          }
          onDrop={
            level > 0
              ? (event) => handleDrop(event, parentPath, groupIndex)
              : undefined
          }
          className={`group/group-row flex w-fit max-w-full items-center gap-1 ${
            dragging ? "opacity-50" : ""
          } ${
            level === 0 ? "hidden" : ""
          }`}
        >
          <div className="inline-flex min-h-7 min-w-0 max-w-full items-center gap-1 overflow-hidden rounded-full border border-border bg-card px-1.5 text-xs">
            <button
              type="button"
              draggable
              aria-label="Drag filter group to reorder"
              title="Drag to reorder"
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", "filter-group");
                setDraggingNode({
                  parentPath: [...parentPath],
                  index: groupIndex,
                });
              }}
              onDragEnd={() => setDraggingNode(null)}
              className="grid size-3 shrink-0 cursor-grab place-items-center rounded-full text-muted-foreground hover:bg-muted active:cursor-grabbing"
            >
              <GripVertical className="size-2.5" />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Choose AND or OR group"
                  title="Choose AND / OR"
                  className="flex min-w-0 max-w-64 flex-none items-center gap-1 rounded-full py-0.5 text-left text-xs"
                >
                  <span
                    className={`inline-flex h-3.5 min-w-6 items-center justify-center rounded-md bg-muted px-1 text-xs font-semibold ${
                      current.match === "any" ? "text-filter-or" : ""
                    }`}
                  >
                    {current.match === "any" ? "OR" : "AND"}
                  </span>
                  <span className="truncate text-muted-foreground">
                    — {current.match === "any" ? "Any" : "All"} of the following
                  </span>
                  <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {(["all", "any"] as const).map((match) => (
                  <DropdownMenuItem
                    key={match}
                    onSelect={() =>
                      updateAt(path, (entry) =>
                        is_group(entry) ? { ...entry, match } : entry
                      )
                    }
                  >
                    <span className="flex-1">
                      {match === "all"
                        ? "AND — All of the following"
                        : "OR — Any of the following"}
                    </span>
                    {current.match === match ? (
                      <Check className="size-4" />
                    ) : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {level > 0 ? (
            <button
              type="button"
              aria-label="Remove AND/OR group"
              title="Remove filter group"
              onClick={() => {
                updateAt(parentPath, (parent) =>
                  is_group(parent)
                    ? {
                        ...parent,
                        conditions: parent.conditions.filter(
                          (_, index) => index !== groupIndex
                        ),
                      }
                    : parent
                );
              }}
              className="grid size-4 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-2.5" />
            </button>
          ) : null}
        </div>
      </div>

    </div>
    );
  };

  return <>{renderGroup(group, [], depth)}</>;
}

export function FieldRuleEditor({
  value,
  fields,
  onChange,
}: {
  value: CmsFieldRuleGroup;
  fields: CmsField[];
  onChange: (value: CmsFieldRuleGroup) => void;
}) {
  return (
    <div>
      <RuleGroupEditor
        group={value}
        fields={fields}
        onChange={onChange}
      />
    </div>
  );
}
