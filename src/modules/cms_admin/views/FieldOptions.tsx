"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  GripHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ColorPicker } from "@/components/ui/color-picker";
import { IconPicker } from "@/components/ui/icon-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type {
  CmsChoice,
  CmsCollectionWithFields,
  CmsFieldInterface,
  CmsFieldType,
  CmsLink,
  CmsRepeaterField,
} from "@/modules/cms/cms-types";
import {
  CMS_INTERFACES,
  cms_interface_definition,
  cms_normalize_repeater_fields,
} from "@/modules/cms/cms-interfaces";
import type { FieldFormState } from "./field-form";
import { slugify_field_name } from "./field-form";

const INTERFACE_DEFINITIONS = Object.values(CMS_INTERFACES);
const LEGACY_INTERFACES = new Set<CmsFieldInterface>([
  "number",
  "json",
  "select",
  "relation",
]);

const FONT_OPTIONS = [
  { value: "sans-serif", label: "Sans-serif" },
  { value: "serif", label: "Serif" },
  { value: "monospace", label: "Monospace" },
];

const CODE_LANGUAGES = [
  { value: "plaintext", label: "Plain text" },
  { value: "json", label: "JSON" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "sql", label: "SQL" },
  { value: "yaml", label: "YAML" },
  { value: "markdown", label: "Markdown" },
  { value: "php", label: "PHP" },
  { value: "python", label: "Python" },
];

const NOTICE_COLORS = [
  { value: "normal", label: "Neutral" },
  { value: "info", label: "Info" },
  { value: "success", label: "Success" },
  { value: "warning", label: "Warning" },
  { value: "danger", label: "Danger" },
];

const START_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
];

const LINK_TYPES: Array<{
  value: NonNullable<CmsLink["type"]>;
  label: string;
}> = [
  { value: "normal", label: "Normal" },
  { value: "primary", label: "Primary" },
  { value: "info", label: "Info" },
  { value: "success", label: "Success" },
  { value: "warning", label: "Warning" },
  { value: "danger", label: "Danger" },
];

const LINK_ACTIONS: Array<{
  value: NonNullable<CmsLink["actionType"]>;
  label: string;
}> = [
  { value: "url", label: "Open URL" },
  { value: "flow", label: "Run flow" },
];

const SUB_FIELD_TYPES: Array<{ value: CmsFieldType; label: string }> = [
  { value: "string", label: "Short text" },
  { value: "text", label: "Long text" },
  { value: "integer", label: "Integer" },
  { value: "decimal", label: "Decimal" },
  { value: "boolean", label: "Boolean" },
  { value: "datetime", label: "Date & time" },
  { value: "json", label: "JSON" },
  { value: "select", label: "Select" },
  { value: "image", label: "Image" },
  { value: "relation", label: "Relation ID" },
];

const RELATION_COLLECTION_KEYS = [
  "relatedCollection",
  "related_collection",
  "rel_collection",
  "collection",
  "selectedCollection",
  "selected_collection",
];

function raw_option(form: FieldFormState, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = form.options[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function text_option(form: FieldFormState, ...keys: string[]): string {
  const value = raw_option(form, ...keys);
  return value === undefined ? "" : String(value);
}

function bool_option(
  form: FieldFormState,
  fallback: boolean,
  ...keys: string[]
): boolean {
  const value = raw_option(form, ...keys);
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return !["false", "0", "off", "no"].includes(String(value).toLowerCase());
}

function number_option(
  form: FieldFormState,
  fallback: number,
  ...keys: string[]
): number {
  const value = raw_option(form, ...keys);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function list_option(form: FieldFormState, ...keys: string[]): unknown[] {
  const value = raw_option(form, ...keys);
  return Array.isArray(value) ? value : [];
}

function parse_choice_value(
  text: string,
  type: CmsFieldType
): string | number | boolean {
  const trimmed = text.trim();
  if (type === "integer" || type === "relation") {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : trimmed;
  }
  if (type === "decimal") {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : trimmed;
  }
  if (type === "boolean") {
    return ["true", "1", "yes", "on"].includes(trimmed.toLowerCase());
  }
  return trimmed;
}

function new_choice(index: number, type: CmsFieldType): CmsChoice {
  const numeric = type === "integer" || type === "decimal" || type === "relation";
  return {
    text: `Option ${index}`,
    value: numeric ? index : `option_${index}`,
  };
}

interface LanguageEntry {
  code: string;
  label: string;
}

function read_languages(form: FieldFormState): LanguageEntry[] {
  return list_option(form, "languages")
    .map((entry): LanguageEntry | null => {
      if (typeof entry === "string") {
        return entry.trim() ? { code: entry.trim(), label: entry.trim() } : null;
      }
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }
      const object = entry as Record<string, unknown>;
      const code = String(
        object.code ?? object.value ?? object.language ?? ""
      ).trim();
      if (!code) return null;
      return {
        code,
        label: String(object.label ?? object.name ?? code) || code,
      };
    })
    .filter((entry): entry is LanguageEntry => entry !== null);
}

function normalize_links(value: unknown[]): CmsLink[] {
  return value
    .map((entry): CmsLink | null => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }
      const object = entry as Record<string, unknown>;
      const label = String(object.label ?? "").trim();
      if (!label) return null;
      const type = String(object.type ?? "normal") as CmsLink["type"];
      const actionType = String(
        object.actionType ?? object.action_type ?? "url"
      ) as CmsLink["actionType"];
      return {
        label,
        icon: String(object.icon ?? "") || undefined,
        type: type || "normal",
        actionType: actionType || "url",
        url: String(object.url ?? "") || undefined,
      };
    })
    .filter((entry): entry is CmsLink => entry !== null);
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  step,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  step?: string;
  className?: string;
}) {
  return (
    <div className={cn("drawer-control", className)}>
      <Label className="text-sm font-semibold" title={label}>{label}</Label>
      <Input
        type={type}
        step={step}
        value={value}
        placeholder={placeholder}
        className="rounded-lg border-input bg-card"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function SingleLineField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="drawer-control">
      <Label className="text-sm font-semibold" title={label}>{label}</Label>
      <Input
        value={value}
        placeholder={placeholder}
        className="rounded-lg border-input bg-card"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number | "") => void;
}) {
  return (
    <TextField
      label={label}
      type="number"
      value={Number.isFinite(value) ? String(value) : ""}
      onChange={(text) => onChange(text === "" ? "" : Number(text))}
    />
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="drawer-control">
      <Label className="text-sm font-semibold" title={label}>{label}</Label>
      <div className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-13 w-full appearance-none rounded-lg border border-input bg-card px-3 pr-9 text-sm text-foreground outline-none"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    </div>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="drawer-control">
      <Label className="text-sm font-semibold" title={label}>{label}</Label>
      <div className="flex h-12 min-h-12 items-center justify-end rounded-lg border border-input bg-card px-3">
        <Switch checked={checked} onCheckedChange={onChange} />
      </div>
    </div>
  );
}

function IconField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="drawer-control">
      <Label className="text-sm font-semibold" title={label}>{label}</Label>
      <IconPicker
        value={value}
        placeholder={placeholder}
        className="rounded-lg"
        popoverClassName="field-drawer-popover"
        onChange={onChange}
      />
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="drawer-control">
      <Label className="text-sm font-semibold" title={label}>{label}</Label>
      <ColorPicker
        value={value}
        className="rounded-lg"
        popoverClassName="field-drawer-popover"
        onChange={onChange}
      />
    </div>
  );
}

function ChoiceEditor({
  choices,
  onChange,
  type,
  tree = false,
}: {
  choices: CmsChoice[];
  onChange: (choices: CmsChoice[]) => void;
  type: CmsFieldType;
  tree?: boolean;
}) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  const patch = (index: number, change: Partial<CmsChoice>) => {
    onChange(
      choices.map((choice, choiceIndex) =>
        choiceIndex === index ? { ...choice, ...change } : choice
      )
    );
  };

  const move = (index: number, target: number) => {
    if (target < 0 || target >= choices.length) return;
    const next = [...choices];
    const [choice] = next.splice(index, 1);
    next.splice(target, 0, choice);
    onChange(next);
    setExpandedIndex((expanded) => {
      if (expanded === index) return target;
      if (expanded === null) return null;
      if (index < expanded && target >= expanded) return expanded - 1;
      if (index > expanded && target <= expanded) return expanded + 1;
      return expanded;
    });
  };

  return (
    <div className="space-y-2.5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className="size-1.5 rounded-full bg-foreground" aria-hidden="true" />
        Choices
      </h3>

      {choices.length === 0 ? (
        <p className="text-xs text-muted-foreground">No choices</p>
      ) : (
        choices.map((choice, index) => (
          <div
            key={index}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (draggingIndex !== null) move(draggingIndex, index);
              setDraggingIndex(null);
            }}
            className={`space-y-1.5 rounded-xl border border-border bg-card p-1.5 ${
              draggingIndex === index ? "opacity-50" : ""
            }`}
          >
            <div className="flex min-w-0 items-center gap-1.5">
              <button
                type="button"
                draggable
                aria-label={`Drag ${choice.text || "choice"} to reorder`}
                title="Drag to reorder"
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", String(index));
                  setDraggingIndex(index);
                }}
                onDragEnd={() => setDraggingIndex(null)}
                className="grid size-7 shrink-0 cursor-grab place-items-center rounded-lg text-foreground hover:bg-muted active:cursor-grabbing"
              >
                <GripHorizontal className="size-5" />
              </button>
              <Input
                value={choice.text}
                placeholder="Choice"
                className="field-choice-control h-8 min-w-0 border-transparent bg-transparent px-1 text-sm font-medium shadow-none focus-visible:border-input focus-visible:shadow-none"
                onChange={(event) => {
                  const text = event.target.value;
                  const followsLabel = String(choice.value) === choice.text;
                  patch(index, {
                    text,
                    value: followsLabel
                      ? parse_choice_value(text, type)
                      : choice.value,
                  });
                }}
              />
              <button
                type="button"
                aria-label={
                  expandedIndex === index
                    ? "Hide choice options"
                    : "Show choice options"
                }
                aria-expanded={expandedIndex === index}
                title="More options"
                onClick={() =>
                  setExpandedIndex(expandedIndex === index ? null : index)
                }
                className="grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ChevronDown
                  className={`size-4 transition-transform ${
                    expandedIndex === index ? "rotate-180" : ""
                  }`}
                />
              </button>
              <button
                type="button"
                aria-label="Remove choice"
                title="Remove choice"
                onClick={() => {
                  onChange(
                    choices.filter(
                      (_choice, choiceIndex) => choiceIndex !== index
                    )
                  );
                  setExpandedIndex((expanded) =>
                    expanded === index
                      ? null
                      : expanded !== null && expanded > index
                        ? expanded - 1
                        : expanded
                  );
                }}
                className="grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
            {expandedIndex === index ? (
              <div className="grid gap-2 pl-9">
                <Input
                  value={String(choice.value)}
                  placeholder="Value"
                  className="field-choice-control h-8 rounded-lg border-input bg-card font-mono text-xs"
                  onChange={(event) =>
                    patch(index, {
                      value: parse_choice_value(event.target.value, type),
                    })
                  }
                />
                <IconPicker
                  value={choice.icon ?? ""}
                  placeholder="Optional icon"
                  className="field-choice-control h-8 rounded-lg"
                  popoverClassName="field-drawer-popover"
                  onChange={(icon) =>
                    patch(index, { icon: icon || undefined })
                  }
                />
                <ColorPicker
                  value={choice.color ?? ""}
                  className="field-choice-control h-8 rounded-lg px-2.5"
                  popoverClassName="field-drawer-popover"
                  onChange={(color) =>
                    patch(index, { color: color || undefined })
                  }
                />
                {tree ? (
                  <div className="relative">
                    <select
                      value={
                        choice.parent === undefined
                          ? ""
                          : String(choice.parent)
                      }
                      onChange={(event) =>
                        patch(index, {
                          parent:
                            event.target.value === ""
                              ? undefined
                              : parse_choice_value(event.target.value, type),
                        })
                      }
                      className="field-choice-control h-8 w-full appearance-none rounded-lg border border-input bg-card px-3 pr-9 text-xs text-foreground outline-none"
                    >
                      <option value="">No parent</option>
                      {choices
                        .filter((_entry, entryIndex) => entryIndex !== index)
                        .map((parent) => (
                          <option
                            key={String(parent.value)}
                            value={String(parent.value)}
                          >
                            {parent.text}
                          </option>
                        ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ))
      )}

      <button
        type="button"
        onClick={() =>
          onChange([...choices, new_choice(choices.length + 1, type)])
        }
        className="inline-flex h-8 cursor-pointer items-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/85"
      >
        Create
      </button>
    </div>
  );
}

function LinkEditor({
  links,
  onChange,
}: {
  links: CmsLink[];
  onChange: (links: CmsLink[]) => void;
}) {
  const patch = (index: number, change: Partial<CmsLink>) => {
    onChange(
      links.map((link, linkIndex) =>
        linkIndex === index ? { ...link, ...change } : link
      )
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Buttons</h3>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-lg"
          onClick={() =>
            onChange([
              ...links,
              { label: "Button", type: "normal", actionType: "url" },
            ])
          }
        >
          <Plus className="size-4" />
          Add button
        </Button>
      </div>

      {links.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-4 text-center text-xs text-muted-foreground">
          No buttons configured yet.
        </div>
      ) : (
        links.map((link, index) => (
          <div
            key={index}
            className="space-y-3 rounded-lg border border-border bg-card p-3"
          >
            <div className="flex items-center gap-2">
              <Input
                value={link.label}
                placeholder="Label"
                className="h-13 flex-1 rounded-lg border-input bg-card"
                onChange={(event) =>
                  patch(index, { label: event.target.value })
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Remove button"
                onClick={() =>
                  onChange(
                    links.filter(
                      (_link, linkIndex) => linkIndex !== index
                    )
                  )
                }
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <IconPicker
                value={link.icon ?? ""}
                placeholder="Optional icon"
                className="rounded-lg"
                popoverClassName="field-drawer-popover"
                onChange={(icon) =>
                  patch(index, { icon: icon || undefined })
                }
              />
              <Input
                value={link.url ?? ""}
                placeholder="https://example.com"
                className="rounded-lg border-input bg-card"
                onChange={(event) =>
                  patch(index, { url: event.target.value || undefined })
                }
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="relative">
                <select
                  value={link.type ?? "normal"}
                  onChange={(event) =>
                    patch(index, {
                      type: event.target.value as CmsLink["type"],
                    })
                  }
                  className="h-13 w-full appearance-none rounded-lg border border-input bg-card px-3 pr-9 text-xs text-foreground outline-none"
                >
                  {LINK_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
              <div className="relative">
                <select
                  value={link.actionType ?? "url"}
                  onChange={(event) =>
                    patch(index, {
                      actionType: event.target
                        .value as CmsLink["actionType"],
                    })
                  }
                  className="h-13 w-full appearance-none rounded-lg border border-input bg-card px-3 pr-9 text-xs text-foreground outline-none"
                >
                  {LINK_ACTIONS.map((action) => (
                    <option key={action.value} value={action.value}>
                      {action.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function interfaces_for_type(type: CmsFieldType) {
  return INTERFACE_DEFINITIONS.filter(
    (definition) =>
      !definition.alias &&
      !LEGACY_INTERFACES.has(definition.id) &&
      definition.types.includes(type)
  );
}

function RepeaterFieldsEditor({
  fields,
  onChange,
}: {
  fields: CmsRepeaterField[];
  onChange: (fields: CmsRepeaterField[]) => void;
}) {
  const patch = (index: number, change: Partial<CmsRepeaterField>) => {
    onChange(
      fields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...change } : field
      )
    );
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    const [field] = next.splice(index, 1);
    next.splice(target, 0, field);
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Sub-fields</h3>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-lg"
          onClick={() =>
            onChange([
              ...fields,
              {
                field: `field_${fields.length + 1}`,
                name: `Field ${fields.length + 1}`,
                type: "string",
                interface: "input",
                width: "half",
              },
            ])
          }
        >
          <Plus className="size-4" />
          Add sub-field
        </Button>
      </div>

      {fields.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-4 text-center text-xs text-muted-foreground">
          No sub-fields yet. Add the first sub-field above.
        </div>
      ) : (
        fields.map((field, index) => {
          const type = field.type ?? "string";
          const interfaces = interfaces_for_type(type);
          return (
            <div
              key={index}
              className="space-y-3 rounded-lg border border-border bg-card p-3"
            >
              <div className="flex items-start gap-2">
                <div className="grid flex-1 gap-2 sm:grid-cols-2">
                  <Input
                    value={field.field}
                    placeholder="field_key"
                    className="rounded-lg border-input bg-card font-mono text-xs"
                    onChange={(event) =>
                      patch(index, {
                        field: slugify_field_name(event.target.value),
                      })
                    }
                  />
                  <Input
                    value={field.name ?? ""}
                    placeholder="Label"
                    className="rounded-lg border-input bg-card"
                    onChange={(event) =>
                      patch(index, { name: event.target.value })
                    }
                  />
                </div>
                <div className="flex items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Move sub-field up"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Move sub-field down"
                    disabled={index === fields.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Remove sub-field"
                    onClick={() =>
                      onChange(
                        fields.filter(
                          (_entry, fieldIndex) => fieldIndex !== index
                        )
                      )
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="relative">
                  <select
                    value={type}
                    onChange={(event) => {
                      const nextType = event.target.value as CmsFieldType;
                      const current = cms_interface_definition(
                        field.interface ?? "input"
                      );
                      const nextInterface = current.types.includes(nextType)
                        ? current.id
                        : interfaces_for_type(nextType)[0]?.id ??
                          current.id;
                      patch(index, {
                        type: nextType,
                        interface: nextInterface,
                      });
                    }}
                    className="h-13 w-full appearance-none rounded-lg border border-input bg-card px-3 pr-9 text-xs text-foreground outline-none"
                  >
                    {SUB_FIELD_TYPES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                </div>
                <div className="relative">
                  <select
                    value={field.interface ?? interfaces[0]?.id ?? "input"}
                    onChange={(event) => {
                      const nextInterface = event.target
                        .value as CmsFieldInterface;
                      const definition =
                        cms_interface_definition(nextInterface);
                      patch(index, {
                        interface: nextInterface,
                        type: definition.types.includes(type)
                          ? type
                          : definition.defaultType,
                      });
                    }}
                    className="h-13 w-full appearance-none rounded-lg border border-input bg-card px-3 pr-9 text-xs text-foreground outline-none"
                  >
                    {interfaces.map((definition) => (
                      <option key={definition.id} value={definition.id}>
                        {definition.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="relative">
                  <select
                    value={field.width ?? "half"}
                    onChange={(event) =>
                      patch(index, {
                        width: event.target.value === "full" ? "full" : "half",
                      })
                    }
                    className="h-13 w-full appearance-none rounded-lg border border-input bg-card px-3 pr-9 text-xs text-foreground outline-none"
                  >
                    <option value="half">Half width</option>
                    <option value="full">Full width</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                </div>
                <div className="flex h-12 items-center justify-between rounded-lg border border-input bg-card px-3">
                  <span className="text-xs font-medium text-foreground">
                    Required
                  </span>
                  <Switch
                    checked={field.required === true}
                    onCheckedChange={(checked) =>
                      patch(index, { required: checked })
                    }
                  />
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function LanguagesEditor({
  languages,
  onChange,
}: {
  languages: LanguageEntry[];
  onChange: (languages: LanguageEntry[]) => void;
}) {
  const patch = (index: number, change: Partial<LanguageEntry>) => {
    onChange(
      languages.map((language, languageIndex) =>
        languageIndex === index ? { ...language, ...change } : language
      )
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Languages</h3>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-lg"
          onClick={() => onChange([...languages, { code: "", label: "" }])}
        >
          <Plus className="size-4" />
          Add language
        </Button>
      </div>

      {languages.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-4 text-center text-xs text-muted-foreground">
          No languages yet. Add the first language above.
        </div>
      ) : (
        languages.map((language, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              value={language.code}
              placeholder="en"
              className="w-24 rounded-lg border-input bg-card font-mono text-xs"
              onChange={(event) =>
                patch(index, { code: event.target.value.trim() })
              }
            />
            <Input
              value={language.label}
              placeholder="English"
              className="flex-1 rounded-lg border-input bg-card"
              onChange={(event) =>
                patch(index, { label: event.target.value })
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Remove language"
              onClick={() =>
                onChange(
                  languages.filter(
                    (_entry, languageIndex) => languageIndex !== index
                  )
                )
              }
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))
      )}
    </div>
  );
}

function CollectionMultiSelect({
  collections,
  selected,
  onChange,
}: {
  collections: CmsCollectionWithFields[];
  selected: string[];
  onChange: (names: string[]) => void;
}) {
  const available = collections.filter((collection) => !collection.system);
  const toggle = (name: string) => {
    if (selected.includes(name)) {
      onChange(selected.filter((entry) => entry !== name));
    } else {
      onChange([...selected, name]);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Allowed collections
          </h3>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-lg"
          onClick={() => onChange([])}
        >
          Allow all
        </Button>
      </div>
      <div className="app-scrollbar max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border bg-card p-2">
        {available.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            No collections
          </p>
        ) : (
          available.map((collection) => (
            <label
              key={collection.name}
              className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm transition-colors hover:bg-muted"
            >
              <Checkbox
                checked={selected.includes(collection.name)}
                onCheckedChange={() => toggle(collection.name)}
              />
              <span className="min-w-0 flex-1 truncate">
                {collection.label || collection.name}
              </span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}

function RelationOptions({
  form,
  onOption,
  collections,
  collectionKey,
  allowNone = true,
}: {
  form: FieldFormState;
  onOption: (key: string | string[], value: unknown) => void;
  collections: CmsCollectionWithFields[];
  collectionKey: string;
  allowNone?: boolean;
}) {
  const related = text_option(
    form,
    collectionKey,
    "relatedCollection",
    "related_collection",
    "rel_collection",
    "collection",
    "selectedCollection",
    "selected_collection"
  );
  const available = collections.filter((collection) => !collection.system);

  return (
    <div className="space-y-4">
      <SelectField
        label="Related collection"
        value={related}
        onChange={(value) => onOption(RELATION_COLLECTION_KEYS, value)}
        options={[
          { value: "", label: "Select a collection" },
          ...available.map((collection) => ({
            value: collection.name,
            label: collection.label || collection.name,
          })),
        ]}
      />
      <TextField
        label="Display template"
        value={text_option(form, "template", "display_template")}
        placeholder="{{id}} - {{title}}"
        onChange={(value) =>
          onOption(["template", "display_template"], value)
        }
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          label="Limit"
          value={number_option(form, 25, "limit")}
          onChange={(value) => onOption("limit", value)}
        />
        {allowNone ? (
          <ToggleField
            label="Allow empty selection"
            checked={bool_option(form, true, "allowNone", "allow_none")}
            onChange={(value) =>
              onOption(["allowNone", "allow_none"], value)
            }
          />
        ) : null}
      </div>
    </div>
  );
}

export interface InterfaceOptionsProps {
  form: FieldFormState;
  onOption: (key: string | string[], value: unknown) => void;
  onChoices: (choices: CmsChoice[]) => void;
  collections: CmsCollectionWithFields[];
}

export function InterfaceOptions({
  form,
  onOption,
  onChoices,
  collections,
}: InterfaceOptionsProps) {
  const iface = form.interface;
  const choices = (tree = false) => (
    <ChoiceEditor
      choices={form.choices}
      onChange={onChoices}
      type={form.type}
      tree={tree}
    />
  );

  if (iface === "input" || iface === "number") {
    return (
      <div className="space-y-4">
        <TextField
          label="Placeholder"
          value={text_option(form, "placeholder")}
          placeholder="Enter text..."
          onChange={(value) => onOption("placeholder", value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <IconField
            label="Icon left"
            value={text_option(form, "iconLeft", "icon_left")}
            placeholder="Optional left icon"
            onChange={(value) =>
              onOption(["iconLeft", "icon_left"], value)
            }
          />
          <IconField
            label="Icon right"
            value={text_option(form, "iconRight", "icon_right")}
            placeholder="Optional right icon"
            onChange={(value) =>
              onOption(["iconRight", "icon_right"], value)
            }
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Font"
            value={text_option(form, "font") || "sans-serif"}
            onChange={(value) => onOption("font", value)}
            options={FONT_OPTIONS}
          />
          <ToggleField
            label="Trim whitespace"
            checked={bool_option(form, false, "trim")}
            onChange={(value) => onOption("trim", value)}
          />
        </div>
        <ToggleField
          label="Mask value"
          checked={bool_option(form, false, "masked")}
          onChange={(value) => onOption("masked", value)}
        />
      </div>
    );
  }

  if (iface === "input_autocomplete_api") {
    return (
      <div className="space-y-4">
        <TextField
          label="Lookup URL"
          value={text_option(form, "url", "endpoint")}
          placeholder="https://api.example.com/search"
          onChange={(value) => onOption(["url", "endpoint"], value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Trigger"
            value={text_option(form, "trigger") || "debounce"}
            onChange={(value) => onOption("trigger", value)}
            options={[
              { value: "debounce", label: "While typing" },
              { value: "enter", label: "On Enter" },
            ]}
          />
          <NumberField
            label="Delay (ms)"
            value={number_option(form, 500, "rate")}
            onChange={(value) => onOption("rate", value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label="Results path"
            value={text_option(
              form,
              "resultsPath",
              "responsePath",
              "response_path"
            )}
            placeholder="data.items"
            onChange={(value) =>
              onOption(
                ["resultsPath", "responsePath", "response_path"],
                value
              )
            }
          />
          <TextField
            label="Text path"
            value={text_option(form, "textPath", "text_path")}
            placeholder="text"
            onChange={(value) => onOption(["textPath", "text_path"], value)}
          />
          <TextField
            label="Value path"
            value={text_option(form, "valuePath", "value_path")}
            placeholder="value"
            onChange={(value) =>
              onOption(["valuePath", "value_path"], value)
            }
          />
        </div>
        <TextField
          label="Placeholder"
          value={text_option(form, "placeholder")}
          placeholder="Start typing..."
          onChange={(value) => onOption("placeholder", value)}
        />
      </div>
    );
  }

  if (iface === "block_editor") {
    return (
      <div className="space-y-4">
        <TextField
          label="Placeholder"
          value={text_option(form, "placeholder")}
          placeholder="Write content..."
          onChange={(value) => onOption("placeholder", value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Font"
            value={text_option(form, "font") || "sans-serif"}
            onChange={(value) => onOption("font", value)}
            options={FONT_OPTIONS}
          />
          <ToggleField
            label="Bordered editor"
            checked={bool_option(form, true, "bordered")}
            onChange={(value) => onOption("bordered", value)}
          />
        </div>
      </div>
    );
  }

  if (iface === "code" || iface === "json") {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Language"
            value={text_option(form, "language") || "plaintext"}
            onChange={(value) => onOption("language", value)}
            options={CODE_LANGUAGES}
          />
          <TextField
            label="Placeholder"
            value={text_option(form, "placeholder")}
            placeholder="Write code..."
            onChange={(value) => onOption("placeholder", value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <ToggleField
            label="Line numbers"
            checked={bool_option(form, true, "lineNumber", "line_number")}
            onChange={(value) =>
              onOption(["lineNumber", "line_number"], value)
            }
          />
          <ToggleField
            label="Wrap lines"
            checked={bool_option(
              form,
              false,
              "lineWrapping",
              "line_wrapping"
            )}
            onChange={(value) =>
              onOption(["lineWrapping", "line_wrapping"], value)
            }
          />
        </div>
      </div>
    );
  }

  if (iface === "textarea") {
    return (
      <div className="space-y-4">
        <TextField
          label="Placeholder"
          value={text_option(form, "placeholder")}
          placeholder="Enter long text..."
          onChange={(value) => onOption("placeholder", value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Soft limit"
            value={number_option(form, 0, "softLength", "soft_limit")}
            onChange={(value) =>
              onOption(["softLength", "soft_limit"], value)
            }
          />
          <SelectField
            label="Font"
            value={text_option(form, "font") || "sans-serif"}
            onChange={(value) => onOption("font", value)}
            options={FONT_OPTIONS}
          />
        </div>
        <ToggleField
          label="Trim whitespace"
          checked={bool_option(form, false, "trim")}
          onChange={(value) => onOption("trim", value)}
        />
      </div>
    );
  }

  if (iface === "wysiwyg") {
    return (
      <div className="space-y-4">
        <TextField
          label="Placeholder"
          value={text_option(form, "placeholder")}
          placeholder="Write content..."
          onChange={(value) => onOption("placeholder", value)}
        />
        <SelectField
          label="Font"
          value={text_option(form, "font") || "sans-serif"}
          onChange={(value) => onOption("font", value)}
          options={FONT_OPTIONS}
        />
      </div>
    );
  }

  if (iface === "markdown") {
    return (
      <div className="space-y-4">
        <TextField
          label="Placeholder"
          value={text_option(form, "placeholder")}
          placeholder="Write Markdown..."
          onChange={(value) => onOption("placeholder", value)}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            label="Default view"
            value={text_option(form, "defaultView", "default_view") || "editor"}
            onChange={(value) =>
              onOption(["defaultView", "default_view"], value)
            }
            options={[
              { value: "editor", label: "Write" },
              { value: "preview", label: "Preview" },
            ]}
          />
          <SelectField
            label="Editor font"
            value={text_option(form, "editorFont", "editor_font") || "sans-serif"}
            onChange={(value) =>
              onOption(["editorFont", "editor_font"], value)
            }
            options={FONT_OPTIONS}
          />
          <SelectField
            label="Preview font"
            value={text_option(form, "previewFont", "preview_font") || "sans-serif"}
            onChange={(value) =>
              onOption(["previewFont", "preview_font"], value)
            }
            options={FONT_OPTIONS}
          />
        </div>
      </div>
    );
  }

  if (iface === "tags") {
    return (
      <div className="space-y-4">
        <TextField
          label="Placeholder"
          value={text_option(form, "placeholder")}
          placeholder="Add tag and press Enter..."
          onChange={(value) => onOption("placeholder", value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <ToggleField
            label="Allow custom tags"
            checked={bool_option(form, true, "allowCustom", "allow_custom")}
            onChange={(value) =>
              onOption(["allowCustom", "allow_custom"], value)
            }
          />
          <ToggleField
            label="Alphabetize tags"
            checked={bool_option(form, false, "alphabetize")}
            onChange={(value) => onOption("alphabetize", value)}
          />
        </div>
        <IconField
          label="Icon right"
          value={text_option(form, "iconRight", "icon_right")}
          placeholder="Optional trailing icon"
          onChange={(value) =>
            onOption(["iconRight", "icon_right"], value)
          }
        />
        {choices()}
      </div>
    );
  }

  if (iface === "toggle") {
    return (
      <div className="space-y-4">
        <TextField
          label="Label when enabled"
          value={text_option(form, "label") || "Enabled"}
          onChange={(value) => onOption("label", value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <IconField
            label="Icon on"
            value={text_option(form, "iconOn", "icon_on") || "check"}
            onChange={(value) => onOption(["iconOn", "icon_on"], value)}
          />
          <IconField
            label="Icon off"
            value={text_option(form, "iconOff", "icon_off") || "x"}
            onChange={(value) => onOption(["iconOff", "icon_off"], value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <ColorField
            label="Color on"
            value={text_option(form, "colorOn", "color_on")}
            onChange={(value) => onOption(["colorOn", "color_on"], value)}
          />
          <ColorField
            label="Color off"
            value={text_option(form, "colorOff", "color_off")}
            onChange={(value) => onOption(["colorOff", "color_off"], value)}
          />
        </div>
      </div>
    );
  }

  if (iface === "datetime") {
    const storedFormat = text_option(form, "format");
    const legacyDateFormat = storedFormat === "date" && !text_option(form, "type");
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Type"
            value={
              text_option(form, "type") ||
              (legacyDateFormat ? "date" : "datetime")
            }
            onChange={(value) => onOption("type", value)}
            options={[
              { value: "datetime", label: "DateTime" },
              { value: "date", label: "Date" },
              { value: "time", label: "Time" },
              { value: "timestamp", label: "Timestamp" },
            ]}
          />
          <ToggleField
            label="Relative"
            checked={bool_option(form, false, "relative")}
            onChange={(value) => onOption("relative", value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Format"
            value={legacyDateFormat ? "long" : storedFormat || "long"}
            onChange={(value) => onOption("format", value)}
            options={[
              { value: "long", label: "Long" },
              { value: "short", label: "Short" },
            ]}
          />
          <ToggleField
            label="Use 24-Hour Format"
            checked={bool_option(form, false, "use24Hour", "use_24_hour")}
            onChange={(value) =>
              onOption(["use24Hour", "use_24_hour"], value)
            }
          />
        </div>
        <ToggleField
          label="Include seconds"
          checked={bool_option(form, false, "includeSeconds", "include_seconds")}
          onChange={(value) =>
            onOption(["includeSeconds", "include_seconds"], value)
          }
        />
      </div>
    );
  }

  if (iface === "repeater") {
    return (
      <div className="space-y-4">
        <TextField
          label="Add button label"
          value={text_option(form, "addLabel", "add_label") || "Create New"}
          onChange={(value) => onOption(["addLabel", "add_label"], value)}
        />
        <RepeaterFieldsEditor
          fields={cms_normalize_repeater_fields(form.options.fields)}
          onChange={(fields) => onOption("fields", fields)}
        />
      </div>
    );
  }

  if (iface === "map") {
    return (
      <div className="space-y-4">
        <div className="grid gap-1.5">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="map-geometry-type">
            Geometry type
          </label>
          <select
            id="map-geometry-type"
            className="h-10 rounded-lg border border-input bg-card px-3 text-sm"
            value={text_option(form, "geometryType", "geometry_type") || "Point"}
            onChange={(event) => onOption(["geometryType", "geometry_type"], event.target.value)}
          >
            {["Point", "LineString", "Polygon", "MultiPoint", "MultiLineString"].map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Height (px)"
            value={number_option(form, 320, "height")}
            onChange={(value) => onOption("height", value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Default latitude"
            value={number_option(form, 0, "defaultLat", "default_lat")}
            onChange={(value) =>
              onOption(["defaultLat", "default_lat"], value)
            }
          />
          <NumberField
            label="Default longitude"
            value={number_option(form, 0, "defaultLng", "default_lng")}
            onChange={(value) =>
              onOption(["defaultLng", "default_lng"], value)
            }
          />
        </div>
        <NumberField
          label="Default zoom"
          value={number_option(form, 2, "defaultZoom", "default_zoom")}
          onChange={(value) =>
            onOption(["defaultZoom", "default_zoom"], value)
          }
        />
      </div>
    );
  }

  if (iface === "color") {
    return (
      <ToggleField
        label="Allow opacity"
        checked={bool_option(form, false, "opacity")}
        onChange={(value) => onOption("opacity", value)}
      />
    );
  }

  if (iface === "dropdown" || iface === "select") {
    return (
      <div className="space-y-4">
        {choices()}
        <TextField
          label="Placeholder"
          value={text_option(form, "placeholder")}
          placeholder="Select an item..."
          onChange={(value) => onOption("placeholder", value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <ToggleField
            label="Allow empty selection"
            checked={bool_option(form, true, "allowNone", "allow_none")}
            onChange={(value) =>
              onOption(["allowNone", "allow_none"], value)
            }
          />
          <ToggleField
            label="Allow custom values"
            checked={bool_option(form, false, "allowOther", "allow_other")}
            onChange={(value) =>
              onOption(["allowOther", "allow_other"], value)
            }
          />
        </div>
      </div>
    );
  }

  if (iface === "icon") {
    return (
      <TextField
        label="Placeholder"
        value={text_option(form, "placeholder")}
        placeholder="Select an icon"
        onChange={(value) => onOption("placeholder", value)}
      />
    );
  }

  if (iface === "checkboxes" || iface === "checkboxes_tree") {
    return (
      <div className="space-y-4">
        {choices(iface === "checkboxes_tree")}
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Items shown"
            value={number_option(form, 8, "itemsShown", "items_shown")}
            onChange={(value) =>
              onOption(["itemsShown", "items_shown"], value)
            }
          />
          <ToggleField
            label="Allow custom values"
            checked={bool_option(form, false, "allowOther", "allow_other")}
            onChange={(value) =>
              onOption(["allowOther", "allow_other"], value)
            }
          />
        </div>
      </div>
    );
  }

  if (iface === "dropdown_multiselect") {
    return (
      <div className="space-y-4">
        {choices()}
        <TextField
          label="Placeholder"
          value={text_option(form, "placeholder")}
          placeholder="Select items..."
          onChange={(value) => onOption("placeholder", value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Preview count"
            value={number_option(
              form,
              3,
              "previewThreshold",
              "preview_threshold"
            )}
            onChange={(value) =>
              onOption(["previewThreshold", "preview_threshold"], value)
            }
          />
          <ToggleField
            label="Allow custom values"
            checked={bool_option(form, false, "allowOther", "allow_other")}
            onChange={(value) =>
              onOption(["allowOther", "allow_other"], value)
            }
          />
        </div>
      </div>
    );
  }

  if (iface === "radio") {
    return (
      <div className="space-y-4">
        {choices()}
        <ToggleField
          label="Allow custom values"
          checked={bool_option(form, false, "allowOther", "allow_other")}
          onChange={(value) =>
            onOption(["allowOther", "allow_other"], value)
          }
        />
      </div>
    );
  }

  if (iface === "file" || iface === "image" || iface === "files") {
    return (
      <div className="space-y-4">
        <TextField
          label="Root folder"
          value={text_option(form, "folder")}
          placeholder="e.g. catalog/products"
          onChange={(value) => onOption("folder", value)}
        />
      </div>
    );
  }

  if (iface === "builder_m2a") {
    return (
      <div className="space-y-4">
        <CollectionMultiSelect
          collections={collections}
          selected={list_option(
            form,
            "allowedCollections",
            "allowed_collections",
            "collections"
          ).map(String)}
          onChange={(names) =>
            onOption(
              ["allowedCollections", "allowed_collections"],
              names
            )
          }
        />
        <NumberField
          label="Limit"
          value={number_option(form, 15, "limit")}
          onChange={(value) => onOption("limit", value)}
        />
      </div>
    );
  }

  if (iface === "many_to_many" || iface === "one_to_many") {
    return (
      <RelationOptions
        form={form}
        onOption={onOption}
        collections={collections}
        collectionKey="relatedCollection"
        allowNone={false}
      />
    );
  }

  if (iface === "tree_view") {
    return (
      <div className="space-y-4">
        <RelationOptions
          form={form}
          onOption={onOption}
          collections={collections}
          collectionKey="relatedCollection"
        />
        <TextField
          label="Parent field"
          value={text_option(form, "parentField", "parent_field") || "parent"}
          placeholder="parent"
          onChange={(value) =>
            onOption(["parentField", "parent_field"], value)
          }
        />
      </div>
    );
  }

  if (
    iface === "many_to_one" ||
    iface === "relation" ||
    iface === "collection_item_dropdown"
  ) {
    return (
      <RelationOptions
        form={form}
        onOption={onOption}
        collections={collections}
        collectionKey={
          iface === "collection_item_dropdown"
            ? "selectedCollection"
            : "relatedCollection"
        }
      />
    );
  }

  if (iface === "collection_item_dropdown_multiple") {
    return (
      <RelationOptions
        form={form}
        onOption={onOption}
        collections={collections}
        collectionKey="selectedCollection"
        allowNone={false}
      />
    );
  }

  if (iface === "translations") {
    const languages = read_languages(form);
    const defaultLanguage =
      text_option(form, "defaultLanguage", "default_language") ||
      languages[0]?.code ||
      "en";
    const languageOptions = languages.some(
      (language) => language.code === defaultLanguage
    )
      ? languages.map((language) => ({
          value: language.code,
          label: language.label || language.code,
        }))
      : [
          { value: defaultLanguage, label: defaultLanguage },
          ...languages.map((language) => ({
            value: language.code,
            label: language.label || language.code,
          })),
        ];

    return (
      <div className="space-y-4">
        <LanguagesEditor
          languages={languages}
          onChange={(next) => onOption("languages", next)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Default language"
            value={defaultLanguage}
            onChange={(value) =>
              onOption(["defaultLanguage", "default_language"], value)
            }
            options={languageOptions}
          />
          <TextField
            label="Language field"
            value={text_option(form, "languageField", "language_field")}
            placeholder="language"
            onChange={(value) =>
              onOption(["languageField", "language_field"], value)
            }
          />
        </div>
        <ToggleField
          label="Use the current user's language"
          checked={bool_option(
            form,
            false,
            "userLanguage",
            "user_language"
          )}
          onChange={(value) =>
            onOption(["userLanguage", "user_language"], value)
          }
        />
      </div>
    );
  }

  if (iface === "header") {
    return (
      <div className="space-y-4">
        <TextField
          label="Title"
          value={text_option(form, "title") || form.label}
          placeholder="Section title"
          onChange={(value) => onOption("title", value)}
        />
        <TextField
          label="Subtitle"
          value={text_option(form, "subtitle")}
          placeholder="Optional supporting text"
          onChange={(value) => onOption("subtitle", value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <IconField
            label="Header icon"
            value={text_option(form, "headerIcon", "header_icon", "icon")}
            onChange={(value) =>
              onOption(["headerIcon", "header_icon"], value)
            }
          />
          <ColorField
            label="Header color"
            value={text_option(
              form,
              "headerColor",
              "header_color",
              "color"
            )}
            onChange={(value) =>
              onOption(["headerColor", "header_color"], value)
            }
          />
        </div>
      </div>
    );
  }

  if (iface === "divider") {
    return (
      <div className="space-y-4">
        <TextField
          label="Title"
          value={text_option(form, "title") || form.label}
          placeholder="Section title"
          onChange={(value) => onOption("title", value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <IconField
            label="Icon"
            value={text_option(form, "icon")}
            onChange={(value) => onOption("icon", value)}
          />
          <ColorField
            label="Color"
            value={text_option(form, "color")}
            onChange={(value) => onOption("color", value)}
          />
        </div>
        <ToggleField
          label="Inline title"
          checked={bool_option(form, false, "inlineTitle", "inline_title")}
          onChange={(value) =>
            onOption(["inlineTitle", "inline_title"], value)
          }
        />
      </div>
    );
  }

  if (iface === "buttons") {
    return (
      <LinkEditor
        links={normalize_links(list_option(form, "links"))}
        onChange={(links) => onOption("links", links)}
      />
    );
  }

  if (iface === "notice") {
    return (
      <div className="space-y-4">
        <SingleLineField
          label="Notice text"
          value={text_option(form, "text") || form.label}
          placeholder="Helpful instruction or callout notice..."
          onChange={(value) => onOption("text", value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <IconField
            label="Icon"
            value={text_option(form, "icon") || "info"}
            onChange={(value) => onOption("icon", value)}
          />
          <SelectField
            label="Color"
            value={text_option(form, "color") || "normal"}
            onChange={(value) => onOption("color", value)}
            options={NOTICE_COLORS}
          />
        </div>
      </div>
    );
  }

  if (iface === "accordion") {
    return (
      <div className="space-y-4">
        <TextField
          label="Group title"
          value={text_option(form, "title") || form.label}
          placeholder="Group title"
          onChange={(value) => onOption("title", value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Initial state"
            value={text_option(form, "start") || "open"}
            onChange={(value) => onOption("start", value)}
            options={START_OPTIONS}
          />
          <ToggleField
            label="Accordion mode"
            checked={bool_option(
              form,
              true,
              "accordionMode",
              "accordion_mode"
            )}
            onChange={(value) =>
              onOption(["accordionMode", "accordion_mode"], value)
            }
          />
        </div>
      </div>
    );
  }

  if (iface === "detail_group") {
    return (
      <div className="space-y-4">
        <TextField
          label="Group title"
          value={text_option(form, "title") || form.label}
          placeholder="Group title"
          onChange={(value) => onOption("title", value)}
        />
        <SelectField
          label="Initial state"
          value={text_option(form, "start") || "open"}
          onChange={(value) => onOption("start", value)}
          options={START_OPTIONS}
        />
      </div>
    );
  }

  if (iface === "raw_group") {
    return (
      <TextField
        label="Group title"
        value={text_option(form, "title") || form.label}
        placeholder="Group title"
        onChange={(value) => onOption("title", value)}
      />
    );
  }

  if (iface === "hash") {
    return (
      <div className="space-y-4">
        <TextField
          label="Placeholder"
          value={text_option(form, "placeholder")}
          placeholder="Enter a secret value"
          onChange={(value) => onOption("placeholder", value)}
        />
        <ToggleField
          label="Mask value"
          checked={bool_option(form, true, "masked")}
          onChange={(value) => onOption("masked", value)}
        />
      </div>
    );
  }

  if (iface === "slider") {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField
            label="Minimum"
            value={number_option(form, 0, "minValue", "min")}
            onChange={(value) => onOption(["minValue", "min"], value)}
          />
          <NumberField
            label="Maximum"
            value={number_option(form, 100, "maxValue", "max")}
            onChange={(value) => onOption(["maxValue", "max"], value)}
          />
          <NumberField
            label="Step"
            value={number_option(form, 1, "stepInterval", "step")}
            onChange={(value) =>
              onOption(["stepInterval", "step"], value)
            }
          />
        </div>
        <ToggleField
          label="Always show value"
          checked={bool_option(
            form,
            true,
            "alwaysShowValue",
            "always_show_value"
          )}
          onChange={(value) =>
            onOption(["alwaysShowValue", "always_show_value"], value)
          }
        />
      </div>
    );
  }

  return null;
}

export function DefaultValueEditor({
  form,
  onChange,
}: {
  form: FieldFormState;
  onChange: (value: string) => void;
}) {
  const definition = cms_interface_definition(form.interface);
  if (definition.alias) return null;

  const iface = form.interface;
  const type = form.type;
  const value = form.defaultValue;

  if (iface === "datetime") {
    const dateType =
      text_option(form, "type") ||
      (text_option(form, "format") === "date" ? "date" : "datetime");
    const includeSeconds = bool_option(
      form,
      false,
      "includeSeconds",
      "include_seconds"
    );
    const inputType =
      dateType === "date"
        ? "date"
        : dateType === "time"
          ? "time"
          : "datetime-local";
    let inputValue = value;
    if (inputType === "datetime-local" && value) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        const pad = (part: number) => String(part).padStart(2, "0");
        inputValue = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
          date.getDate()
        )}T${pad(date.getHours())}:${pad(date.getMinutes())}${
          includeSeconds ? `:${pad(date.getSeconds())}` : ""
        }`;
      }
    } else if (inputType === "date" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      inputValue = value.slice(0, 10);
    } else if (inputType === "time") {
      if (/^\d{2}:\d{2}/.test(value)) {
        inputValue = value.slice(0, includeSeconds ? 8 : 5);
      } else {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) {
          const pad = (part: number) => String(part).padStart(2, "0");
          inputValue = `${pad(date.getHours())}:${pad(date.getMinutes())}${
            includeSeconds ? `:${pad(date.getSeconds())}` : ""
          }`;
        }
      }
    }

    return (
      <TextField
        label="Default value"
        type={inputType}
        step={includeSeconds ? "1" : undefined}
        value={inputValue}
        onChange={(next) => {
          if (!next || inputType !== "datetime-local") {
            onChange(next);
            return;
          }
          const date = new Date(next);
          onChange(Number.isNaN(date.getTime()) ? next : date.toISOString());
        }}
      />
    );
  }

  if (type === "boolean" || iface === "toggle") {
    return (
      <ToggleField
        label="Default value"
        checked={value === "true" || value === "1"}
        onChange={(checked) => onChange(checked ? "true" : "false")}
      />
    );
  }

  if (iface === "color") {
    return (
      <ColorField
        label="Default value"
        value={value}
        onChange={onChange}
      />
    );
  }

  if (iface === "icon") {
    return (
      <IconField
        label="Default value"
        value={value}
        placeholder="Choose a default icon"
        onChange={onChange}
      />
    );
  }

  if (type === "integer" || type === "decimal" || iface === "slider") {
    return (
      <NumberField
        label="Default value"
        value={value.trim() === "" ? 0 : Number(value)}
        onChange={(next) => onChange(next === "" ? "" : String(next))}
      />
    );
  }

  if (
    type === "json" ||
    iface === "block_editor" ||
    iface === "repeater" ||
    iface === "map" ||
    iface === "files" ||
    iface === "builder_m2a" ||
    iface === "many_to_many" ||
    iface === "one_to_many" ||
    iface === "translations" ||
    iface === "collection_item_dropdown_multiple"
  ) {
    return (
      <SingleLineField
        label="Default value (JSON)"
        value={value}
        placeholder="[]"
        onChange={onChange}
      />
    );
  }

  if (
    (iface === "dropdown" ||
      iface === "radio" ||
      iface === "select") &&
    form.choices.length > 0
  ) {
    return (
      <SelectField
        label="Default value"
        value={value}
        onChange={onChange}
        options={[
          { value: "", label: "No default" },
          ...form.choices.map((choice) => ({
            value: String(choice.value),
            label: choice.text,
          })),
        ]}
      />
    );
  }

  if (
    iface === "textarea" ||
    iface === "wysiwyg" ||
    iface === "markdown" ||
    iface === "code"
  ) {
    return (
      <SingleLineField
        label="Default value"
        value={value}
        onChange={onChange}
      />
    );
  }

  return (
    <TextField
      label="Default value"
      value={value}
      placeholder={
        iface === "image" || iface === "file"
          ? "https://example.com/image.jpg"
          : "Default value if not set"
      }
      onChange={onChange}
    />
  );
}
