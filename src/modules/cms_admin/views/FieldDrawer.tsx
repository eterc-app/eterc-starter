"use client";

import { useMemo, useState } from "react";
import {
  AlignLeft,
  ArrowLeft,
  Box,
  Braces,
  Calendar,
  ChevronDown,
  Code,
  File,
  FileCode,
  FileText,
  FolderTree,
  Hash,
  Heading,
  Image as ImageIcon,
  Languages,
  Layers,
  Link,
  List,
  ListFilter,
  MapPin,
  Minus,
  MousePointer,
  Palette,
  Radio,
  Repeat,
  Search,
  Sliders,
  Sparkles,
  Tag,
  ToggleLeft,
  Type,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import type {
  CmsCollectionWithFields,
  CmsField,
  CmsFieldInterface,
  CmsFieldType,
} from "@/modules/cms/cms-types";
import {
  CMS_INTERFACE_GROUPS,
  CMS_INTERFACES,
  cms_interface_definition,
  cms_interface_defaults,
  cms_is_alias_interface,
  cms_is_group_interface,
} from "@/modules/cms/cms-interfaces";
import type { FieldFormState } from "./field-form";
import { slugify_field_name } from "./field-form";
import { DefaultValueEditor, InterfaceOptions } from "./FieldOptions";
import { BusyButton, FIELD_TYPE_OPTIONS } from "./ui";

const INTERFACE_DEFINITIONS = Object.values(CMS_INTERFACES);
const LEGACY_INTERFACES = new Set<CmsFieldInterface>([
  "number",
  "json",
  "select",
  "relation",
]);

const TYPE_LABELS: Record<CmsFieldType, string> = {
  ...Object.fromEntries(
    FIELD_TYPE_OPTIONS.map((option) => [option.value, option.label])
  ),
  alias: "Alias (metadata only)",
} as Record<CmsFieldType, string>;

const INTERFACE_ICONS: Record<
  CmsFieldInterface,
  React.ComponentType<{ className?: string }>
> = {
  input: Type,
  input_autocomplete_api: Search,
  block_editor: Box,
  code: Code,
  textarea: AlignLeft,
  wysiwyg: FileText,
  markdown: FileCode,
  tags: Tag,
  toggle: ToggleLeft,
  datetime: Calendar,
  repeater: Repeat,
  map: MapPin,
  color: Palette,
  dropdown: ListFilter,
  icon: Sparkles,
  checkboxes: List,
  checkboxes_tree: FolderTree,
  dropdown_multiselect: ListFilter,
  radio: Radio,
  file: File,
  image: ImageIcon,
  files: Layers,
  builder_m2a: Box,
  many_to_many: Link,
  one_to_many: FolderTree,
  tree_view: FolderTree,
  many_to_one: Link,
  translations: Languages,
  header: Heading,
  divider: Minus,
  buttons: MousePointer,
  notice: Sparkles,
  accordion: List,
  detail_group: Box,
  raw_group: Braces,
  collection_item_dropdown: ListFilter,
  collection_item_dropdown_multiple: ListFilter,
  hash: Hash,
  slider: Sliders,
  number: Hash,
  json: Braces,
  select: ListFilter,
  relation: Link,
};

function interfaces_for_type(type: CmsFieldType) {
  return INTERFACE_DEFINITIONS.filter(
    (definition) =>
      !definition.alias &&
      !LEGACY_INTERFACES.has(definition.id) &&
      definition.types.includes(type)
  );
}

function first_interface_for_type(type: CmsFieldType): CmsFieldInterface {
  return interfaces_for_type(type)[0]?.id ?? "input";
}

function interface_choices(
  editingField: CmsField | null,
  type: CmsFieldType
) {
  if (!editingField) {
    return INTERFACE_DEFINITIONS.filter(
      (definition) => !LEGACY_INTERFACES.has(definition.id)
    );
  }
  const editingAlias = type === "alias";
  return INTERFACE_DEFINITIONS.filter(
    (definition) =>
      !LEGACY_INTERFACES.has(definition.id) ||
      definition.id === editingField.interface
  )
    .filter((definition) => (definition.alias === true) === editingAlias)
    .filter((definition) => definition.types.includes(type));
}

function display_label(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export interface FieldDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionName: string;
  collections?: CmsCollectionWithFields[];
  collectionFields?: CmsField[];
  editingField?: CmsField | null;
  form: FieldFormState;
  setForm: React.Dispatch<React.SetStateAction<FieldFormState>>;
  saving: boolean;
  onSave: () => void;
}

export function FieldDrawer({
  open,
  onOpenChange,
  collectionName,
  collections = [],
  collectionFields = [],
  editingField,
  form,
  setForm,
  saving,
  onSave,
}: FieldDrawerProps) {
  const [step, setStep] = useState<"select-type" | "configure">(
    editingField ? "configure" : "select-type"
  );
  const [search, setSearch] = useState("");
  const [previousSession, setPreviousSession] = useState({
    open,
    editingField,
  });
  if (
    previousSession.open !== open ||
    previousSession.editingField !== editingField
  ) {
    setPreviousSession({ open, editingField });
    if (open) {
      setStep(editingField ? "configure" : "select-type");
      setSearch("");
    }
  }

  const availableInterfaces = useMemo(
    () => interface_choices(editingField ?? null, form.type),
    [editingField, form.type]
  );

  const filteredInterfaces = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return availableInterfaces;
    return availableInterfaces.filter(
      (definition) =>
        definition.label.toLowerCase().includes(query) ||
        definition.id.toLowerCase().includes(query) ||
        definition.group.toLowerCase().includes(query) ||
        definition.types.some((type) => type.includes(query))
    );
  }, [availableInterfaces, search]);

  const definition = cms_interface_definition(form.interface);
  const alias = cms_is_alias_interface(form.interface);

  const typeOptions = useMemo(() => {
    const types = definition.types;
    return types.map((type) => ({
      value: type,
      label: TYPE_LABELS[type] ?? type,
    }));
  }, [definition]);

  const groupFields = useMemo(
    () =>
      collectionFields.filter(
        (field) =>
          cms_is_group_interface(field.interface) && field.name !== form.name
      ),
    [collectionFields, form.name]
  );

  const selectInterface = (nextInterface: CmsFieldInterface) => {
    const nextDefinition = cms_interface_definition(nextInterface);
    setForm((current) => {
      const type = editingField
        ? current.type
        : nextDefinition.types.includes(current.type)
          ? current.type
          : nextDefinition.defaultType;
      return {
        ...current,
        interface: nextInterface,
        type,
        options:
          current.interface === nextInterface
            ? current.options
            : editingField
              ? { ...cms_interface_defaults(nextInterface), ...current.options }
              : cms_interface_defaults(nextInterface),
      };
    });
    setStep("configure");
  };

  const changeType = (nextType: CmsFieldType) => {
    setForm((current) => {
      const currentDefinition = cms_interface_definition(current.interface);
      if (currentDefinition.types.includes(nextType)) {
        return { ...current, type: nextType };
      }
      const nextInterface = first_interface_for_type(nextType);
      return {
        ...current,
        type: nextType,
        interface: nextInterface,
        options: {
          ...cms_interface_defaults(nextInterface),
          ...current.options,
        },
      };
    });
  };

  const updateOption = (key: string | string[], value: unknown) => {
    setForm((current) => {
      const nextOptions = { ...current.options };
      const keys = Array.isArray(key) ? key : [key];
      for (const optionKey of keys) {
        if (value === undefined || value === null || value === "") {
          delete nextOptions[optionKey];
        } else {
          nextOptions[optionKey] = value;
        }
      }
      return { ...current, options: nextOptions };
    });
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSearch("");
      setStep(editingField ? "configure" : "select-type");
    }
    onOpenChange(nextOpen);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="flex max-w-[680px] flex-col gap-0 border-l border-border bg-card p-0"
      >
        <SheetHeader className="border-b border-border bg-card p-4 pr-12">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              {step === "configure" && !editingField ? (
                <button
                  type="button"
                  onClick={() => setStep("select-type")}
                  className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-subtle hover:text-foreground"
                  aria-label="Back to interface selection"
                >
                  <ArrowLeft className="size-4" />
                </button>
              ) : (
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-surface-subtle text-foreground">
                  <Box className="size-4" />
                </span>
              )}
              <DialogTitle className="truncate text-sm font-semibold text-foreground">
                {editingField
                  ? form.label.trim() || "Edit field"
                  : step === "select-type"
                    ? `New field · ${collectionName}`
                    : form.label.trim() || "New field"}
              </DialogTitle>
            </div>

            {step === "select-type" ? (
              <div className="relative w-44 shrink-0">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search interfaces..."
                  className="h-8 rounded-lg border-none bg-surface-subtle pl-8 text-xs"
                />
              </div>
            ) : null}
          </div>
        </SheetHeader>

        <SheetBody className="app-scrollbar flex-1 overflow-y-auto p-6">
          {step === "select-type" ? (
            <div className="space-y-6">
              {CMS_INTERFACE_GROUPS.map((group) => {
                const items = filteredInterfaces.filter(
                  (item) => item.group === group
                );
                if (items.length === 0) return null;
                return (
                  <div key={group} className="space-y-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {group}
                    </p>
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                      {items.map((item) => {
                        const Icon = INTERFACE_ICONS[item.id] ?? Box;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => selectInterface(item.id)}
                            className="group flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface-subtle/40 p-3 text-center transition-all hover:border-foreground/30 hover:bg-surface-subtle"
                          >
                            <span className="grid size-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground shadow-xs transition-colors group-hover:text-foreground">
                              <Icon className="size-4" />
                            </span>
                            <span className="w-full truncate text-xs font-medium text-foreground">
                              {item.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {filteredInterfaces.length === 0 ? (
                <div className="rounded-xl border border-border bg-card p-8 text-center text-xs text-muted-foreground">
                  No interface matches “{search}”.
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-5">
              <section className="space-y-4 rounded-xl border border-border bg-surface-subtle/40 p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="field-key" className="text-sm font-semibold">
                      Key <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="field-key"
                      value={form.name}
                      disabled={editingField !== null}
                      placeholder="e.g. first_name"
                      className="rounded-lg border-input bg-card font-mono text-sm"
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          name: slugify_field_name(event.target.value),
                        }))
                      }
                      onBlur={() =>
                        setForm((current) =>
                          current.label.trim() || !current.name
                            ? current
                            : { ...current, label: display_label(current.name) }
                        )
                      }
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="field-label" className="text-sm font-semibold">
                      Label
                    </Label>
                    <Input
                      id="field-label"
                      value={form.label}
                      placeholder="Field label"
                      className="rounded-lg border-input bg-card"
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          label: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label
                      htmlFor="field-interface"
                      className="text-sm font-semibold"
                    >
                      Interface
                    </Label>
                    <div className="relative">
                      <select
                        id="field-interface"
                        value={form.interface}
                        onChange={(event) =>
                          selectInterface(
                            event.target.value as CmsFieldInterface
                          )
                        }
                        disabled={!editingField}
                        className="h-13 w-full appearance-none rounded-lg border border-input bg-card px-3 pr-9 text-sm text-foreground outline-none disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
                      >
                        {CMS_INTERFACE_GROUPS.map((group) => {
                          const items = availableInterfaces.filter(
                            (item) => item.group === group
                          );
                          if (items.length === 0) return null;
                          return (
                            <optgroup key={group} label={group}>
                              {items.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.label}
                                </option>
                              ))}
                            </optgroup>
                          );
                        })}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="field-type" className="text-sm font-semibold">
                      Storage type
                    </Label>
                    <div className="relative">
                      <select
                        id="field-type"
                        value={form.type}
                        onChange={(event) =>
                          changeType(event.target.value as CmsFieldType)
                        }
                        disabled={alias || Boolean(editingField)}
                        className="h-13 w-full appearance-none rounded-lg border border-input bg-card px-3 pr-9 text-sm text-foreground outline-none disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
                      >
                        {typeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label} ({option.value})
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    </div>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="field-group" className="text-sm font-semibold">
                    Group
                  </Label>
                  <div className="relative">
                    <select
                      id="field-group"
                      value={form.group ?? ""}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          group: event.target.value || null,
                        }))
                      }
                      disabled={groupFields.length === 0}
                      className="h-13 w-full appearance-none rounded-lg border border-input bg-card px-3 pr-9 text-sm text-foreground outline-none disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
                    >
                      <option value="">No group</option>
                      {groupFields.map((field) => (
                        <option key={field.name} value={field.name}>
                          {field.label || field.name} ({field.name})
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>
              </section>

              <section className="space-y-4 rounded-xl border border-border p-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Interface settings
                  </p>
                </div>
                <InterfaceOptions
                  form={form}
                  onOption={updateOption}
                  onChoices={(choices) =>
                    setForm((current) => ({ ...current, choices }))
                  }
                  collections={collections}
                />
              </section>

              {!alias ? (
                <section className="space-y-3 rounded-xl border border-border p-4">
                  <DefaultValueEditor
                    form={form}
                    onChange={(defaultValue) =>
                      setForm((current) => ({ ...current, defaultValue }))
                    }
                  />
                </section>
              ) : null}

              <section className="space-y-3 rounded-xl border border-border p-4">
                <p className="text-sm font-semibold text-foreground">
                  Field behavior
                </p>

                {!alias ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex min-h-13 items-center justify-between gap-3 rounded-lg border border-input bg-card px-4 py-2">
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-foreground">
                          Required
                        </span>
                        <p className="text-xs text-muted-foreground">
                          Require value to be set on creation
                        </p>
                      </div>
                      <Switch
                        checked={form.required}
                        onCheckedChange={(checked) =>
                          setForm((current) => ({
                            ...current,
                            required: checked,
                          }))
                        }
                      />
                    </div>

                    <div className="flex h-13 items-center justify-between gap-3 rounded-lg border border-input bg-card px-4">
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-foreground">
                          Unique
                        </span>
                      </div>
                      <Switch
                        checked={form.unique}
                        onCheckedChange={(checked) =>
                          setForm((current) => ({ ...current, unique: checked }))
                        }
                      />
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex h-13 items-center justify-between gap-3 rounded-lg border border-input bg-card px-4">
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-foreground">
                        Hidden
                      </span>
                    </div>
                    <Switch
                      checked={form.hidden}
                      onCheckedChange={(checked) =>
                        setForm((current) => ({ ...current, hidden: checked }))
                      }
                    />
                  </div>

                  <div className="flex h-13 items-center justify-between gap-3 rounded-lg border border-input bg-card px-4">
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-foreground">
                        Read only
                      </span>
                    </div>
                    <Switch
                      checked={form.readonly}
                      onCheckedChange={(checked) =>
                        setForm((current) => ({
                          ...current,
                          readonly: checked,
                        }))
                      }
                    />
                  </div>
                </div>
              </section>
            </div>
          )}
        </SheetBody>

        {step === "configure" ? (
          <SheetFooter className="border-t border-border bg-surface-subtle p-4">
            <Button
              type="button"
              variant="outline"
              className="rounded-lg"
              onClick={() => {
                if (editingField) {
                  onOpenChange(false);
                } else {
                  setStep("select-type");
                }
              }}
            >
              Cancel
            </Button>
            <BusyButton
              type="button"
              busy={saving}
              disabled={!form.name.trim()}
              className="rounded-lg"
              onClick={onSave}
            >
              {editingField ? "Save field" : "Create field"}
            </BusyButton>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
