"use client";

import { useMemo, useState } from "react";
import {
  Check,
  Columns3,
  Plus,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Notice } from "@/components/app/Notice";
import {
  CMS_RULE_VARIABLES,
  type CmsFieldType,
  type CmsPermission,
  type CmsPermissionAction,
  type CmsPermissionInput,
  type CmsRuleCondition,
  type CmsRuleGroup,
  type CmsRuleOperator,
  type CmsRulePreset,
} from "@/modules/cms/cms-types";
import { BusyButton } from "../ui";

export interface AccessField {
  name: string;
  label: string;
  type: CmsFieldType;
  required: boolean;
  hidden: boolean;
  readonly: boolean;
}

export interface AccessCollection {
  name: string;
  label: string;
  fields: AccessField[];
}

export interface PermissionDraft {
  collection: string;
  action: CmsPermissionAction;
  allow: boolean;
  fields: string[];
  filter: CmsRuleGroup;
  validation: CmsRuleGroup;
  presets: CmsRulePreset[];
  existing: boolean;
  inheritedFrom: string | null;
  readOnly: boolean;
}

export const ACTION_LABELS: Record<CmsPermissionAction, string> = {
  read: "Read",
  create: "Create",
  update: "Update",
  delete: "Delete",
};

const ACTION_NOTES: Record<CmsPermissionAction, string> = {
  read: "Only matching rows are returned.",
  create: "New records must match after presets are applied.",
  update: "Only matching rows can be updated.",
  delete: "Only matching rows can be deleted.",
};

const OPERATORS: Array<{ value: string; label: string }> = [
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
  { value: "_in", label: "is any of" },
  { value: "_null", label: "is null" },
  { value: "_not_null", label: "is not null" },
];

function empty_group(): CmsRuleGroup {
  return { match: "all", conditions: [] };
}

export function empty_draft(
  collection: string,
  action: CmsPermissionAction
): PermissionDraft {
  return {
    collection,
    action,
    allow: false,
    fields: ["*"],
    filter: empty_group(),
    validation: empty_group(),
    presets: [],
    existing: false,
    inheritedFrom: null,
    readOnly: false,
  };
}

export function draft_from_permission(
  permission: CmsPermission,
  options: {
    existing: boolean;
    inheritedFrom?: string | null;
    readOnly?: boolean;
  }
): PermissionDraft {
  return {
    collection: permission.collection,
    action: permission.action,
    allow: true,
    fields: permission.fields,
    filter: permission.filter,
    validation: permission.validation,
    presets: permission.presets,
    existing: options.existing,
    inheritedFrom: options.inheritedFrom ?? null,
    readOnly: options.readOnly ?? false,
  };
}

function condition_value_text(condition: CmsRuleCondition): string {
  if (condition.operator === "_null") return "";
  if (condition.operator === "_in" && Array.isArray(condition.value)) {
    return condition.value.map(String).join(", ");
  }
  return condition.value === null || condition.value === undefined
    ? ""
    : String(condition.value);
}

function condition_operator_key(condition: CmsRuleCondition): string {
  if (condition.operator === "_null") {
    return condition.value ? "_null" : "_not_null";
  }
  return condition.operator;
}

function normalize_condition(condition: CmsRuleCondition): CmsRuleCondition {
  if (condition.operator === "_null") {
    return {
      field: condition.field,
      operator: "_null",
      value: Boolean(condition.value),
    };
  }
  if (condition.operator === "_in") {
    const values = Array.isArray(condition.value)
      ? condition.value
      : String(condition.value ?? "")
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean);
    return { field: condition.field, operator: "_in", value: values };
  }
  return {
    field: condition.field,
    operator: condition.operator,
    value: condition.value ?? "",
  };
}

export function permission_input_from_draft(
  draft: PermissionDraft
): CmsPermissionInput {
  return {
    collection: draft.collection,
    action: draft.action,
    fields: draft.fields.includes("*") ? ["*"] : draft.fields,
    filter: {
      match: draft.filter.match,
      conditions: draft.filter.conditions.map(normalize_condition),
    },
    validation: {
      match: draft.validation.match,
      conditions: draft.validation.conditions.map(normalize_condition),
    },
    presets: draft.presets.map((preset) => ({
      field: preset.field,
      value: preset.value,
    })),
  };
}

export function has_advanced_rules(permission: CmsPermission): boolean {
  return (
    permission.filter.conditions.length > 0 ||
    permission.validation.conditions.length > 0 ||
    permission.presets.length > 0 ||
    !permission.fields.includes("*")
  );
}

function writable_fields(fields: AccessField[]): AccessField[] {
  return fields.filter((field) => field.name !== "id" && !field.readonly);
}

function field_is_checked(fields: string[], name: string): boolean {
  return fields.includes("*") || fields.includes(name);
}

function toggle_field(
  fields: string[],
  allNames: string[],
  name: string,
  checked: boolean
): string[] {
  const base = fields.includes("*") ? [...allNames] : [...fields];
  const next = checked
    ? [...new Set([...base, name])]
    : base.filter((entry) => entry !== name);
  return next.length === allNames.length ? ["*"] : next;
}

function VariableSelect({
  value,
  onChange,
  disabled,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label: string;
}) {
  const selected =
    CMS_RULE_VARIABLES.find((variable) => variable.token === value)?.token ?? "";
  return (
    <Select
      value={selected}
      onValueChange={onChange}
      disabled={disabled}
    >
      <SelectTrigger className="w-full sm:w-[180px]" aria-label={label}>
        <SelectValue placeholder="Variable" />
      </SelectTrigger>
      <SelectContent>
        {CMS_RULE_VARIABLES.map((variable) => (
          <SelectItem key={variable.token} value={variable.token}>
            {variable.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ConditionBuilder({
  group,
  fields,
  onChange,
  disabled,
  emptyText,
}: {
  group: CmsRuleGroup;
  fields: AccessField[];
  onChange: (group: CmsRuleGroup) => void;
  disabled?: boolean;
  emptyText: string;
}) {
  const firstField = fields[0]?.name ?? "";

  const updateCondition = (index: number, patch: Partial<CmsRuleCondition>) => {
    onChange({
      ...group,
      conditions: group.conditions.map((condition, position) =>
        position === index ? { ...condition, ...patch } : condition
      ),
    });
  };

  const changeOperator = (index: number, key: string) => {
    if (key === "_not_null") {
      updateCondition(index, { operator: "_null", value: false });
      return;
    }
    updateCondition(index, {
      operator: key as CmsRuleOperator,
      value: key === "_null" ? true : group.conditions[index]?.value ?? "",
    });
  };

  const addCondition = () => {
    if (!firstField) return;
    onChange({
      ...group,
      conditions: [
        ...group.conditions,
        { field: firstField, operator: "_eq", value: "" },
      ],
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="type-note">
          {group.match === "all"
            ? "Every condition must match."
            : "At least one condition must match."}
        </p>
        <Select
          value={group.match}
          onValueChange={(value) =>
            onChange({ ...group, match: value === "any" ? "any" : "all" })
          }
          disabled={disabled}
        >
          <SelectTrigger className="w-[170px]" size="sm" aria-label="Condition match mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Match all</SelectItem>
            <SelectItem value="any">Match any</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {group.conditions.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface-subtle px-4 py-3 text-sm text-muted-foreground">
          {emptyText}
        </p>
      ) : (
        <div className="space-y-2">
          {group.conditions.map((condition, index) => (
            <div
              key={index}
              className="rounded-lg border border-border bg-surface-subtle p-3"
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <Select
                  value={condition.field}
                  onValueChange={(value) =>
                    updateCondition(index, { field: value })
                  }
                  disabled={disabled}
                >
                  <SelectTrigger className="w-full" aria-label="Condition field">
                    <SelectValue placeholder="Field" />
                  </SelectTrigger>
                  <SelectContent>
                    {fields.map((field) => (
                      <SelectItem key={field.name} value={field.name}>
                        {field.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={condition_operator_key(condition)}
                  onValueChange={(value) => changeOperator(index, value)}
                  disabled={disabled}
                >
                  <SelectTrigger className="w-full" aria-label="Condition operator">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPERATORS.map((operator) => (
                      <SelectItem key={operator.value} value={operator.value}>
                        {operator.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                {condition_operator_key(condition) === "_null" ||
                condition_operator_key(condition) === "_not_null" ? (
                  <div className="flex h-10 flex-1 items-center rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground">
                    No value needed
                  </div>
                ) : (
                  <Input
                    value={condition_value_text(condition)}
                    placeholder={
                      condition.operator === "_in"
                        ? "Comma-separated values"
                        : "Value"
                    }
                    onChange={(event) =>
                      updateCondition(index, { value: event.target.value })
                    }
                    disabled={disabled}
                    aria-label="Condition value"
                  />
                )}
                {condition_operator_key(condition) !== "_null" &&
                condition_operator_key(condition) !== "_not_null" ? (
                  <VariableSelect
                    value={condition_value_text(condition)}
                    onChange={(value) => updateCondition(index, { value })}
                    disabled={disabled}
                    label="Insert a user variable"
                  />
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove condition"
                  onClick={() =>
                    onChange({
                      ...group,
                      conditions: group.conditions.filter(
                        (_, position) => position !== index
                      ),
                    })
                  }
                  disabled={disabled}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addCondition}
        disabled={disabled || fields.length === 0}
      >
        <Plus className="size-3.5" />
        Add condition
      </Button>
      <p className="type-note">
        Use <span className="font-mono text-xs">$user.email</span> or{" "}
        <span className="font-mono text-xs">$user.id</span> to scope rows to the
        signed-in account.
      </p>
    </div>
  );
}

function FieldsPanel({
  fields,
  action,
  value,
  onChange,
  disabled,
}: {
  fields: AccessField[];
  action: CmsPermissionAction;
  value: string[];
  onChange: (fields: string[]) => void;
  disabled?: boolean;
}) {
  const available = useMemo(
    () => (action === "read" ? fields : writable_fields(fields)),
    [action, fields]
  );
  const allNames = available.map((field) => field.name);
  const allSelected =
    value.includes("*") ||
    (allNames.length > 0 && allNames.every((name) => value.includes(name)));
  const someSelected =
    value.includes("*") ||
    allNames.some((name) => value.includes(name));

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border">
        <div className="flex items-center gap-3 border-b border-border bg-surface-subtle px-4 py-3">
          <Checkbox
            checked={allSelected ? true : someSelected ? "indeterminate" : false}
            onCheckedChange={(checked) =>
              onChange(checked === true ? ["*"] : [])
            }
            disabled={disabled || available.length === 0}
            aria-label="Select all fields"
          />
          <div className="min-w-0">
            <p className="font-semibold">Select all fields</p>
            <p className="text-xs text-muted-foreground">
              {action === "read"
                ? "Return every field in this collection."
                : "Allow the client to write every writable field."}
            </p>
          </div>
        </div>
        <div className="app-scrollbar max-h-80 overflow-y-auto">
          {available.map((field) => {
            const checked = field_is_checked(value, field.name);
            const locked =
              field.name === "id" || (action !== "read" && field.readonly);
            return (
              <label
                key={field.name}
                className={cn(
                  "flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0",
                  locked && "bg-surface-subtle"
                )}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(next) =>
                    onChange(
                      toggle_field(value, allNames, field.name, next === true)
                    )
                  }
                  disabled={disabled || locked}
                  aria-label={`Allow field ${field.label}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{field.label}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {field.name}
                  </span>
                </span>
                <span className="flex flex-wrap justify-end gap-1">
                  {field.required ? (
                    <Badge variant="outline">Required</Badge>
                  ) : null}
                  {field.hidden ? <Badge variant="outline">Hidden</Badge> : null}
                  {field.readonly || field.name === "id" ? (
                    <Badge variant="outline">Read-only</Badge>
                  ) : null}
                </span>
              </label>
            );
          })}
          {available.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              This collection has no writable fields.
            </p>
          ) : null}
        </div>
      </div>
      <p className="type-note">
        {action === "read"
          ? "Only checked fields are returned. The primary key is always included."
          : "Only checked fields can be sent by the client. Presets can still write other fields."}
      </p>
      {!value.includes("*") && value.length === 0 ? (
        <Notice icon={ShieldAlert} tone="warning">
          No client fields are selected.{" "}
          {action === "read"
            ? "Only the primary key will be returned."
            : "Only server presets can write values."}
        </Notice>
      ) : null}
    </div>
  );
}

function PresetsPanel({
  fields,
  value,
  onChange,
  disabled,
}: {
  fields: AccessField[];
  value: CmsRulePreset[];
  onChange: (presets: CmsRulePreset[]) => void;
  disabled?: boolean;
}) {
  const available = writable_fields(fields);
  const used = new Set(value.map((preset) => preset.field));
  const nextField = available.find((field) => !used.has(field.name));

  const updatePreset = (index: number, patch: Partial<CmsRulePreset>) => {
    onChange(
      value.map((preset, position) =>
        position === index ? { ...preset, ...patch } : preset
      )
    );
  };

  return (
    <div className="space-y-3">
      {value.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface-subtle px-4 py-3 text-sm text-muted-foreground">
          No presets. Ownership fields must be sent by the client and allowed in
          Fields.
        </p>
      ) : (
        <div className="space-y-2">
          {value.map((preset, index) => (
            <div
              key={`${preset.field}-${index}`}
              className="rounded-lg border border-border bg-surface-subtle p-3"
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <Select
                  value={preset.field}
                  onValueChange={(field) => updatePreset(index, { field })}
                  disabled={disabled}
                >
                  <SelectTrigger className="w-full" aria-label="Preset field">
                    <SelectValue placeholder="Field" />
                  </SelectTrigger>
                  <SelectContent>
                    {available
                      .filter(
                        (field) =>
                          field.name === preset.field || !used.has(field.name)
                      )
                      .map((field) => (
                        <SelectItem key={field.name} value={field.name}>
                          {field.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Input
                  value={preset.value}
                  placeholder="Value"
                  onChange={(event) =>
                    updatePreset(index, { value: event.target.value })
                  }
                  disabled={disabled}
                  aria-label="Preset value"
                />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <VariableSelect
                  value={preset.value}
                  onChange={(next) => updatePreset(index, { value: next })}
                  disabled={disabled}
                  label="Insert a user variable into the preset"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove preset"
                  onClick={() =>
                    onChange(value.filter((_, position) => position !== index))
                  }
                  disabled={disabled}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          if (!nextField) return;
          onChange([...value, { field: nextField.name, value: "" }]);
        }}
        disabled={disabled || !nextField}
      >
        <Plus className="size-3.5" />
        Add preset
      </Button>
      <p className="type-note">
        Presets run on create before validation and override values sent by the
        client.
      </p>
    </div>
  );
}

export function RuleSheet({
  open,
  onOpenChange,
  initialDraft,
  collection,
  roleName,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDraft: PermissionDraft;
  collection: AccessCollection;
  roleName: string;
  saving: boolean;
  onSave: (draft: PermissionDraft) => void;
}) {
  const [draft, setDraft] = useState<PermissionDraft>(initialDraft);
  const [activeSection, setActiveSection] = useState("access");
  const actionLabel = ACTION_LABELS[draft.action];
  const readOnly = draft.readOnly;
  const canValidate = draft.action === "create" || draft.action === "update";
  const canPreset = draft.action === "create";
  const showSections = draft.allow;
  const sections = [
    { value: "access", label: "Access", icon: SlidersHorizontal },
    { value: "fields", label: "Fields", icon: Columns3 },
    ...(canValidate
      ? [{ value: "validation", label: "Validation", icon: ShieldCheck }]
      : []),
    ...(canPreset
      ? [{ value: "presets", label: "Presets", icon: Plus }]
      : []),
  ];

  const footerPrimary = draft.allow ? (
    <BusyButton
      type="button"
      busy={saving}
      onClick={() => onSave(draft)}
      disabled={readOnly}
    >
      <Check className="size-4" />
      {draft.existing ? "Save policy" : "Create policy"}
    </BusyButton>
  ) : draft.existing ? (
    <BusyButton
      type="button"
      variant="destructive"
      busy={saving}
      onClick={() => onSave(draft)}
      disabled={readOnly}
    >
      <Trash2 className="size-4" />
      Remove policy
    </BusyButton>
  ) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="max-w-[760px]">
        <SheetHeader>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>{actionLabel} policy</DialogTitle>
            <Badge variant="outline">{actionLabel}</Badge>
            {readOnly && draft.inheritedFrom ? (
              <Badge variant="secondary">Inherited</Badge>
            ) : null}
          </div>
          <DialogDescription>
            {collection.label} <span className="font-mono">{collection.name}</span>{" "}
            · {roleName}
          </DialogDescription>
        </SheetHeader>

        <SheetBody className="p-0">
          <div className="flex min-h-full flex-col sm:flex-row">
            {showSections ? (
              <aside className="hidden w-[170px] shrink-0 border-r border-border bg-surface-subtle p-3 sm:block">
                <p className="type-headline px-3 pb-2">Policy</p>
                <nav className="space-y-1" aria-label="Policy sections">
                  {sections.map((section) => {
                    const Icon = section.icon;
                    const active = activeSection === section.value;
                    return (
                      <button
                        key={section.value}
                        type="button"
                        aria-current={active ? "page" : undefined}
                        onClick={() => setActiveSection(section.value)}
                        className={cn(
                          "flex h-10 w-full items-center gap-2 rounded-lg border px-3 text-left text-sm font-medium transition-colors",
                          active
                            ? "border-border bg-card text-foreground"
                            : "border-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                        )}
                      >
                        <Icon className="size-4" />
                        {section.label}
                      </button>
                    );
                  })}
                </nav>
              </aside>
            ) : null}

            <div className="min-w-0 flex-1 space-y-5 p-6">
              {showSections ? (
                <div className="sm:hidden">
                  <label htmlFor="policy-section" className="sr-only">
                    Policy section
                  </label>
                  <Select
                    value={activeSection}
                    onValueChange={setActiveSection}
                  >
                    <SelectTrigger
                      id="policy-section"
                      className="w-full"
                      aria-label="Policy section"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sections.map((section) => (
                        <SelectItem key={section.value} value={section.value}>
                          {section.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {readOnly ? (
                <Notice icon={ShieldCheck}>
                  Inherited from{" "}
                  <span className="font-semibold">{draft.inheritedFrom}</span>.
                  Override the policy to change access for this role.
                </Notice>
              ) : (
                <label className="flex items-start gap-3 rounded-lg border border-border p-4">
                  <Checkbox
                    checked={draft.allow}
                    onCheckedChange={(checked) =>
                      setDraft((current) => ({
                        ...current,
                        allow: checked === true,
                      }))
                    }
                    aria-label="Allow this action"
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold">Allow this action</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      The role can {draft.action} records in this collection when
                      the policy matches.
                    </span>
                  </span>
                </label>
              )}

              {!draft.allow ? (
                <Notice
                  icon={draft.existing ? ShieldAlert : SlidersHorizontal}
                  tone={draft.existing ? "destructive" : "neutral"}
                >
                  {draft.existing
                    ? "Saving will remove this policy. Access may still be inherited from a parent role."
                    : "This action is denied. Turn on Allow this action to create a policy."}
                </Notice>
              ) : (
                <div className="space-y-5">
                  {activeSection === "access" ? (
                    <div className="space-y-3">
                      <div>
                        <h3 className="text-base font-semibold">Row access</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {ACTION_NOTES[draft.action]}
                        </p>
                      </div>
                      <ConditionBuilder
                        group={draft.filter}
                        fields={collection.fields}
                        onChange={(filter) =>
                          setDraft((current) => ({ ...current, filter }))
                        }
                        disabled={readOnly}
                        emptyText={
                          draft.action === "create"
                            ? "No conditions. Every create is allowed."
                            : "No conditions. Every row is allowed."
                        }
                      />
                    </div>
                  ) : null}

                  {activeSection === "fields" ? (
                    <FieldsPanel
                      fields={collection.fields}
                      action={draft.action}
                      value={draft.fields}
                      onChange={(fields) =>
                        setDraft((current) => ({ ...current, fields }))
                      }
                      disabled={readOnly}
                    />
                  ) : null}

                  {activeSection === "validation" && canValidate ? (
                    <div className="space-y-3">
                      <div>
                        <h3 className="text-base font-semibold">
                          Write validation
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Validation runs on the final record after presets and
                          updates are applied.
                        </p>
                      </div>
                      <ConditionBuilder
                        group={draft.validation}
                        fields={collection.fields}
                        onChange={(validation) =>
                          setDraft((current) => ({ ...current, validation }))
                        }
                        disabled={readOnly}
                        emptyText="No validation conditions. The write is accepted when row access matches."
                      />
                    </div>
                  ) : null}

                  {activeSection === "presets" && canPreset ? (
                    <PresetsPanel
                      fields={collection.fields}
                      value={draft.presets}
                      onChange={(presets) =>
                        setDraft((current) => ({ ...current, presets }))
                      }
                      disabled={readOnly}
                    />
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </SheetBody>

        <SheetFooter>
          {readOnly ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
              <Button
                type="button"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    readOnly: false,
                    inheritedFrom: null,
                    existing: false,
                  }))
                }
              >
                Override in this role
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              {footerPrimary}
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
