"use client";

import { useState } from "react";
import {
  ArrowRight,
  ArrowUpDown,
  Box,
  Check,
  ChevronDown,
  Clock,
  Flag,
  Info,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type {
  CmsCollectionWithFields,
  CmsFieldType,
  CmsOptionalFieldsConfig,
  CmsPrimaryKeyType,
} from "@/modules/cms/cms-types";
import { BusyButton, FIELD_TYPE_OPTIONS, cms_call } from "./ui";

interface CollectionForm {
  name: string;
  label: string;
  icon: string;
  note: string;
  singleton: boolean;
  hidden: boolean;
  primaryKey: string;
  primaryKeyType: CmsPrimaryKeyType;
}

interface OptionalFieldState {
  enabled: boolean;
  name: string;
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
 * Directus-style Collection Setup and Optional Fields Dialog.
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

  // Optional fields state for Step 2
  const [optStatus, setOptStatus] = useState<OptionalFieldState>({
    enabled: true,
    name: "status",
  });
  const [optSort, setOptSort] = useState<OptionalFieldState>({
    enabled: false,
    name: "sort",
  });
  const [optCreatedOn, setOptCreatedOn] = useState<OptionalFieldState>({
    enabled: true,
    name: "date_created",
  });
  const [optCreatedBy, setOptCreatedBy] = useState<OptionalFieldState>({
    enabled: false,
    name: "user_created",
  });
  const [optUpdatedOn, setOptUpdatedOn] = useState<OptionalFieldState>({
    enabled: true,
    name: "date_updated",
  });
  const [optUpdatedBy, setOptUpdatedBy] = useState<OptionalFieldState>({
    enabled: false,
    name: "user_updated",
  });

  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Please enter a collection name.");
      return;
    }
    setSaving(true);
    try {
      if (mode === "create") {
        const optional_fields: CmsOptionalFieldsConfig = {
          status: optStatus,
          sort: optSort,
          date_created: optCreatedOn,
          user_created: optCreatedBy,
          date_updated: optUpdatedOn,
          user_updated: optUpdatedBy,
        };

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
            fields: [],
            optional_fields,
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
        className="max-h-[92vh] overflow-y-auto rounded-2xl p-0 gap-0 sm:max-w-3xl border border-border bg-card"
      >
        <div
          className={cn(
            "grid min-h-[500px]",
            mode === "create" ? "sm:grid-cols-[200px_1fr]" : "grid-cols-1"
          )}
        >
          {/* Left Navigation Rail (Only for Create Mode) */}
          {mode === "create" ? (
            <div className="border-r border-border bg-surface-subtle/50 p-4 space-y-1.5">
              <button
                type="button"
                onClick={() => setTab("setup")}
                className={cn(
                  "w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-colors",
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
                  "w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-colors",
                  tab === "optional"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                Optional Fields
              </button>
            </div>
          ) : null}

          {/* Right Main Content */}
          <div className="p-6 sm:p-8 space-y-6 flex flex-col justify-between">
            <div className="space-y-6">
              {/* Header with Title and Directus Step Action Buttons */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-lg border border-border bg-surface-subtle text-foreground">
                    <Box className="size-4.5" />
                  </span>
                  <DialogTitle className="text-base font-semibold text-foreground">
                    {mode === "create"
                      ? "Creating New Collection"
                      : "Collection Settings"}
                  </DialogTitle>
                </div>

                {mode === "create" ? (
                  <div>
                    {tab === "setup" ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (!form.name.trim()) {
                            toast.error("Please enter a collection name first.");
                            return;
                          }
                          setTab("optional");
                        }}
                        className="grid size-9 place-items-center rounded-full bg-foreground text-background transition-opacity hover:opacity-90 shadow-xs"
                        title="Next: Optional Fields"
                        aria-label="Next step"
                      >
                        <ArrowRight className="size-4" strokeWidth={2.5} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={saving || !form.name.trim()}
                        onClick={save}
                        className="grid size-9 place-items-center rounded-full bg-foreground text-background transition-opacity hover:opacity-90 disabled:opacity-50 shadow-xs"
                        title="Save & Create Collection"
                        aria-label="Create collection"
                      >
                        <Check className="size-4" strokeWidth={2.5} />
                      </button>
                    )}
                  </div>
                ) : null}
              </div>

              {/* Information Banner */}
              <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-subtle/80 p-3.5 text-xs text-muted-foreground">
                <Info className="size-4 shrink-0 text-foreground" />
                <span>
                  {mode === "create"
                    ? tab === "setup"
                      ? 'Name the collection and setup its unique "key" field...'
                      : "Enable and rename any of these optional fields."
                    : "Update collection metadata and presentation options."}
                </span>
              </div>

              {/* STEP 1: COLLECTION SETUP */}
              {mode === "create" && tab === "setup" ? (
                <div className="space-y-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    {/* Collection Name */}
                    <div className="grid gap-2">
                      <Label htmlFor="col-name" className="text-sm font-semibold">
                        Name *
                      </Label>
                      <Input
                        id="col-name"
                        value={form.name}
                        placeholder="e.g. students"
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
                      <span className="text-xs text-muted-foreground italic">
                        Collection names are case sensitive and slugified
                      </span>
                    </div>

                    {/* Singleton Toggle */}
                    <div className="grid gap-2">
                      <Label className="text-sm font-semibold">Singleton</Label>
                      <div className="flex h-11 items-center justify-between rounded-xl border border-input bg-card px-4 transition-colors">
                        <span className="text-sm font-medium text-foreground">
                          Treat as single object
                        </span>
                        <Switch
                          checked={form.singleton}
                          onCheckedChange={(checked) =>
                            setForm((current) => ({
                              ...current,
                              singleton: checked,
                            }))
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-border pt-4">
                    <div className="grid gap-5 sm:grid-cols-2">
                      {/* Primary Key Field */}
                      <div className="grid gap-2">
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

                      {/* Primary Key Type */}
                      <div className="grid gap-2">
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
                            className="h-11 w-full appearance-none rounded-xl border border-input bg-card px-4 pr-10 text-sm text-foreground outline-none"
                          >
                            <option value="integer">Auto-incremented integer</option>
                            <option value="bigInteger">Auto-incremented big integer</option>
                            <option value="uuid">Generated UUID</option>
                            <option value="string">Manually entered string</option>
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2 border-t border-border pt-4">
                    <div className="grid gap-2">
                      <Label htmlFor="col-label" className="text-sm font-semibold">
                        Display Label
                      </Label>
                      <Input
                        id="col-label"
                        value={form.label}
                        placeholder="e.g. Students"
                        className="h-11 rounded-xl bg-card border-input"
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            label: event.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="col-note" className="text-sm font-semibold">
                        Note / Description
                      </Label>
                      <Input
                        id="col-note"
                        value={form.note}
                        placeholder="Central student records..."
                        className="h-11 rounded-xl bg-card border-input"
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            note: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>
              ) : mode === "create" ? (
                /* STEP 2: OPTIONAL FIELDS */
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Status Field */}
                  <div className="grid gap-3">
                    <Label className="text-xs font-semibold text-muted-foreground">Status</Label>
                    <div className="flex h-11 items-center gap-3 rounded-xl border border-input bg-card px-3 transition-colors">
                      <Switch
                        checked={optStatus.enabled}
                        onCheckedChange={(checked) =>
                          setOptStatus((s) => ({ ...s, enabled: checked }))
                        }
                      />
                      <Input
                        value={optStatus.name}
                        disabled={!optStatus.enabled}
                        onChange={(e) =>
                          setOptStatus((s) => ({ ...s, name: slugify(e.target.value) }))
                        }
                        className="h-8 border-none bg-transparent p-0 font-mono text-sm shadow-none outline-none disabled:opacity-40"
                      />
                      <Flag className="size-4 shrink-0 text-muted-foreground ml-auto" />
                    </div>
                  </div>

                  {/* Sort Field */}
                  <div className="grid gap-3">
                    <Label className="text-xs font-semibold text-muted-foreground">Sort</Label>
                    <div className="flex h-11 items-center gap-3 rounded-xl border border-input bg-card px-3 transition-colors">
                      <Switch
                        checked={optSort.enabled}
                        onCheckedChange={(checked) =>
                          setOptSort((s) => ({ ...s, enabled: checked }))
                        }
                      />
                      <Input
                        value={optSort.name}
                        disabled={!optSort.enabled}
                        onChange={(e) =>
                          setOptSort((s) => ({ ...s, name: slugify(e.target.value) }))
                        }
                        className="h-8 border-none bg-transparent p-0 font-mono text-sm shadow-none outline-none disabled:opacity-40"
                      />
                      <ArrowUpDown className="size-4 shrink-0 text-muted-foreground ml-auto" />
                    </div>
                  </div>

                  {/* Created On Field */}
                  <div className="grid gap-3">
                    <Label className="text-xs font-semibold text-muted-foreground">Created On</Label>
                    <div className="flex h-11 items-center gap-3 rounded-xl border border-input bg-card px-3 transition-colors">
                      <Switch
                        checked={optCreatedOn.enabled}
                        onCheckedChange={(checked) =>
                          setOptCreatedOn((s) => ({ ...s, enabled: checked }))
                        }
                      />
                      <Input
                        value={optCreatedOn.name}
                        disabled={!optCreatedOn.enabled}
                        onChange={(e) =>
                          setOptCreatedOn((s) => ({ ...s, name: slugify(e.target.value) }))
                        }
                        className="h-8 border-none bg-transparent p-0 font-mono text-sm shadow-none outline-none disabled:opacity-40"
                      />
                      <Clock className="size-4 shrink-0 text-muted-foreground ml-auto" />
                    </div>
                  </div>

                  {/* Created By Field */}
                  <div className="grid gap-3">
                    <Label className="text-xs font-semibold text-muted-foreground">Created By</Label>
                    <div className="flex h-11 items-center gap-3 rounded-xl border border-input bg-card px-3 transition-colors">
                      <Switch
                        checked={optCreatedBy.enabled}
                        onCheckedChange={(checked) =>
                          setOptCreatedBy((s) => ({ ...s, enabled: checked }))
                        }
                      />
                      <Input
                        value={optCreatedBy.name}
                        disabled={!optCreatedBy.enabled}
                        onChange={(e) =>
                          setOptCreatedBy((s) => ({ ...s, name: slugify(e.target.value) }))
                        }
                        className="h-8 border-none bg-transparent p-0 font-mono text-sm shadow-none outline-none disabled:opacity-40"
                      />
                      <User className="size-4 shrink-0 text-muted-foreground ml-auto" />
                    </div>
                  </div>

                  {/* Updated On Field */}
                  <div className="grid gap-3">
                    <Label className="text-xs font-semibold text-muted-foreground">Updated On</Label>
                    <div className="flex h-11 items-center gap-3 rounded-xl border border-input bg-card px-3 transition-colors">
                      <Switch
                        checked={optUpdatedOn.enabled}
                        onCheckedChange={(checked) =>
                          setOptUpdatedOn((s) => ({ ...s, enabled: checked }))
                        }
                      />
                      <Input
                        value={optUpdatedOn.name}
                        disabled={!optUpdatedOn.enabled}
                        onChange={(e) =>
                          setOptUpdatedOn((s) => ({ ...s, name: slugify(e.target.value) }))
                        }
                        className="h-8 border-none bg-transparent p-0 font-mono text-sm shadow-none outline-none disabled:opacity-40"
                      />
                      <Clock className="size-4 shrink-0 text-muted-foreground ml-auto" />
                    </div>
                  </div>

                  {/* Updated By Field */}
                  <div className="grid gap-3">
                    <Label className="text-xs font-semibold text-muted-foreground">Updated By</Label>
                    <div className="flex h-11 items-center gap-3 rounded-xl border border-input bg-card px-3 transition-colors">
                      <Switch
                        checked={optUpdatedBy.enabled}
                        onCheckedChange={(checked) =>
                          setOptUpdatedBy((s) => ({ ...s, enabled: checked }))
                        }
                      />
                      <Input
                        value={optUpdatedBy.name}
                        disabled={!optUpdatedBy.enabled}
                        onChange={(e) =>
                          setOptUpdatedBy((s) => ({ ...s, name: slugify(e.target.value) }))
                        }
                        className="h-8 border-none bg-transparent p-0 font-mono text-sm shadow-none outline-none disabled:opacity-40"
                      />
                      <User className="size-4 shrink-0 text-muted-foreground ml-auto" />
                    </div>
                  </div>
                </div>
              ) : (
                /* EDIT COLLECTION SETTINGS */
                <div className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="col-name" className="text-sm font-semibold">
                        Name
                      </Label>
                      <Input
                        id="col-name"
                        value={form.name}
                        disabled
                        className="h-11 font-mono rounded-xl bg-card border-input opacity-70"
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label className="text-sm font-semibold">Singleton</Label>
                      <div className="flex h-11 items-center justify-between rounded-xl border border-input bg-card px-4">
                        <span className="text-sm font-medium text-foreground">
                          Treat as single object
                        </span>
                        <Switch
                          checked={form.singleton}
                          onCheckedChange={(checked) =>
                            setForm((current) => ({
                              ...current,
                              singleton: checked,
                            }))
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
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

                    <div className="grid gap-2">
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
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-input bg-card px-4 py-3">
                    <span className="text-sm font-medium text-foreground">
                      Hide this collection from content navigation
                    </span>
                    <Switch
                      checked={form.hidden}
                      onCheckedChange={(checked) =>
                        setForm((current) => ({
                          ...current,
                          hidden: checked,
                        }))
                      }
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="flex flex-col-reverse gap-2 pt-4 border-t border-border sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="outline"
                className="rounded-lg sm:mr-auto"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <div className="flex items-center gap-2">
                {mode === "create" && tab === "setup" ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-lg"
                    onClick={() => {
                      if (!form.name.trim()) {
                        toast.error("Please enter a collection name first.");
                        return;
                      }
                      setTab("optional");
                    }}
                  >
                    Next: Optional Fields
                    <ArrowRight className="size-4 ml-1" />
                  </Button>
                ) : null}
                <BusyButton
                  type="button"
                  busy={saving}
                  onClick={save}
                  disabled={!form.name.trim()}
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
