"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Bookmark,
  Braces,
  Check,
  ChevronDown,
  Database,
  FilePlus2,
  Layers,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  Table2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { PageActions } from "@/components/app/PageActions";
import { PageActionsPortal, useSetNavbarMeta } from "@/components/app/PageActionsSlot";
import { useConfirm } from "@/components/app/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EtViewProps } from "@/engine/views-registry";
import { cn } from "@/lib/utils";
import type {
  CmsBootstrapReport,
  CmsCollectionWithFields,
  CmsField,
  CmsFieldType,
} from "@/modules/cms/cms-types";
import { CollectionDialog } from "./CollectionDialog";
import { ContentSidebar } from "./ContentSidebar";
import { FieldDrawer, type FieldFormState } from "./FieldDrawer";
import {
  BusyButton,
  EmptyState,
  FIELD_TYPE_OPTIONS,
  cms_call,
} from "./ui";

interface Snapshot {
  collections?: CmsCollectionWithFields[];
  selected?: CmsCollectionWithFields | null;
  fields?: CmsField[];
}

function emptyFieldForm(): FieldFormState {
  return {
    name: "",
    label: "",
    type: "string",
    interface: "input",
    required: false,
    unique: false,
    hidden: false,
    readonly: false,
    choices: "",
    defaultValue: "",
    options: {},
  };
}

function formFromField(field: CmsField): FieldFormState {
  return {
    name: field.name,
    label: field.label,
    type: field.type,
    interface: field.interface,
    required: field.required,
    unique: field.unique,
    hidden: field.hidden,
    readonly: field.readonly,
    choices: Array.isArray(field.options.choices)
      ? field.options.choices.map(String).join(", ")
      : "",
    defaultValue:
      field.options.default === undefined ? "" : String(field.options.default),
    options: field.options ?? {},
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

export default function DataStudio({ data }: EtViewProps) {
  const initial = data as unknown as Snapshot;
  const [collections, setCollections] = useState<CmsCollectionWithFields[]>(
    initial.collections ?? []
  );
  const [selected, setSelected] = useState<CmsCollectionWithFields | null>(
    initial.selected ?? null
  );
  const [fields, setFields] = useState<CmsField[]>(initial.fields ?? []);
  const [busy, setBusy] = useState(false);
  const { confirm, dialog: confirm_dialog } = useConfirm();

  // Collection modal states
  const [collectionDialogOpen, setCollectionDialogOpen] = useState(false);
  const [collectionDialogMode, setCollectionDialogMode] = useState<"create" | "edit">("create");

  // Field modal states
  const [fieldOpen, setFieldOpen] = useState(false);
  const [editingField, setEditingField] = useState<CmsField | null>(null);
  const [fieldForm, setFieldForm] = useState<FieldFormState>(emptyFieldForm());
  const [fieldSaving, setFieldSaving] = useState(false);

  // Bootstrap Dialog states
  const [bootstrapOpen, setBootstrapOpen] = useState(false);
  const [bootstrapReport, setBootstrapReport] = useState<CmsBootstrapReport | null>(null);
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [bootstrapApplying, setBootstrapApplying] = useState(false);

  const applySnapshot = useCallback((snapshot: Snapshot) => {
    setCollections(snapshot.collections ?? []);
    setSelected(snapshot.selected ?? null);
    setFields(snapshot.fields ?? []);
  }, []);

  const refresh = useCallback(
    async (collectionName?: string) => {
      setBusy(true);
      try {
        const snapshot = await cms_call<Snapshot>("data_state", {
          collection: collectionName ?? selected?.name ?? "",
        });
        applySnapshot(snapshot);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not load schema.");
      } finally {
        setBusy(false);
      }
    },
    [applySnapshot, selected]
  );

  const selectCollection = useCallback(
    async (name: string) => {
      await refresh(name);
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("collection", name);
        url.searchParams.delete("new");
        window.history.replaceState(null, "", url);
      }
    },
    [refresh]
  );

  const openCreateCollection = useCallback(() => {
    setCollectionDialogMode("create");
    setCollectionDialogOpen(true);
  }, []);

  const openEditCollection = useCallback(() => {
    if (!selected) return;
    setCollectionDialogMode("edit");
    setCollectionDialogOpen(true);
  }, [selected]);

  const deleteCollection = useCallback(async () => {
    if (!selected) return;
    const confirmed = await confirm({
      title: `Delete collection '${selected.label || selected.name}'?`,
      description: (
        <>
          This drops table <span className="font-mono text-foreground">{selected.name}</span>{" "}
          and all of its metadata, access rules, and records. This cannot be undone.
        </>
      ),
      confirmLabel: "Drop table & delete collection",
    });
    if (!confirmed) return;
    try {
      await cms_call("data_collection_delete", { name: selected.name });
      toast.success(`Collection '${selected.name}' deleted.`);
      setSelected(null);
      setFields([]);
      await refresh("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the collection.");
    }
  }, [confirm, refresh, selected]);

  const openCreateField = useCallback(() => {
    setEditingField(null);
    setFieldForm(emptyFieldForm());
    setFieldOpen(true);
  }, []);

  const openEditField = useCallback((field: CmsField) => {
    setEditingField(field);
    setFieldForm(formFromField(field));
    setFieldOpen(true);
  }, []);

  const saveField = useCallback(async () => {
    if (!selected) return;
    setFieldSaving(true);
    try {
      const options: Record<string, unknown> = { ...(fieldForm.options ?? {}) };
      if (
        fieldForm.type === "select" ||
        fieldForm.interface === "dropdown" ||
        fieldForm.interface === "radio" ||
        fieldForm.interface === "checkboxes"
      ) {
        if (fieldForm.choices) {
          options.choices = fieldForm.choices
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean);
        }
      }
      if (fieldForm.defaultValue) {
        options.default = fieldForm.defaultValue;
      }

      if (editingField) {
        await cms_call("data_field_update", {
          collection: selected.name,
          name: editingField.name,
          label: fieldForm.label,
          type: fieldForm.type,
          interface: fieldForm.interface,
          options,
          required: fieldForm.required,
          unique: fieldForm.unique,
          hidden: fieldForm.hidden,
          readonly: fieldForm.readonly,
        });
        toast.success(`Field '${editingField.name}' updated.`);
      } else {
        await cms_call("data_field_add", {
          collection: selected.name,
          name: fieldForm.name,
          label: fieldForm.label,
          type: fieldForm.type,
          interface: fieldForm.interface,
          options,
          required: fieldForm.required,
          unique: fieldForm.unique,
          hidden: fieldForm.hidden,
          readonly: fieldForm.readonly,
        });
        toast.success(`Field '${fieldForm.name}' added.`);
      }
      setFieldOpen(false);
      await refresh(selected.name);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the field.");
    } finally {
      setFieldSaving(false);
    }
  }, [editingField, fieldForm, refresh, selected]);

  const deleteField = useCallback(
    async (field: CmsField) => {
      if (!selected) return;
      const confirmed = await confirm({
        title: `Delete field '${field.label || field.name}'?`,
        description: (
          <>
            Column <span className="font-mono text-foreground">{field.name}</span> and
            any data in it will be permanently dropped.
          </>
        ),
        confirmLabel: "Drop column",
      });
      if (!confirmed) return;
      try {
        await cms_call("data_field_delete", {
          collection: selected.name,
          name: field.name,
        });
        toast.success(`Field '${field.name}' deleted.`);
        await refresh(selected.name);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not delete the field.");
      }
    },
    [confirm, refresh, selected]
  );

  const bootstrap = useCallback(async () => {
    setBusy(true);
    try {
      const created = await cms_call<CmsCollectionWithFields>("data_bootstrap");
      toast.success("Starter Posts collection created.");
      await refresh(created.name);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the starter collection.");
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const refreshSchema = useCallback(async () => {
    setBusy(true);
    try {
      const snapshot = await cms_call<Snapshot>("data_refresh");
      applySnapshot(snapshot);
      toast.success("Database schema refreshed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not refresh the schema.");
    } finally {
      setBusy(false);
    }
  }, [applySnapshot]);

  const openBootstrap = useCallback(async () => {
    setBootstrapOpen(true);
    setBootstrapLoading(true);
    setBootstrapReport(null);
    try {
      const report = await cms_call<CmsBootstrapReport>("data_bootstrap_scan");
      setBootstrapReport(report);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not scan the database.");
    } finally {
      setBootstrapLoading(false);
    }
  }, []);

  const applyBootstrap = useCallback(async () => {
    setBootstrapApplying(true);
    try {
      const report = await cms_call<CmsBootstrapReport>("data_bootstrap_apply");
      setBootstrapReport(report);
      const changed = report.summary.new + report.summary.update;
      const skipped = report.summary.skipped;
      toast.success(
        changed > 0
          ? `Registered or updated ${changed} table${changed === 1 ? "" : "s"}${skipped > 0 ? `; ${skipped} skipped` : ""
          }.`
          : "The database schema is already registered."
      );
      setBootstrapOpen(false);
      await refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not bootstrap the database."
      );
    } finally {
      setBootstrapApplying(false);
    }
  }, [refresh]);

  // Navbar metadata
  const navbarMeta = useMemo(() => {
    if (!selected) {
      return {
        section: "Workspace",
        title: "Data Studio",
        icon: <Database className="size-4" strokeWidth={1.75} />,
      };
    }
    return {
      section: "Data Studio",
      title: selected.label || selected.name,
      badge: <Bookmark className="size-3.5 text-muted-foreground ml-1" />,
    };
  }, [selected]);

  useSetNavbarMeta(navbarMeta);

  return (
    <div className="app-page">
      <PageActionsPortal>
        <PageActions
          items={[
            {
              label: "New collection",
              icon: <Plus className="size-4" />,
              variant: "default",
              onSelect: openCreateCollection,
            },
            ...(selected
              ? [
                {
                  label: "Add field",
                  icon: <Plus className="size-4" />,
                  onSelect: openCreateField,
                },
                {
                  label: "Open Content",
                  icon: <ArrowUpRight className="size-4" />,
                  href: `/admin/content?collection=${encodeURIComponent(selected.name)}`,
                },
              ]
              : []),
            {
              label: "Bootstrap database",
              icon: <Database className="size-4" />,
              onSelect: openBootstrap,
            },
            {
              label: "Refresh schema",
              icon: <RefreshCw className="size-4" />,
              onSelect: refreshSchema,
            },
          ]}
        />
      </PageActionsPortal>

      <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        {/* Data Studio Sidebar */}
        <ContentSidebar
          collections={collections}
          activeName={selected?.name}
          onSelect={selectCollection}
          busy={busy}
        />

        <div className="min-w-0">
          {!selected ? (
            /* OVERVIEW: Collections & Data Modeling */
            <div className="space-y-6">

              {collections.length === 0 ? (
                <div className="py-12 text-center">
                  <EmptyState
                    icon={<Database className="size-5" />}
                    title="No collections yet"
                    description="Create your first collection table, or bootstrap tables from your SQLite database."
                    action={
                      <div className="flex flex-wrap justify-center gap-2">
                        <Button
                          type="button"
                          onClick={openCreateCollection}
                          className="rounded-lg"
                        >
                          <Plus className="size-4" />
                          Create a collection
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={openBootstrap}
                          className="rounded-lg"
                        >
                          <Database className="size-4" />
                          Bootstrap database
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={bootstrap}
                          className="rounded-lg"
                        >
                          <FilePlus2 className="size-4" />
                          Use starter Posts
                        </Button>
                      </div>
                    }
                  />
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {collections.map((col) => (
                    <Card
                      key={col.name}
                      className="group cursor-pointer transition-all hover:border-foreground/30"
                      onClick={() => selectCollection(col.name)}
                    >
                      <CardHeader className="p-4 pb-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="grid size-8 place-items-center rounded-lg border border-border bg-surface-subtle text-foreground">
                            <Table2 className="size-4" />
                          </span>
                          <div className="flex items-center gap-1.5">
                            {col.singleton ? (
                              <Badge variant="outline" className="text-xs">
                                Singleton
                              </Badge>
                            ) : null}
                            {col.hidden ? (
                              <Badge variant="outline" className="text-xs">
                                Hidden
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                        <CardTitle className="text-sm font-semibold text-muted-foreground mt-3">
                          {col.label || col.name}
                        </CardTitle>
                        <p className="font-mono text-xs text-muted-foreground truncate">
                          {col.name}
                        </p>
                      </CardHeader>
                      <CardContent className="p-4 pt-2">
                        <p className="text-xs text-muted-foreground line-clamp-2 min-h-[32px]">
                          {col.note || "No description provided."}
                        </p>
                        <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                          <span>
                            {col.fields.length} {col.fields.length === 1 ? "field" : "fields"}
                          </span>
                          <Button
                            asChild
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Link href={`/admin/content?collection=${encodeURIComponent(col.name)}`}>
                              Open Content
                              <ArrowUpRight className="size-3 ml-1" />
                            </Link>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* COLLECTION SCHEMA STUDIO */
            <div className="space-y-6">
              {/* Schema Fields Table */}
              <div className="space-y-0">

                <div className="overflow-hidden rounded-xl border border-border bg-background">
                  <div className="app-scrollbar overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-border bg-sidebar text-xs font-semibold text-muted-foreground">
                          <th className="px-4 py-3">Column Name</th>
                          <th className="px-4 py-3">Label</th>
                          <th className="px-4 py-3">Type</th>
                          <th className="px-4 py-3">Attributes</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border bg-background">
                        {fields.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-10 text-center text-xs text-muted-foreground">
                              No fields defined for this collection.
                            </td>
                          </tr>
                        ) : (
                          fields.map((field) => {
                            const isPk = field.name === selected.primary_key;
                            return (
                              <tr
                                key={field.name}
                                className="border-b border-border transition-colors hover:bg-surface-subtle/60"
                              >
                                <td className="px-4 py-3 font-mono text-xs font-medium text-muted-foreground">
                                  {field.name}
                                </td>
                                <td className="px-4 py-3 text-sm text-muted-foreground">
                                  {field.label || field.name}
                                </td>
                                <td className="px-4 py-3">
                                  <Badge variant="secondary" className="font-mono text-xs text-muted-foreground">
                                    {field.type}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {isPk ? (
                                      <Badge variant="outline" className="text-xs text-muted-foreground">
                                        Primary key
                                      </Badge>
                                    ) : null}
                                    {field.required ? (
                                      <Badge variant="outline" className="text-xs text-muted-foreground">
                                        Required
                                      </Badge>
                                    ) : null}
                                    {field.unique ? (
                                      <Badge variant="outline" className="text-xs text-muted-foreground">
                                        Unique
                                      </Badge>
                                    ) : null}
                                    {field.readonly ? (
                                      <Badge variant="outline" className="text-xs text-muted-foreground">
                                        Read only
                                      </Badge>
                                    ) : null}
                                    {field.hidden ? (
                                      <Badge variant="outline" className="text-xs text-muted-foreground">
                                        Hidden
                                      </Badge>
                                    ) : null}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex justify-end gap-1">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon-xs"
                                      aria-label={`Edit ${field.name}`}
                                      onClick={() => openEditField(field)}
                                    >
                                      <Pencil className="size-3.5" />
                                    </Button>
                                    {!isPk ? (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-xs"
                                        aria-label={`Delete ${field.name}`}
                                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                        onClick={() => deleteField(field)}
                                      >
                                        <Trash2 className="size-3.5" />
                                      </Button>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Clean Bottom Bar */}
                  <div className="flex items-center border-t border-border px-4 py-3 bg-surface-subtle/40">
                    <span className="text-xs text-muted-foreground">
                      {fields.length} {fields.length === 1 ? "column" : "columns"} defined
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Shared Collection Dialog: Creates or edits collections */}
      <CollectionDialog
        open={collectionDialogOpen}
        onOpenChange={setCollectionDialogOpen}
        mode={collectionDialogMode}
        collection={collectionDialogMode === "edit" ? selected : null}
        onSaved={(col) => {
          setSelected(col);
          setFields(col.fields);
          setCollections((current) =>
            [
              ...current.filter((c) => c.name !== col.name),
              col,
            ].sort((a, b) =>
              (a.label || a.name).localeCompare(b.label || b.name)
            )
          );
        }}
      />

      {/* FIELD DRAWER (Directus Style) */}
      <FieldDrawer
        open={fieldOpen}
        onOpenChange={setFieldOpen}
        collectionName={selected?.label || selected?.name || ""}
        collections={collections}
        editingField={editingField}
        form={fieldForm}
        setForm={setFieldForm}
        saving={fieldSaving}
        onSave={saveField}
      />

      {/* BOOTSTRAP DATABASE DIALOG */}
      <Dialog open={bootstrapOpen} onOpenChange={setBootstrapOpen}>
        <DialogContent aria-describedby={undefined} className="rounded-xl sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold text-muted-foreground">
              Bootstrap Database
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Scan existing SQLite tables, register collections, and infer column types.
            </DialogDescription>
          </DialogHeader>

          {bootstrapLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : bootstrapReport ? (
            <div className="space-y-4 pt-2 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">
                  {bootstrapReport.summary.new} new table{bootstrapReport.summary.new === 1 ? "" : "s"}
                </Badge>
                <Badge variant="outline">
                  {bootstrapReport.summary.update} to update
                </Badge>
                <Badge variant="outline">
                  {bootstrapReport.summary.skipped} skipped
                </Badge>
              </div>

              <div className="app-scrollbar max-h-60 overflow-y-auto space-y-2 border border-border rounded-lg p-3 bg-surface-subtle/40">
                {bootstrapReport.tables.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No eligible tables found to import.
                  </p>
                ) : (
                  bootstrapReport.tables.map((table) => (
                    <div
                      key={table.name}
                      className="flex items-center justify-between gap-2 text-xs border-b border-border pb-2 last:border-b-0 last:pb-0"
                    >
                      <div>
                        <span className="font-mono font-semibold text-foreground">
                          {table.name}
                        </span>
                        <span className="text-muted-foreground ml-2">
                          ({table.field_count} columns)
                        </span>
                      </div>
                      <Badge
                        variant={table.status === "new" ? "default" : "outline"}
                        className="text-xs"
                      >
                        {table.status}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}

          <DialogFooter className="pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              className="rounded-lg"
              onClick={() => setBootstrapOpen(false)}
            >
              Cancel
            </Button>
            <BusyButton
              type="button"
              busy={bootstrapApplying}
              disabled={bootstrapLoading || !bootstrapReport}
              className="rounded-lg"
              onClick={applyBootstrap}
            >
              Apply bootstrap
            </BusyButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirm_dialog}
    </div>
  );
}
