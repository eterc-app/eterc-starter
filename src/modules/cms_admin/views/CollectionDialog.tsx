"use client";

import { useState } from "react";
import {
  Box,
  ChevronDown,
  ChevronRight,
  Info,
  Plus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type {
  CmsCollectionWithFields,
  CmsFieldType,
  CmsPrimaryKeyType,
} from "@/modules/cms/cms-types";
import { BusyButton, FIELD_TYPE_OPTIONS, cms_call } from "./ui";

interface DraftField {
  name: string;
  label: string;
  type: CmsFieldType;
  required: boolean;
}

interface CollectionForm {
  name: string;
  label: string;
  icon: string;
  note: string;
  singleton: boolean;
  hidden: boolean;
  primaryKey: string;
  primaryKeyType: CmsPrimaryKeyType;
  fields: DraftField[];
}

export interface CollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  collection?: CmsCollectionWithFields | null;
  onSaved?: (collection: CmsCollectionWithFields) => void;
}

function empty_form(): CollectionForm {
  return {
    name: "",
    label: "",
    icon: "table",
    note: "",
    singleton: false,
    hidden: false,
    primaryKey: "id",
    primaryKeyType: "integer",
    fields: [{ name: "title", label: "Title", type: "string", required: true }],
  };
}

function form_from_collection(
  collection: CmsCollectionWithFields
): CollectionForm {
  const primaryField = collection.fields.find(
    (field) => field.name === collection.primary_key
  );
  const primaryKeyType: CmsPrimaryKeyType =
    primaryField?.type === "integer"
      ? "integer"
      : primaryField && !primaryField.readonly
        ? "string"
        : "uuid";

  return {
    name: collection.name,
    label: collection.label,
    icon: collection.icon,
    note: collection.note,
    singleton: collection.singleton,
    hidden: collection.hidden,
    primaryKey: collection.primary_key || "id",
    primaryKeyType,
    fields: [],
  };
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

/**
 * Shared collection setup dialog.
 *
 * Settings uses it to create a collection; Data Studio uses the same surface to
 * edit collection-level options. Field management stays in Data Studio.
 */
export function CollectionDialog(props: CollectionDialogProps) {
  if (!props.open) return null;
  return <CollectionDialogBody {...props} />;
}

function CollectionDialogBody({
  onOpenChange,
  mode,
  collection,
  onSaved,
}: CollectionDialogProps) {
  const [tab, setTab] = useState<"setup" | "optional">("setup");
  const [form, setForm] = useState<CollectionForm>(() =>
    mode === "edit" && collection
      ? form_from_collection(collection)
      : empty_form()
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      if (mode === "create") {
        const created = await cms_call<CmsCollectionWithFields>(
          "data_collection_create",
          {
            name: form.name,
            label: form.label || form.name,
            icon: form.icon,
            note: form.note,
            singleton: form.singleton,
            hidden: form.hidden,
            primary_key: form.primaryKey,
            primary_key_type: form.primaryKeyType,
            fields: form.fields
              .filter((field) => field.name.trim() !== "")
              .map((field) => ({
                name: field.name,
                label: field.label || field.name,
                type: field.type,
                required: field.required,
              })),
          }
        );
        toast.success(`Collection '${created.label || created.name}' created.`);
        onSaved?.(created);
      } else {
        const updated = await cms_call<CmsCollectionWithFields>(
          "data_collection_update",
          {
            name: form.name,
            label: form.label,
            icon: form.icon,
            note: form.note,
            singleton: form.singleton,
            hidden: form.hidden,
          }
        );
        toast.success("Collection settings saved.");
        onSaved?.(updated);
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save the collection."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="max-h-[92vh] overflow-y-auto rounded-xl p-0 gap-0 sm:max-w-3xl"
      >
        <div
          className={cn(
            "grid min-h-[460px]",
            mode === "create" && "sm:grid-cols-[180px_1fr]"
          )}
        >
          {mode === "create" ? (
            <div className="border-r border-border bg-surface-subtle p-4 space-y-1">
              <button
                type="button"
                onClick={() => setTab("setup")}
                className={cn(
                  "w-full rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors",
                  tab === "setup"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                Collection Setup
              </button>
              <button
                type="button"
                onClick={() => setTab("optional")}
                className={cn(
                  "w-full rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors",
                  tab === "optional"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                Optional Fields
              </button>
            </div>
          ) : null}

          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="grid size-9 place-items-center rounded-lg border border-border bg-surface-subtle text-foreground">
                  <Box className="size-4" />
                </span>
                <DialogTitle className="text-base font-semibold">
                  {mode === "create"
                    ? "Creating New Collection"
                    : "Collection Settings"}
                </DialogTitle>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-subtle p-3 text-xs text-muted-foreground">
              <Info className="size-4 shrink-0 text-foreground" />
              <span>
                {mode === "create"
                  ? "Name the collection and setup its unique \"key\" field..."
                  : "Update how this collection appears in the CMS. Manage its fields in Data Studio."}
              </span>
            </div>

            {mode === "create" && tab === "setup" ? (
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-3">
                    <Label htmlFor="col-name" className="text-sm font-semibold">
                      Name *
                    </Label>
                    <Input
                      id="col-name"
                      value={form.name}
                      placeholder="A unique table name..."
                      className="h-11 font-mono rounded-xl bg-card border-input"
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          name: slugify(event.target.value),
                          label:
                            current.label ||
                            event.target.value
                              .replace(/[_-]+/g, " ")
                              .replace(/\b\w/g, (letter) => letter.toUpperCase()),
                        }))
                      }
                    />
                  </div>

                  <div className="grid gap-3">
                    <Label className="text-sm font-semibold">Singleton</Label>
                    <label className="flex h-11 items-center gap-3 rounded-xl border border-input bg-card px-4 text-sm cursor-pointer transition-colors hover:border-foreground/30">
                      <Checkbox
                        checked={form.singleton}
                        onCheckedChange={(checked) =>
                          setForm((current) => ({
                            ...current,
                            singleton: checked === true,
                          }))
                        }
                      />
                      <span className="font-medium text-foreground">
                        Treat as single object
                      </span>
                    </label>
                  </div>
                </div>

                <div className="border-t border-border pt-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-3">
                      <Label htmlFor="col-pk" className="text-sm font-semibold">
                        Primary Key Field
                      </Label>
                      <Input
                        id="col-pk"
                        value={form.primaryKey}
                        placeholder="id"
                        className="h-11 font-mono rounded-xl bg-card border-input"
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            primaryKey: slugify(event.target.value),
                          }))
                        }
                      />
                    </div>

                    <div className="grid gap-3">
                      <Label htmlFor="col-pk-type" className="text-sm font-semibold">
                        Type
                      </Label>
                      <div className="relative">
                        <select
                          id="col-pk-type"
                          value={form.primaryKeyType}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              primaryKeyType: event.target.value as CmsPrimaryKeyType,
                            }))
                          }
                          className="h-11 w-full appearance-none rounded-xl border border-input bg-card px-4 text-sm text-foreground outline-none"
                        >
                          <option value="integer">Auto-incremented integer</option>
                          <option value="uuid">Generated UUID</option>
                          <option value="string">Manual string</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-3">
                    <Label htmlFor="col-label" className="text-sm font-semibold">
                      Display Label
                    </Label>
                    <Input
                      id="col-label"
                      value={form.label}
                      placeholder="e.g. Products"
                      className="h-11 rounded-xl bg-card border-input"
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          label: event.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="grid gap-3">
                    <Label htmlFor="col-icon" className="text-sm font-semibold">
                      Icon
                    </Label>
                    <Input
                      id="col-icon"
                      value={form.icon}
                      placeholder="table"
                      className="h-11 rounded-xl bg-card border-input"
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          icon: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-3">
                  <Label htmlFor="col-note" className="text-sm font-semibold">
                    Note
                  </Label>
                  <Input
                    id="col-note"
                    value={form.note}
                    placeholder="What is this collection for?"
                    className="h-11 rounded-xl bg-card border-input"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        note: event.target.value,
                      }))
                    }
                  />
                </div>

                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <Checkbox
                    checked={form.hidden}
                    onCheckedChange={(checked) =>
                      setForm((current) => ({
                        ...current,
                        hidden: checked === true,
                      }))
                    }
                  />
                  Hide this collection from the content navigation
                </label>
              </div>
            ) : mode === "create" ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">
                    Initial Columns
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-lg"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        fields: [
                          ...current.fields,
                          { name: "", label: "", type: "string", required: false },
                        ],
                      }))
                    }
                  >
                    <Plus className="size-3.5" />
                    Add field
                  </Button>
                </div>

                <div className="space-y-2">
                  {form.fields.map((field, index) => (
                    <div
                      key={index}
                      className="grid gap-2 sm:grid-cols-[1fr_1fr_130px_auto_auto] items-center"
                    >
                      <Input
                        value={field.name}
                        placeholder="column_name"
                        className="h-10 rounded-lg bg-card border-input"
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            fields: current.fields.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, name: slugify(event.target.value) }
                                : item
                            ),
                          }))
                        }
                      />
                      <Input
                        value={field.label}
                        placeholder="Label"
                        className="h-10 rounded-lg bg-card border-input"
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            fields: current.fields.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, label: event.target.value }
                                : item
                            ),
                          }))
                        }
                      />
                      <select
                        value={field.type}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            fields: current.fields.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    type: event.target.value as CmsFieldType,
                                  }
                                : item
                            ),
                          }))
                        }
                        className="h-10 rounded-lg border border-input bg-card px-2 text-sm text-foreground outline-none"
                      >
                        {FIELD_TYPE_OPTIONS.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                      <label
                        className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer px-1 select-none"
                        title="Require a value when creating or editing records"
                      >
                        <Checkbox
                          checked={field.required}
                          onCheckedChange={(checked) =>
                            setForm((current) => ({
                              ...current,
                              fields: current.fields.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, required: checked === true }
                                  : item
                              ),
                            }))
                          }
                        />
                        <span>Req</span>
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Remove field"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            fields: current.fields.filter(
                              (_, itemIndex) => itemIndex !== index
                            ),
                          }))
                        }
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-3">
                    <Label htmlFor="col-name" className="text-sm font-semibold">
                      Name
                    </Label>
                    <Input
                      id="col-name"
                      value={form.name}
                      disabled
                      className="h-11 font-mono rounded-xl bg-card border-input"
                    />
                  </div>

                  <div className="grid gap-3">
                    <Label className="text-sm font-semibold">Singleton</Label>
                    <label className="flex h-11 items-center gap-3 rounded-xl border border-input bg-card px-4 text-sm cursor-pointer transition-colors hover:border-foreground/30">
                      <Checkbox
                        checked={form.singleton}
                        onCheckedChange={(checked) =>
                          setForm((current) => ({
                            ...current,
                            singleton: checked === true,
                          }))
                        }
                      />
                      <span className="font-medium text-foreground">
                        Treat as single object
                      </span>
                    </label>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-3">
                    <Label htmlFor="col-label" className="text-sm font-semibold">
                      Display Label
                    </Label>
                    <Input
                      id="col-label"
                      value={form.label}
                      placeholder="e.g. Products"
                      className="h-11 rounded-xl bg-card border-input"
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          label: event.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="grid gap-3">
                    <Label htmlFor="col-icon" className="text-sm font-semibold">
                      Icon
                    </Label>
                    <Input
                      id="col-icon"
                      value={form.icon}
                      placeholder="table"
                      className="h-11 rounded-xl bg-card border-input"
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          icon: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-3">
                  <Label htmlFor="col-note" className="text-sm font-semibold">
                    Note
                  </Label>
                  <Input
                    id="col-note"
                    value={form.note}
                    placeholder="What is this collection for?"
                    className="h-11 rounded-xl bg-card border-input"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        note: event.target.value,
                      }))
                    }
                  />
                </div>

                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <Checkbox
                    checked={form.hidden}
                    onCheckedChange={(checked) =>
                      setForm((current) => ({
                        ...current,
                        hidden: checked === true,
                      }))
                    }
                  />
                  Hide this collection from the content navigation
                </label>
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 pt-4 border-t border-border sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="outline"
                className="rounded-lg sm:mr-auto"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
                {mode === "create" && tab === "setup" ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-lg"
                    onClick={() => setTab("optional")}
                  >
                    Next: Fields
                    <ChevronRight className="size-4" />
                  </Button>
                ) : null}
                <BusyButton
                  type="button"
                  busy={saving}
                  onClick={save}
                  disabled={!form.name}
                  className="rounded-lg"
                >
                  {mode === "create" ? "Create collection" : "Save settings"}
                </BusyButton>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CollectionDialog;
