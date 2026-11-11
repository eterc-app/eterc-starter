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
  Plus,
  Palette,
  Radio,
  Repeat,
  Save,
  Search,
  Sliders,
  Sparkles,
  Tag,
  ToggleLeft,
  Type,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  CmsFieldRuleGroup,
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
import { FieldRuleEditor } from "./FieldRuleEditor";
import { BusyButton, FIELD_TYPE_OPTIONS } from "./ui";

type FieldSection =
  | "schema"
  | "field"
  | "interface"
  | "display"
  | "validations"
  | "conditions";

const FIELD_SECTIONS: Array<{ id: FieldSection; label: string }> = [
  { id: "schema", label: "Schema" },
  { id: "field", label: "Field" },
  { id: "interface", label: "Interface" },
  { id: "display", label: "Display" },
  { id: "validations", label: "Validations" },
  { id: "conditions", label: "Conditions" },
];

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

const INTERFACE_DESCRIPTIONS: Partial<Record<CmsFieldInterface, string>> = {
  dropdown: "Select a value from a dropdown",
  select: "Select a value from a dropdown",
};

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
  const [activeSection, setActiveSection] = useState<FieldSection>("schema");
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
      setActiveSection("schema");
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
  const SelectedInterfaceIcon = INTERFACE_ICONS[form.interface] ?? Box;
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
  const ruleFields = useMemo(() => {
    if (!form.name || collectionFields.some((field) => field.name === form.name)) {
      return collectionFields;
    }
    return [
      ...collectionFields,
      {
        id: -1,
        collection_id: -1,
        name: form.name,
        label: form.label || form.name,
        type: form.type,
        interface: form.interface,
        options: form.options,
        required: form.required,
        unique: form.unique,
        hidden: form.hidden,
        readonly: form.readonly,
        group: form.group,
        sort: collectionFields.length,
        created_at: 0,
        updated_at: 0,
        validation: form.validation,
        validation_message: form.validation_message,
        conditions: form.conditions,
        display_options: form.display_options,
        clear_hidden_value_on_save: form.clear_hidden_value_on_save,
      },
    ];
  }, [collectionFields, form]);

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
    setActiveSection("interface");
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
        className="field-drawer flex max-w-[800px] flex-col gap-0 border-l border-border bg-card p-0"
      >
        <SheetHeader className="border-b border-border bg-card px-4 py-2 pr-12">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              {(step === "configure" && !editingField) ||
              (step === "select-type" && editingField) ? (
                <button
                  type="button"
                  onClick={() =>
                    setStep(step === "configure" ? "select-type" : "configure")
                  }
                  className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-subtle hover:text-foreground"
                  aria-label={
                    step === "configure"
                      ? "Back to interface selection"
                      : "Back to field options"
                  }
                >
                  <ArrowLeft className="size-4" />
                </button>
              ) : (
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-surface-subtle text-foreground">
                  <Box className="size-4" />
                </span>
              )}
              <DialogTitle className="truncate text-sm font-semibold text-foreground">
                {step === "select-type" && editingField
                  ? "Change interface"
                  : editingField
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

        <SheetBody className="app-scrollbar min-h-0 flex-1 overflow-hidden p-0">
          {step === "select-type" ? (
            <div className="app-scrollbar h-full overflow-y-auto p-6">
              <div className="space-y-6">
                {CMS_INTERFACE_GROUPS.map((group) => {
                  const items = filteredInterfaces.filter(
                    (item) => item.group === group
                  );
                  if (items.length === 0) return null;
                  return (
                    <div key={group} className="space-y-2.5">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {group}
                      </h3>
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
            </div>
          ) : (
            <div className="flex h-full min-h-0 bg-background">
              <nav
                aria-label="Field configuration sections"
                className="app-scrollbar w-32 shrink-0 space-y-1 overflow-y-auto border-r border-border bg-card p-2 sm:w-40 sm:p-3"
              >
                {FIELD_SECTIONS.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    aria-current={activeSection === section.id ? "page" : undefined}
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full rounded-md px-2 py-1.5 text-left text-xs font-medium transition-colors sm:text-sm ${
                      activeSection === section.id
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {section.label}
                  </button>
                ))}
              </nav>

              <div className="app-scrollbar min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
                <div className="mx-auto max-w-4xl space-y-7">
                  {activeSection === "schema" ? (
                    <>
                      <section className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="drawer-control">
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
                          <div className="drawer-control">
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
                      </section>
                      {!alias ? (
                        <>
                          <section className="space-y-3">
                            <DefaultValueEditor
                              form={form}
                              onChange={(defaultValue) =>
                                setForm((current) => ({ ...current, defaultValue }))
                              }
                            />
                          </section>
                          <div className="flex h-12 items-center justify-between gap-3 rounded-lg border border-input bg-card px-3">
                            <div className="min-w-0">
                              <span className="text-sm font-medium text-foreground">Unique</span>
                            </div>
                            <Switch
                              checked={form.unique}
                              onCheckedChange={(checked) =>
                                setForm((current) => ({ ...current, unique: checked }))
                              }
                            />
                          </div>
                        </>
                      ) : null}
                    </>
                  ) : null}

                  {activeSection === "field" ? (
                    <>
                      <section className="space-y-4">
                        <div className="drawer-control">
                          <Label htmlFor="field-label" className="text-sm font-semibold">
                            Label
                          </Label>
                          <Input
                            id="field-label"
                            value={form.label}
                            placeholder="Field label"
                            className="rounded-lg border-input bg-card"
                            onChange={(event) =>
                              setForm((current) => ({ ...current, label: event.target.value }))
                            }
                          />
                        </div>
                        <div className="drawer-control">
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
                      <div className="grid max-w-3xl gap-x-10 gap-y-6 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="text-base font-semibold">Readonly</Label>
                          <label className="flex h-12 cursor-pointer items-center gap-2 rounded-lg border border-input bg-card p-2">
                            <Checkbox
                              className="size-4 border-foreground/60"
                              checked={form.readonly}
                              onCheckedChange={(checked) =>
                                setForm((current) => ({
                                  ...current,
                                  readonly: checked === true,
                                }))
                              }
                            />
                            <span className="min-w-0 truncate whitespace-nowrap text-xs text-foreground">
                              Disable the field in the app
                            </span>
                          </label>
                        </div>
                        {!alias ? (
                          <div className="space-y-2">
                            <Label className="text-base font-semibold">Required</Label>
                            <label className="flex h-12 cursor-pointer items-center gap-2 rounded-lg border border-input bg-card p-2">
                              <Checkbox
                                className="size-4 border-foreground/60"
                                checked={form.required}
                                onCheckedChange={(checked) =>
                                  setForm((current) => ({
                                    ...current,
                                    required: checked === true,
                                  }))
                                }
                              />
                              <span className="min-w-0 truncate whitespace-nowrap text-xs text-foreground">
                                Require value to be set on creation
                              </span>
                            </label>
                          </div>
                        ) : null}
                        <div className="space-y-2">
                          <Label className="text-base font-semibold">Hidden</Label>
                          <label className="flex h-12 cursor-pointer items-center gap-2 rounded-lg border border-input bg-card p-2">
                            <Checkbox
                              className="size-4 border-foreground/60"
                              checked={form.hidden}
                              onCheckedChange={(checked) => {
                                const hidden = checked === true;
                                setForm((current) => ({
                                  ...current,
                                  hidden,
                                  clear_hidden_value_on_save: hidden
                                    ? current.clear_hidden_value_on_save
                                    : false,
                                }));
                              }}
                            />
                            <span className="min-w-0 truncate whitespace-nowrap text-xs text-foreground">
                              Hidden on Detail
                            </span>
                          </label>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-base font-semibold">Clear Value(s)</Label>
                          <label
                            className={`flex h-12 items-center gap-2 rounded-lg border p-2 ${
                              form.hidden
                                ? "cursor-pointer border-input bg-card"
                                : "cursor-not-allowed border-input bg-border text-muted-foreground"
                            }`}
                          >
                            <Checkbox
                              className="size-4 border-foreground/60"
                              checked={form.clear_hidden_value_on_save}
                              disabled={!form.hidden}
                              onCheckedChange={(checked) =>
                                setForm((current) => ({
                                  ...current,
                                  clear_hidden_value_on_save: checked === true,
                                }))
                              }
                            />
                            <span
                              className={`min-w-0 truncate whitespace-nowrap text-xs ${
                                form.hidden ? "text-foreground" : "text-muted-foreground"
                              }`}
                            >
                              Clear value(s) on save when hidden
                            </span>
                          </label>
                        </div>
                      </div>
                    </>
                  ) : null}

                  {activeSection === "interface" ? (
                    <>
                      <section className="space-y-3">
                        {form.interface === "dropdown" ||
                        form.interface === "select" ? (
                          <div className="flex min-h-14 items-center gap-2.5 rounded-xl border border-border bg-muted p-2">
                            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-card text-foreground">
                              <SelectedInterfaceIcon className="size-5" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <h3 className="truncate text-sm font-semibold text-foreground">
                                {definition.label}
                              </h3>
                              <p className="truncate text-sm text-muted-foreground">
                                {INTERFACE_DESCRIPTIONS[form.interface]}
                              </p>
                            </div>
                            <button
                              type="button"
                              aria-label="Change interface"
                              title="Change interface"
                              onClick={() => setStep("select-type")}
                              className="grid size-7 shrink-0 place-items-center rounded-full text-foreground transition-colors hover:bg-card"
                            >
                              <X className="size-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="drawer-control">
                            <Label htmlFor="field-interface" className="text-sm font-semibold">
                              Interface
                            </Label>
                            <div className="relative">
                              <select
                                id="field-interface"
                                value={form.interface}
                                onChange={(event) =>
                                  selectInterface(event.target.value as CmsFieldInterface)
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
                        )}
                      </section>
                      <section className="space-y-4">
                        {form.interface !== "dropdown" &&
                        form.interface !== "select" ? (
                          <h3 className="text-sm font-semibold text-foreground">
                            Interface settings
                          </h3>
                        ) : null}
                        <InterfaceOptions
                          form={form}
                          onOption={updateOption}
                          onChoices={(choices) =>
                            setForm((current) => ({ ...current, choices }))
                          }
                          collections={collections}
                        />
                      </section>
                    </>
                  ) : null}

                  {activeSection === "display" ? (
                    <section className="space-y-4">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">Display formatting</h3>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="drawer-control">
                          <Label htmlFor="display-prefix">Prefix</Label>
                          <Input
                            id="display-prefix"
                            value={form.display_options.prefix ?? ""}
                            maxLength={100}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                display_options: {
                                  ...current.display_options,
                                  prefix: event.target.value,
                                },
                              }))
                            }
                            placeholder="e.g. $"
                          />
                        </div>
                        <div className="drawer-control">
                          <Label htmlFor="display-suffix">Suffix</Label>
                          <Input
                            id="display-suffix"
                            value={form.display_options.suffix ?? ""}
                            maxLength={100}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                display_options: {
                                  ...current.display_options,
                                  suffix: event.target.value,
                                },
                              }))
                            }
                            placeholder="e.g. kg"
                          />
                        </div>
                      </div>
                    </section>
                  ) : null}

                  {activeSection === "validations" ? (
                    <section className="space-y-4">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">Validation</h3>
                      </div>
                      <FieldRuleEditor
                        value={form.validation}
                        fields={ruleFields}
                        onChange={(validation: CmsFieldRuleGroup) =>
                          setForm((current) => ({ ...current, validation }))
                        }
                      />
                      <div className="drawer-control">
                        <Label htmlFor="field-validation-message">
                          Custom Validation Message
                        </Label>
                        <Input
                          id="field-validation-message"
                          value={form.validation_message}
                          maxLength={500}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              validation_message: event.target.value,
                            }))
                          }
                          placeholder="This value does not meet the requirements."
                        />
                      </div>
                    </section>
                  ) : null}

                  {activeSection === "conditions" ? (
                    <section className="space-y-3">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">Conditions</h3>
                      </div>
                      {form.conditions.map((condition, index) => (
                        <div
                          key={`${index}-${condition.name}`}
                          className="space-y-3 border-b border-border pb-3 last:border-b-0"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-foreground">
                                Name
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                aria-label="Delete condition"
                                onClick={() =>
                                  setForm((current) => ({
                                    ...current,
                                    conditions: current.conditions.filter(
                                      (_, itemIndex) => itemIndex !== index
                                    ),
                                  }))
                                }
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                            <Input
                              aria-label="Condition name"
                              value={condition.name}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  conditions: current.conditions.map((item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, name: event.target.value }
                                      : item
                                  ),
                                }))
                              }
                              placeholder="Condition name"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <span className="text-xs font-semibold text-foreground">
                              Rule
                            </span>
                            <FieldRuleEditor
                              value={condition.rule}
                              fields={ruleFields}
                              onChange={(rule) =>
                                setForm((current) => ({
                                  ...current,
                                  conditions: current.conditions.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, rule } : item
                                  ),
                                }))
                              }
                            />
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            {[
                              ["Hidden", "hidden"],
                              ["Required", "required"],
                              ["Read only", "readonly"],
                            ].map(([label, key]) => {
                              const setting =
                                condition[key as "hidden" | "required" | "readonly"];
                              return (
                                <label
                                  key={key}
                                  className="flex h-12 items-center justify-between gap-2 rounded-md border border-input bg-card px-3"
                                >
                                  <span className="text-xs font-medium">{label}</span>
                                  <Checkbox
                                    aria-label={`${label} when condition matches`}
                                    checked={setting ?? "indeterminate"}
                                    onCheckedChange={() =>
                                      setForm((current) => ({
                                        ...current,
                                        conditions: current.conditions.map((item, itemIndex) => {
                                          if (itemIndex !== index) return item;
                                          const next = { ...item };
                                          const nextSetting =
                                            setting === undefined
                                              ? true
                                              : setting
                                                ? false
                                                : undefined;
                                          if (nextSetting === undefined) {
                                            delete next[key as "hidden" | "required" | "readonly"];
                                          } else {
                                            next[key as "hidden" | "required" | "readonly"] =
                                              nextSetting;
                                          }
                                          if (key === "hidden" && nextSetting !== true) {
                                            delete next.clear_hidden_value_on_save;
                                          }
                                          return next;
                                        }),
                                      }))
                                    }
                                  />
                                </label>
                              );
                            })}
                            {condition.hidden ? (
                              <label className="flex h-12 items-center justify-between gap-2 rounded-md border border-input bg-card px-3">
                                <span className="text-xs font-medium">Clear value when hidden on save</span>
                                <Switch
                                  checked={condition.clear_hidden_value_on_save ?? false}
                                  onCheckedChange={(checked) =>
                                    setForm((current) => ({
                                      ...current,
                                      conditions: current.conditions.map((item, itemIndex) =>
                                        itemIndex === index
                                          ? { ...item, clear_hidden_value_on_save: checked }
                                          : item
                                      ),
                                    }))
                                  }
                                />
                              </label>
                            ) : null}
                          </div>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            conditions: [
                              ...current.conditions,
                              {
                                name: `Condition ${current.conditions.length + 1}`,
                                rule: { match: "all", conditions: [] },
                              },
                            ],
                          }))
                        }
                      >
                        <Plus className="size-4" />
                        Create new
                      </Button>
                    </section>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </SheetBody>

        {step === "configure" ? (
          <SheetFooter className="border-t border-border bg-surface-subtle px-4 py-2">
            <BusyButton
              type="button"
              busy={saving}
              disabled={!form.name.trim()}
              className="rounded-lg"
              onClick={onSave}
            >
               {!saving ? <Save className="size-4" /> : null}
              {editingField ? "Save field" : "Create field"}
            </BusyButton>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
