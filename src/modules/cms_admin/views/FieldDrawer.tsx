"use client";

import { useMemo, useState } from "react";
import {
  AlignLeft,
  ArrowLeft,
  Binary,
  Box,
  Calendar,
  Check,
  ChevronDown,
  Code,
  Eye,
  FileCode,
  FileText,
  FolderTree,
  Hash,
  Heading,
  Image as ImageIcon,
  Key,
  Layers,
  Link,
  List,
  ListFilter,
  MapPin,
  Maximize2,
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
  Users,
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
import { cn } from "@/lib/utils";
import type { CmsCollectionWithFields, CmsField, CmsFieldInterface, CmsFieldType } from "@/modules/cms/cms-types";
import { BusyButton, FIELD_TYPE_OPTIONS } from "./ui";

export interface FieldFormState {
  name: string;
  label: string;
  type: CmsFieldType;
  interface: CmsFieldInterface;
  required: boolean;
  unique: boolean;
  hidden: boolean;
  readonly: boolean;
  choices: string;
  defaultValue: string;
  options: Record<string, any>;
}

export interface FieldDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionName: string;
  collections?: CmsCollectionWithFields[];
  editingField?: CmsField | null;
  form: FieldFormState;
  setForm: React.Dispatch<React.SetStateAction<FieldFormState>>;
  saving: boolean;
  onSave: () => void;
}

export interface InterfaceOption {
  id: CmsFieldInterface;
  label: string;
  type: CmsFieldType;
  icon: React.ComponentType<{ className?: string }>;
  group:
    | "Text & Numbers"
    | "Selection"
    | "Relational"
    | "Translations"
    | "Presentation"
    | "Groups"
    | "Other";
}

export const ALL_INTERFACE_OPTIONS: InterfaceOption[] = [
  // Text & Numbers
  { id: "input", label: "Input", type: "string", icon: Type, group: "Text & Numbers" },
  { id: "input_autocomplete_api", label: "Autocomplete Input (API)", type: "string", icon: Search, group: "Text & Numbers" },
  { id: "block_editor", label: "Block Editor", type: "text", icon: Box, group: "Text & Numbers" },
  { id: "code", label: "Code", type: "text", icon: Code, group: "Text & Numbers" },
  { id: "textarea", label: "Textarea", type: "text", icon: AlignLeft, group: "Text & Numbers" },
  { id: "wysiwyg", label: "WYSIWYG", type: "text", icon: FileText, group: "Text & Numbers" },
  { id: "markdown", label: "Markdown", type: "text", icon: FileCode, group: "Text & Numbers" },
  { id: "tags", label: "Tags", type: "json", icon: Tag, group: "Text & Numbers" },

  // Selection
  { id: "toggle", label: "Toggle", type: "boolean", icon: ToggleLeft, group: "Selection" },
  { id: "datetime", label: "Datetime", type: "datetime", icon: Calendar, group: "Selection" },
  { id: "repeater", label: "Repeater", type: "json", icon: Repeat, group: "Selection" },
  { id: "map", label: "Map", type: "json", icon: MapPin, group: "Selection" },
  { id: "color", label: "Color", type: "string", icon: Palette, group: "Selection" },
  { id: "dropdown", label: "Dropdown", type: "select", icon: ListFilter, group: "Selection" },
  { id: "icon", label: "Icon", type: "string", icon: Sparkles, group: "Selection" },
  { id: "checkboxes", label: "Checkboxes", type: "json", icon: List, group: "Selection" },
  { id: "checkboxes_tree", label: "Checkboxes (Tree)", type: "json", icon: FolderTree, group: "Selection" },
  { id: "dropdown_multiselect", label: "Dropdown (Multiple)", type: "json", icon: ListFilter, group: "Selection" },
  { id: "radio", label: "Radio Buttons", type: "select", icon: Radio, group: "Selection" },

  // Relational
  { id: "file", label: "File", type: "string", icon: Layers, group: "Relational" },
  { id: "image", label: "Image", type: "image", icon: ImageIcon, group: "Relational" },
  { id: "files", label: "Files", type: "json", icon: Layers, group: "Relational" },
  { id: "builder_m2a", label: "Builder (M2A)", type: "json", icon: Box, group: "Relational" },
  { id: "many_to_many", label: "Many to Many", type: "relation", icon: Link, group: "Relational" },
  { id: "one_to_many", label: "One to Many", type: "relation", icon: FolderTree, group: "Relational" },
  { id: "tree_view", label: "Tree View", type: "relation", icon: FolderTree, group: "Relational" },
  { id: "many_to_one", label: "Many to One", type: "relation", icon: Link, group: "Relational" },

  // Translations
  { id: "translations", label: "Translations", type: "json", icon: Type, group: "Translations" },

  // Presentation
  { id: "header", label: "Header", type: "string", icon: Heading, group: "Presentation" },
  { id: "divider", label: "Divider", type: "string", icon: Minus, group: "Presentation" },
  { id: "buttons", label: "Buttons", type: "string", icon: MousePointer, group: "Presentation" },
  { id: "notice", label: "Notice", type: "string", icon: Sparkles, group: "Presentation" },

  // Groups
  { id: "accordion", label: "Accordion", type: "string", icon: List, group: "Groups" },
  { id: "detail_group", label: "Detail Group", type: "string", icon: Box, group: "Groups" },
  { id: "raw_group", label: "Raw Group", type: "string", icon: Box, group: "Groups" },

  // Other
  { id: "collection_item_dropdown", label: "Collection Item Dropdown", type: "relation", icon: ListFilter, group: "Other" },
  { id: "collection_item_dropdown_multiple", label: "Collection Item Dropdown (Multiple)", type: "json", icon: ListFilter, group: "Other" },
  { id: "hash", label: "Hash", type: "string", icon: Hash, group: "Other" },
  { id: "slider", label: "Slider", type: "integer", icon: Sliders, group: "Other" },
];

const GROUPS = [
  "Text & Numbers",
  "Selection",
  "Relational",
  "Translations",
  "Presentation",
  "Groups",
  "Other",
] as const;

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

export function FieldDrawer({
  open,
  onOpenChange,
  collectionName,
  collections = [],
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

  const filteredInterfaces = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ALL_INTERFACE_OPTIONS;
    return ALL_INTERFACE_OPTIONS.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.type.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q)
    );
  }, [search]);

  const selectInterface = (option: InterfaceOption) => {
    setForm((current) => ({
      ...current,
      interface: option.id,
      type: option.type,
      label: current.label || option.label,
    }));
    setStep("configure");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setStep(editingField ? "configure" : "select-type");
      setSearch("");
    }
    onOpenChange(nextOpen);
  };

  const updateOpt = (key: string, val: any) => {
    setForm((f) => ({
      ...f,
      options: {
        ...f.options,
        [key]: val,
      },
    }));
  };

  const currentInterface = form.interface || "input";

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="max-w-[640px] p-0 flex flex-col gap-0 border-l border-border bg-card">
        {/* Header */}
        <SheetHeader className="p-4 pr-12 border-b border-border bg-card">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              {step === "configure" && !editingField ? (
                <button
                  type="button"
                  onClick={() => setStep("select-type")}
                  className="grid size-8 place-items-center rounded-full hover:bg-surface-subtle text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Back to type selection"
                >
                  <ArrowLeft className="size-4" />
                </button>
              ) : (
                <span className="grid size-8 place-items-center rounded-lg border border-border bg-surface-subtle text-foreground">
                  <Box className="size-4" />
                </span>
              )}
              <DialogTitle className="text-sm font-semibold text-foreground">
                {editingField
                  ? `Edit Field (${editingField.name})`
                  : step === "select-type"
                    ? `New Field (${collectionName})`
                    : `Configure Field (${form.name || form.label || "new"})`}
              </DialogTitle>
            </div>

            {step === "select-type" ? (
              <div className="relative w-44">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search Field..."
                  className="h-8 pl-8 text-xs rounded-lg bg-surface-subtle border-none"
                />
              </div>
            ) : null}
          </div>
        </SheetHeader>

        {/* Drawer Body */}
        <SheetBody className="p-6 flex-1 overflow-y-auto app-scrollbar">
          {step === "select-type" ? (
            <div className="space-y-6">
              {GROUPS.map((group) => {
                const itemsInGroup = filteredInterfaces.filter(
                  (item) => item.group === group
                );
                if (itemsInGroup.length === 0) return null;
                return (
                  <div key={group} className="space-y-2.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {group}
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {itemsInGroup.map((item) => {
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => selectInterface(item)}
                            className="group flex flex-col items-center justify-center p-3 rounded-xl border border-border bg-surface-subtle/40 hover:bg-surface-subtle hover:border-foreground/30 transition-all text-center gap-2 aspect-[4/3]"
                          >
                            <span className="grid size-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground group-hover:text-foreground transition-colors shadow-xs">
                              <Icon className="size-4" />
                            </span>
                            <span className="text-xs font-medium text-foreground truncate w-full">
                              {item.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* CONFIGURE STEP WITH DIRECTUS DEDICATED FIELD SETTINGS */
            <div className="space-y-5">
              {/* Common Base: Key (Column Name) & Type */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="field-key" className="text-sm font-semibold">
                    Key *
                  </Label>
                  <Input
                    id="field-key"
                    value={form.name}
                    disabled={editingField !== null}
                    placeholder="e.g. first_name"
                    className="h-10 font-mono text-sm rounded-xl bg-card border-input"
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        name: slugify(e.target.value),
                        label:
                          current.label ||
                          e.target.value
                            .replace(/[_-]+/g, " ")
                            .replace(/\b\w/g, (c) => c.toUpperCase()),
                      }))
                    }
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="field-type" className="text-sm font-semibold">
                    Type
                  </Label>
                  <div className="relative">
                    <select
                      id="field-type"
                      value={form.type}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          type: e.target.value as CmsFieldType,
                        }))
                      }
                      className="h-10 w-full appearance-none rounded-xl border border-input bg-card px-3 pr-10 text-sm text-foreground outline-none"
                    >
                      {FIELD_TYPE_OPTIONS.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label} ({type.value})
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  </div>
                </div>
              </div>

              {/* Default Value & Required */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="field-default" className="text-sm font-semibold">
                    Default Value
                  </Label>
                  <Input
                    id="field-default"
                    value={form.defaultValue}
                    placeholder="Default value if not set"
                    className="h-10 rounded-xl bg-card border-input"
                    onChange={(e) =>
                      setForm((current) => ({ ...current, defaultValue: e.target.value }))
                    }
                  />
                </div>

                <div className="grid gap-2">
                  <Label className="text-sm font-semibold">Required</Label>
                  <div className="flex h-10 items-center justify-between rounded-xl border border-input bg-card px-4">
                    <span className="text-xs text-muted-foreground">Require value</span>
                    <Switch
                      checked={form.required}
                      onCheckedChange={(checked) =>
                        setForm((current) => ({ ...current, required: checked }))
                      }
                    />
                  </div>
                </div>
              </div>

              {/* DEDICATED INTERFACE SPECIFIC SETTINGS */}
              <div className="border-t border-border pt-4 space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Interface Settings
                </p>

                {/* 1. INPUT */}
                {currentInterface === "input" && (
                  <div className="space-y-4">
                    <div className="grid gap-2">
                      <Label className="text-sm font-semibold">Placeholder</Label>
                      <Input
                        value={form.options.placeholder || ""}
                        placeholder="Enter text..."
                        className="h-10 rounded-xl bg-card border-input"
                        onChange={(e) => updateOpt("placeholder", e.target.value)}
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="grid gap-2">
                        <Label className="text-sm font-semibold">Icon Left</Label>
                        <Input
                          value={form.options.icon_left || ""}
                          placeholder="search, user, mail..."
                          className="h-10 rounded-xl bg-card border-input"
                          onChange={(e) => updateOpt("icon_left", e.target.value)}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label className="text-sm font-semibold">Icon Right</Label>
                        <Input
                          value={form.options.icon_right || ""}
                          placeholder="chevron, eye..."
                          className="h-10 rounded-xl bg-card border-input"
                          onChange={(e) => updateOpt("icon_right", e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. TEXTAREA */}
                {currentInterface === "textarea" && (
                  <div className="space-y-4">
                    <div className="grid gap-2">
                      <Label className="text-sm font-semibold">Placeholder</Label>
                      <Input
                        value={form.options.placeholder || ""}
                        placeholder="Enter long text..."
                        className="h-10 rounded-xl bg-card border-input"
                        onChange={(e) => updateOpt("placeholder", e.target.value)}
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="grid gap-2">
                        <Label className="text-sm font-semibold">Soft Limit</Label>
                        <Input
                          type="number"
                          value={form.options.soft_limit || ""}
                          placeholder="e.g. 500"
                          className="h-10 rounded-xl bg-card border-input"
                          onChange={(e) => updateOpt("soft_limit", e.target.value)}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label className="text-sm font-semibold">Font</Label>
                        <select
                          value={form.options.font || "sans"}
                          onChange={(e) => updateOpt("font", e.target.value)}
                          className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm text-foreground outline-none"
                        >
                          <option value="sans">Sans-serif</option>
                          <option value="serif">Serif</option>
                          <option value="monospace">Monospace</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex h-10 items-center justify-between rounded-xl border border-input bg-card px-4">
                      <span className="text-sm font-medium text-foreground">Trim start and end</span>
                      <Switch
                        checked={form.options.trim ?? true}
                        onCheckedChange={(c) => updateOpt("trim", c)}
                      />
                    </div>
                  </div>
                )}

                {/* 3. WYSIWYG & MARKDOWN & BLOCK EDITOR */}
                {(currentInterface === "wysiwyg" || currentInterface === "markdown" || currentInterface === "block_editor") && (
                  <div className="space-y-4">
                    <div className="grid gap-2">
                      <Label className="text-sm font-semibold">Placeholder</Label>
                      <Input
                        value={form.options.placeholder || ""}
                        placeholder="Write content..."
                        className="h-10 rounded-xl bg-card border-input"
                        onChange={(e) => updateOpt("placeholder", e.target.value)}
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="grid gap-2">
                        <Label className="text-sm font-semibold">Font</Label>
                        <select
                          value={form.options.font || "sans"}
                          onChange={(e) => updateOpt("font", e.target.value)}
                          className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm text-foreground outline-none"
                        >
                          <option value="sans">Sans-serif</option>
                          <option value="serif">Serif</option>
                          <option value="monospace">Monospace</option>
                        </select>
                      </div>
                      <div className="grid gap-2">
                        <Label className="text-sm font-semibold">Root Folder</Label>
                        <Input
                          value={form.options.folder || ""}
                          placeholder="e.g. articles"
                          className="h-10 rounded-xl bg-card border-input"
                          onChange={(e) => updateOpt("folder", e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label className="text-sm font-semibold">Static Access Token</Label>
                      <Input
                        value={form.options.static_token || ""}
                        placeholder="Optional asset token"
                        className="h-10 rounded-xl bg-card border-input"
                        onChange={(e) => updateOpt("static_token", e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {/* 4. TOGGLE */}
                {currentInterface === "toggle" && (
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="grid gap-2">
                        <Label className="text-sm font-semibold">Icon On</Label>
                        <Input
                          value={form.options.icon_on || "check"}
                          placeholder="check"
                          className="h-10 rounded-xl bg-card border-input"
                          onChange={(e) => updateOpt("icon_on", e.target.value)}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label className="text-sm font-semibold">Icon Off</Label>
                        <Input
                          value={form.options.icon_off || "close"}
                          placeholder="close"
                          className="h-10 rounded-xl bg-card border-input"
                          onChange={(e) => updateOpt("icon_off", e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="grid gap-2">
                        <Label className="text-sm font-semibold">Color On</Label>
                        <Input
                          value={form.options.color_on || "emerald"}
                          placeholder="emerald, blue, etc."
                          className="h-10 rounded-xl bg-card border-input"
                          onChange={(e) => updateOpt("color_on", e.target.value)}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label className="text-sm font-semibold">Color Off</Label>
                        <Input
                          value={form.options.color_off || "slate"}
                          placeholder="slate, gray, etc."
                          className="h-10 rounded-xl bg-card border-input"
                          onChange={(e) => updateOpt("color_off", e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 5. COLOR */}
                {currentInterface === "color" && (
                  <div className="space-y-4">
                    <div className="flex h-10 items-center justify-between rounded-xl border border-input bg-card px-4">
                      <span className="text-sm font-medium text-foreground">Opacity Support</span>
                      <Switch
                        checked={form.options.opacity ?? false}
                        onCheckedChange={(c) => updateOpt("opacity", c)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label className="text-sm font-semibold">Preset Colors</Label>
                      <Input
                        value={form.options.presets || "red, blue, green, amber, indigo"}
                        placeholder="red, blue, green..."
                        className="h-10 rounded-xl bg-card border-input"
                        onChange={(e) => updateOpt("presets", e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {/* 6. IMAGE & FILE */}
                {(currentInterface === "image" || currentInterface === "file" || currentInterface === "files") && (
                  <div className="space-y-4">
                    <div className="grid gap-2">
                      <Label className="text-sm font-semibold">Root Folder</Label>
                      <Input
                        value={form.options.folder || ""}
                        placeholder="e.g. avatars"
                        className="h-10 rounded-xl bg-card border-input"
                        onChange={(e) => updateOpt("folder", e.target.value)}
                      />
                    </div>
                    <div className="flex h-10 items-center justify-between rounded-xl border border-input bg-card px-4">
                      <span className="text-sm font-medium text-foreground">Crop to Fit</span>
                      <Switch
                        checked={form.options.crop ?? false}
                        onCheckedChange={(c) => updateOpt("crop", c)}
                      />
                    </div>
                    <div className="flex h-10 items-center justify-between rounded-xl border border-input bg-card px-4">
                      <span className="text-sm font-medium text-foreground">Enable Create Button</span>
                      <Switch
                        checked={form.options.enable_create ?? true}
                        onCheckedChange={(c) => updateOpt("enable_create", c)}
                      />
                    </div>
                    <div className="flex h-10 items-center justify-between rounded-xl border border-input bg-card px-4">
                      <span className="text-sm font-medium text-foreground">Enable Select Button</span>
                      <Switch
                        checked={form.options.enable_select ?? true}
                        onCheckedChange={(c) => updateOpt("enable_select", c)}
                      />
                    </div>
                  </div>
                )}

                {/* 7. DROPDOWN / RADIO / CHECKBOXES */}
                {(currentInterface === "dropdown" ||
                  currentInterface === "radio" ||
                  currentInterface === "checkboxes" ||
                  currentInterface === "dropdown_multiselect") && (
                  <div className="space-y-4">
                    <div className="grid gap-2">
                      <Label className="text-sm font-semibold">Choices (comma separated)</Label>
                      <Input
                        value={form.choices}
                        placeholder="option1, option2, option3"
                        className="h-10 rounded-xl bg-card border-input"
                        onChange={(e) =>
                          setForm((f) => ({ ...f, choices: e.target.value }))
                        }
                      />
                    </div>
                    {collections.length > 0 ? (
                      <div className="grid gap-2">
                        <Label className="text-sm font-semibold">Or populate from Collection</Label>
                        <select
                          value={form.options.rel_collection || ""}
                          onChange={(e) => updateOpt("rel_collection", e.target.value)}
                          className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm text-foreground outline-none"
                        >
                          <option value="">None (use manual choices)</option>
                          {collections.map((col) => (
                            <option key={col.name} value={col.name}>
                              {col.label || col.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* 8. HASH */}
                {currentInterface === "hash" && (
                  <div className="space-y-4">
                    <div className="grid gap-2">
                      <Label className="text-sm font-semibold">Placeholder</Label>
                      <Input
                        value={form.options.placeholder || ""}
                        placeholder="••••••••"
                        className="h-10 rounded-xl bg-card border-input"
                        onChange={(e) => updateOpt("placeholder", e.target.value)}
                      />
                    </div>
                    <div className="flex h-10 items-center justify-between rounded-xl border border-input bg-card px-4">
                      <span className="text-sm font-medium text-foreground">Masked (Hide true values)</span>
                      <Switch
                        checked={form.options.masked ?? true}
                        onCheckedChange={(c) => updateOpt("masked", c)}
                      />
                    </div>
                  </div>
                )}

                {/* 9. DIVIDER */}
                {currentInterface === "divider" && (
                  <div className="space-y-4">
                    <div className="grid gap-2">
                      <Label className="text-sm font-semibold">Title</Label>
                      <Input
                        value={form.options.title || ""}
                        placeholder="Section title"
                        className="h-10 rounded-xl bg-card border-input"
                        onChange={(e) => updateOpt("title", e.target.value)}
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="grid gap-2">
                        <Label className="text-sm font-semibold">Color</Label>
                        <Input
                          value={form.options.color || ""}
                          placeholder="slate, border, etc."
                          className="h-10 rounded-xl bg-card border-input"
                          onChange={(e) => updateOpt("color", e.target.value)}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label className="text-sm font-semibold">Icon</Label>
                        <Input
                          value={form.options.icon || ""}
                          placeholder="minus"
                          className="h-10 rounded-xl bg-card border-input"
                          onChange={(e) => updateOpt("icon", e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="flex h-10 items-center justify-between rounded-xl border border-input bg-card px-4">
                      <span className="text-sm font-medium text-foreground">Inline Title</span>
                      <Switch
                        checked={form.options.inline_title ?? true}
                        onCheckedChange={(c) => updateOpt("inline_title", c)}
                      />
                    </div>
                  </div>
                )}

                {/* 10. RELATIONAL (Many to One, One to Many, etc.) */}
                {(currentInterface === "many_to_one" ||
                  currentInterface === "one_to_many" ||
                  currentInterface === "many_to_many" ||
                  currentInterface === "collection_item_dropdown" ||
                  currentInterface === "collection_item_dropdown_multiple") && (
                  <div className="space-y-4">
                    <div className="grid gap-2">
                      <Label className="text-sm font-semibold">Related Collection</Label>
                      <select
                        value={form.options.rel_collection || ""}
                        onChange={(e) => updateOpt("rel_collection", e.target.value)}
                        className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm text-foreground outline-none"
                      >
                        <option value="">Select a Collection</option>
                        {collections.map((col) => (
                          <option key={col.name} value={col.name}>
                            {col.label || col.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-2">
                      <Label className="text-sm font-semibold">Display Template</Label>
                      <Input
                        value={form.options.template || ""}
                        placeholder="{{id}} - {{title}}"
                        className="h-10 rounded-xl bg-card border-input"
                        onChange={(e) => updateOpt("template", e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Toggles using modern Switch components */}
              <div className="border-t border-border pt-4 space-y-3">
                <div className="flex h-10 items-center justify-between rounded-xl border border-input bg-card px-4">
                  <span className="text-sm font-medium text-foreground">Unique</span>
                  <Switch
                    checked={form.unique}
                    onCheckedChange={(checked) =>
                      setForm((current) => ({ ...current, unique: checked }))
                    }
                  />
                </div>

                <div className="flex h-10 items-center justify-between rounded-xl border border-input bg-card px-4">
                  <span className="text-sm font-medium text-foreground">Hidden</span>
                  <Switch
                    checked={form.hidden}
                    onCheckedChange={(checked) =>
                      setForm((current) => ({ ...current, hidden: checked }))
                    }
                  />
                </div>

                <div className="flex h-10 items-center justify-between rounded-xl border border-input bg-card px-4">
                  <span className="text-sm font-medium text-foreground">Read only</span>
                  <Switch
                    checked={form.readonly}
                    onCheckedChange={(checked) =>
                      setForm((current) => ({ ...current, readonly: checked }))
                    }
                  />
                </div>
              </div>
            </div>
          )}
        </SheetBody>

        {/* Drawer Footer */}
        {step === "configure" ? (
          <SheetFooter className="border-t border-border p-4 bg-surface-subtle">
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
