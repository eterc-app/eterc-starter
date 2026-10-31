"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpDown,
  Bookmark,
  Box,
  Braces,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  ExternalLink,
  EyeOff,
  FilePlus2,
  Filter,
  GripVertical,
  Info,
  Key,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/app/ConfirmDialog";
import { PageActions } from "@/components/app/PageActions";
import {
  PageActionsPortal,
  useSetNavbarMeta,
} from "@/components/app/PageActionsSlot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EtViewProps } from "@/engine/views-registry";
import type {
  CmsBootstrapReport,
  CmsCollectionWithFields,
  CmsField,
  CmsFieldType,
} from "@/modules/cms/cms-types";
import { ContentSidebar } from "./ContentSidebar";
import {
  BusyButton,
  EmptyState,
  FieldInput,
  FieldLabel,
  cms_call,
  format_datetime,
} from "./ui";
import { cn } from "@/lib/utils";

interface Snapshot {
  collections: CmsCollectionWithFields[];
  selected: CmsCollectionWithFields | null;
  fields: CmsField[];
  records: Record<string, unknown>[];
  total: number;
  page: number;
  pages: number;
  limit: number;
  search: string;
  create?: boolean;
}

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
  primaryKeyType: string;
  fields: DraftField[];
}

interface FieldForm {
  name: string;
  label: string;
  type: CmsFieldType;
  required: boolean;
  unique: boolean;
  hidden: boolean;
  readonly: boolean;
  choices: string;
  defaultValue: string;
}

const FIELD_TYPES: Array<{ value: CmsFieldType; label: string }> = [
  { value: "string", label: "Short text" },
  { value: "text", label: "Long text" },
  { value: "integer", label: "Integer" },
  { value: "decimal", label: "Decimal" },
  { value: "boolean", label: "Boolean" },
  { value: "datetime", label: "Date & time" },
  { value: "json", label: "JSON" },
  { value: "select", label: "Select" },
  { value: "image", label: "Image URL" },
  { value: "relation", label: "Relation ID" },
];

function emptyCollectionForm(): CollectionForm {
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

function emptyFieldForm(): FieldForm {
  return {
    name: "",
    label: "",
    type: "string",
    required: false,
    unique: false,
    hidden: false,
    readonly: false,
    choices: "",
    defaultValue: "",
  };
}

function fieldFormFromField(field: CmsField): FieldForm {
  return {
    name: field.name,
    label: field.label,
    type: field.type,
    required: field.required,
    unique: field.unique,
    hidden: field.hidden,
    readonly: field.readonly,
    choices: Array.isArray(field.options.choices)
      ? field.options.choices.map(String).join(", ")
      : "",
    defaultValue:
      field.options.default === undefined ? "" : String(field.options.default),
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

function cell_value(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function record_defaults(fields: CmsField[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.options.default !== undefined) values[field.name] = field.options.default;
    else if (field.type === "boolean") values[field.name] = false;
    else values[field.name] = "";
  }
  return values;
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
  const [records, setRecords] = useState<Record<string, unknown>[]>(
    initial.records ?? []
  );
  const [total, setTotal] = useState(Number(initial.total ?? 0));
  const [page, setPage] = useState(Number(initial.page ?? 1));
  const [pages, setPages] = useState(Number(initial.pages ?? 1));
  const [search, setSearch] = useState(String(initial.search ?? ""));
  const [searchInput, setSearchInput] = useState(String(initial.search ?? ""));
  const [busy, setBusy] = useState(false);
  const { confirm, dialog: confirm_dialog } = useConfirm();

  // Working Area View Mode: "table" | "record-form" | "fields-layout"
  const [viewMode, setViewMode] = useState<"table" | "record-form" | "fields-layout">("table");
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  // Slide-over Collection Drawer state (Image 6)
  const [collectionDrawerOpen, setCollectionDrawerOpen] = useState(Boolean(initial.create));
  const [collectionDrawerTab, setCollectionDrawerTab] = useState<"setup" | "optional">("setup");
  const [collectionMode, setCollectionMode] = useState<"create" | "edit">("create");
  const [collectionForm, setCollectionForm] = useState<CollectionForm>(emptyCollectionForm());
  const [collectionSaving, setCollectionSaving] = useState(false);

  // Field edit dialog state
  const [fieldOpen, setFieldOpen] = useState(false);
  const [editingField, setEditingField] = useState<CmsField | null>(null);
  const [fieldForm, setFieldForm] = useState<FieldForm>(emptyFieldForm());
  const [fieldSaving, setFieldSaving] = useState(false);

  // Record Form state (Image 1)
  const [editingRecord, setEditingRecord] = useState<Record<string, unknown> | null>(null);
  const [recordValues, setRecordValues] = useState<Record<string, unknown>>({});
  const [recordSaving, setRecordSaving] = useState(false);

  // Bootstrap Dialog state
  const [bootstrapOpen, setBootstrapOpen] = useState(false);
  const [bootstrapReport, setBootstrapReport] = useState<CmsBootstrapReport | null>(null);
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [bootstrapApplying, setBootstrapApplying] = useState(false);

  const applySnapshot = useCallback((snapshot: Snapshot) => {
    setCollections(snapshot.collections ?? []);
    setSelected(snapshot.selected ?? null);
    setFields(snapshot.fields ?? []);
    setRecords(snapshot.records ?? []);
    setTotal(Number(snapshot.total ?? 0));
    setPage(Number(snapshot.page ?? 1));
    setPages(Number(snapshot.pages ?? 1));
    setSearch(String(snapshot.search ?? ""));
    setSearchInput(String(snapshot.search ?? ""));
  }, []);

  const refresh = useCallback(
    async (collectionName?: string, nextPage = 1, nextSearch = search) => {
      setBusy(true);
      try {
        const snapshot = await cms_call<Snapshot>("data_state", {
          collection: collectionName ?? selected?.name ?? "",
          page: nextPage,
          search: nextSearch,
        });
        applySnapshot(snapshot);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not load records.");
      } finally {
        setBusy(false);
      }
    },
    [applySnapshot, search, selected]
  );

  const selectCollection = useCallback(
    async (name: string) => {
      setViewMode("table");
      setSelectedRowIds(new Set());
      await refresh(name, 1, "");
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("collection", name);
        url.searchParams.delete("new");
        window.history.replaceState(null, "", url);
      }
    },
    [refresh]
  );

  const submitSearch = useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault();
      await refresh(selected?.name, 1, searchInput.trim());
    },
    [refresh, searchInput, selected?.name]
  );

  const openCreateCollection = useCallback(() => {
    setCollectionMode("create");
    setCollectionDrawerTab("setup");
    setCollectionForm(emptyCollectionForm());
    setCollectionDrawerOpen(true);
  }, []);

  const openEditCollection = useCallback(() => {
    if (!selected) return;
    setCollectionMode("edit");
    setCollectionDrawerTab("setup");
    setCollectionForm({
      name: selected.name,
      label: selected.label,
      icon: selected.icon,
      note: selected.note,
      singleton: selected.singleton,
      hidden: selected.hidden,
      primaryKey: selected.primary_key || "id",
      primaryKeyType: "integer",
      fields: [],
    });
    setCollectionDrawerOpen(true);
  }, [selected]);

  const saveCollection = useCallback(async () => {
    setCollectionSaving(true);
    try {
      if (collectionMode === "create") {
        const created = await cms_call<CmsCollectionWithFields>("data_collection_create", {
          name: collectionForm.name,
          label: collectionForm.label || collectionForm.name,
          icon: collectionForm.icon,
          note: collectionForm.note,
          singleton: collectionForm.singleton,
          fields: collectionForm.fields
            .filter((field) => field.name.trim() !== "")
            .map((field) => ({
              name: field.name,
              label: field.label || field.name,
              type: field.type,
              required: field.required,
            })),
        });
        toast.success(`Collection '${created.label || created.name}' created.`);
        setCollectionDrawerOpen(false);
        await refresh(created.name, 1, "");
      } else {
        await cms_call("data_collection_update", {
          name: collectionForm.name,
          label: collectionForm.label,
          icon: collectionForm.icon,
          note: collectionForm.note,
          singleton: collectionForm.singleton,
          hidden: collectionForm.hidden,
        });
        toast.success("Collection settings saved.");
        setCollectionDrawerOpen(false);
        await refresh(collectionForm.name, page, search);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the collection.");
    } finally {
      setCollectionSaving(false);
    }
  }, [collectionForm, collectionMode, page, refresh, search]);

  const deleteCollection = useCallback(async () => {
    if (!selected) return;
    const confirmed = await confirm({
      title: `Delete collection '${selected.label || selected.name}'?`,
      description: (
        <>
          This drops the table{" "}
          <span className="font-mono text-foreground">{selected.name}</span>, all its
          records, its fields metadata, and any access rules that reference it. This cannot
          be undone.
        </>
      ),
      confirmLabel: "Delete collection",
    });
    if (!confirmed) return;
    try {
      await cms_call("data_collection_delete", { name: selected.name });
      toast.success(`Collection '${selected.label || selected.name}' deleted.`);
      setViewMode("table");
      await refresh(undefined, 1, "");
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
    setFieldForm(fieldFormFromField(field));
    setFieldOpen(true);
  }, []);

  const saveField = useCallback(async () => {
    if (!selected) return;
    setFieldSaving(true);
    try {
      const choices = fieldForm.choices
        .split(",")
        .map((choice) => choice.trim())
        .filter(Boolean);
      const payload: Record<string, unknown> = {
        collection: selected.name,
        name: fieldForm.name,
        label: fieldForm.label || fieldForm.name,
        type: fieldForm.type,
        required: fieldForm.required,
        unique: fieldForm.unique,
        hidden: fieldForm.hidden,
        readonly: fieldForm.readonly,
        options: {
          ...(choices.length > 0 ? { choices } : {}),
          ...(fieldForm.defaultValue ? { default: fieldForm.defaultValue } : {}),
        },
      };

      if (editingField) {
        await cms_call("data_field_update", payload);
        toast.success(`Field '${fieldForm.label || fieldForm.name}' updated.`);
      } else {
        await cms_call("data_field_create", payload);
        toast.success(`Field '${fieldForm.label || fieldForm.name}' added.`);
      }
      setFieldOpen(false);
      await refresh(selected.name, page, search);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the field.");
    } finally {
      setFieldSaving(false);
    }
  }, [editingField, fieldForm, page, refresh, search, selected]);

  const deleteField = useCallback(
    async (field: CmsField) => {
      if (!selected) return;
      const confirmed = await confirm({
        title: `Delete column '${field.label || field.name}'?`,
        description: (
          <>
            Column <span className="font-mono text-foreground">{field.name}</span> and
            any data in it will be dropped from{" "}
            <span className="font-mono text-foreground">{selected.name}</span>.
          </>
        ),
        confirmLabel: "Delete field",
      });
      if (!confirmed) return;
      try {
        await cms_call("data_field_delete", {
          collection: selected.name,
          name: field.name,
        });
        toast.success(`Field '${field.label || field.name}' deleted.`);
        await refresh(selected.name, page, search);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not delete the field.");
      }
    },
    [confirm, page, refresh, search, selected]
  );

  const openCreateRecord = useCallback(() => {
    setEditingRecord(null);
    setRecordValues(record_defaults(fields));
    setViewMode("record-form");
  }, [fields]);

  const openEditRecord = useCallback((record: Record<string, unknown>) => {
    setEditingRecord(record);
    const values: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      values[key] = value ?? "";
    }
    setRecordValues(values);
    setViewMode("record-form");
  }, []);

  const saveRecord = useCallback(async () => {
    if (!selected) return;
    setRecordSaving(true);
    try {
      const values: Record<string, unknown> = {};
      for (const field of fields) {
        if (field.hidden || field.readonly) continue;
        if (editingRecord && field.name === selected.primary_key) continue;
        const value = recordValues[field.name];
        if (value !== undefined) values[field.name] = value;
      }

      if (editingRecord) {
        await cms_call("data_record_update", {
          collection: selected.name,
          id: editingRecord[selected.primary_key],
          values,
        });
        toast.success("Record updated.");
      } else {
        await cms_call("data_record_create", {
          collection: selected.name,
          values,
        });
        toast.success("Record created.");
      }
      setViewMode("table");
      await refresh(selected.name, page, search);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the record.");
    } finally {
      setRecordSaving(false);
    }
  }, [editingRecord, fields, page, recordValues, refresh, search, selected]);

  const deleteRecord = useCallback(
    async (record: Record<string, unknown>) => {
      if (!selected) return;
      const confirmed = await confirm({
        title: "Delete record?",
        description: (
          <>
            This record will be permanently removed from{" "}
            <span className="font-mono text-foreground">{selected.name}</span>. This
            cannot be undone.
          </>
        ),
        confirmLabel: "Delete record",
      });
      if (!confirmed) return;
      try {
        await cms_call("data_record_delete", {
          collection: selected.name,
          id: record[selected.primary_key],
        });
        toast.success("Record deleted.");
        setViewMode("table");
        await refresh(selected.name, page, search);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not delete the record.");
      }
    },
    [confirm, page, refresh, search, selected]
  );

  const bootstrap = useCallback(async () => {
    setBusy(true);
    try {
      const created = await cms_call<CmsCollectionWithFields>("data_bootstrap");
      toast.success("Starter Posts collection created.");
      await refresh(created.name, 1, "");
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
      setBootstrapOpen(false);
      toast.error(
        error instanceof Error ? error.message : "Could not scan the database."
      );
    } finally {
      setBootstrapLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("bootstrap") !== "1") return;
    url.searchParams.delete("bootstrap");
    window.history.replaceState(null, "", url);
    const timer = window.setTimeout(() => {
      void openBootstrap();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [openBootstrap]);

  const applyBootstrap = useCallback(async () => {
    setBootstrapApplying(true);
    try {
      const report = await cms_call<CmsBootstrapReport>("data_bootstrap_apply");
      setBootstrapReport(report);
      const changed = report.summary.new + report.summary.update;
      const skipped = report.summary.skipped;
      toast.success(
        changed > 0
          ? `Registered or updated ${changed} table${changed === 1 ? "" : "s"}${
              skipped > 0 ? `; ${skipped} skipped` : ""
            }.`
          : "The database schema is already registered."
      );
      setBootstrapOpen(false);
      await refresh(undefined, 1, "");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not bootstrap the database."
      );
    } finally {
      setBootstrapApplying(false);
    }
  }, [refresh]);

  const visibleFields = useMemo(
    () => fields.filter((field) => !field.hidden),
    [fields]
  );
  const tableFields = useMemo(
    () =>
      visibleFields
        .filter((field) => field.name !== selected?.primary_key)
        .slice(0, 8),
    [selected?.primary_key, visibleFields]
  );
  const editableFields = useMemo(
    () =>
      fields.filter(
        (field) =>
          !field.hidden &&
          !field.readonly &&
          (!editingRecord || field.name !== selected?.primary_key)
      ),
    [editingRecord, fields, selected?.primary_key]
  );

  // Sync Navbar state with active view mode (Image 1, 5, 7)
  const navbarMeta = useMemo(() => {
    if (!selected) {
      return {
        section: "Workspace",
        title: "Data Studio",
        icon: <Database className="size-4" strokeWidth={1.75} />,
      };
    }
    if (viewMode === "record-form") {
      return {
        section: selected.label || selected.name,
        title: editingRecord
          ? `Editing Item in ${selected.label || selected.name}`
          : `Creating Item in ${selected.label || selected.name}`,
        onBack: () => setViewMode("table"),
      };
    }
    if (viewMode === "fields-layout") {
      return {
        section: "Data Model",
        title: selected.label || selected.name,
        onBack: () => setViewMode("table"),
      };
    }
    return {
      section: "Content",
      title: selected.label || selected.name,
      badge: <Bookmark className="size-3.5 text-muted-foreground ml-1" />,
    };
  }, [editingRecord, selected, viewMode]);

  useSetNavbarMeta(navbarMeta);

  // Toggle selection of table row
  const toggleRowSelect = (id: string) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedRowIds.size === records.length && records.length > 0) {
      setSelectedRowIds(new Set());
    } else {
      setSelectedRowIds(
        new Set(records.map((r, i) => String(r[selected?.primary_key ?? "id"] ?? i)))
      );
    }
  };

  return (
    <div className="app-page">
      <PageActionsPortal>
        <PageActions
          items={
            viewMode === "record-form"
              ? [
                  {
                    label: recordSaving ? "Saving..." : "Save",
                    icon: recordSaving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Check className="size-4" strokeWidth={2.5} />
                    ),
                    variant: "default",
                    disabled: recordSaving,
                    onSelect: saveRecord,
                  },
                  ...(editingRecord
                    ? [
                        {
                          label: "Delete record",
                          icon: <Trash2 className="size-4" />,
                          variant: "destructive" as const,
                          onSelect: () => deleteRecord(editingRecord),
                        },
                      ]
                    : []),
                ]
              : viewMode === "fields-layout"
                ? [
                    {
                      label: "Done",
                      icon: <Check className="size-4" strokeWidth={2.5} />,
                      variant: "default",
                      onSelect: () => setViewMode("table"),
                    },
                    {
                      label: "Add field",
                      icon: <Plus className="size-4" />,
                      onSelect: openCreateField,
                    },
                    {
                      label: "Delete collection",
                      icon: <Trash2 className="size-4" />,
                      variant: "destructive" as const,
                      onSelect: deleteCollection,
                    },
                  ]
                : [
                    {
                      label: "New record",
                      icon: <Plus className="size-4" />,
                      variant: "default",
                      disabled: editableFields.length === 0,
                      onSelect: openCreateRecord,
                    },
                    {
                      label: "Collection settings",
                      icon: <Settings2 className="size-4" />,
                      onSelect: () => setViewMode("fields-layout"),
                    },
                    {
                      label: "New collection",
                      icon: <Plus className="size-4" />,
                      onSelect: openCreateCollection,
                    },
                    {
                      label: "Bootstrap database",
                      icon: <Database className="size-4" />,
                      onSelect: openBootstrap,
                    },
                    {
                      label: "API reference",
                      icon: <Braces className="size-4" />,
                      href: "/api-reference",
                      external: true,
                    },
                  ]
          }
        />
      </PageActionsPortal>

      <div className="grid gap-6 lg:grid-cols-[248px_minmax(0,1fr)]">
        <ContentSidebar
          collections={collections}
          activeName={selected?.name}
          onSelect={selectCollection}
          onCreate={openCreateCollection}
          onRefresh={refreshSchema}
          busy={busy}
        />

        <div className="min-w-0">
          {!selected ? (
            <div className="py-16 text-center">
              <EmptyState
                icon={<Database className="size-5" />}
                title="Create your first collection"
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button onClick={openCreateCollection} className="rounded-lg">
                      <Plus className="size-4" />
                      New collection
                    </Button>
                    <Button variant="outline" onClick={openBootstrap} disabled={busy} className="rounded-lg">
                      <Database className="size-4" />
                      Bootstrap database
                    </Button>
                    <Button variant="outline" onClick={bootstrap} disabled={busy} className="rounded-lg">
                      <FilePlus2 className="size-4" />
                      Use starter Posts
                    </Button>
                  </div>
                }
              />
            </div>
          ) : viewMode === "record-form" ? (
            /* RECORD FORM WORKING AREA (matching Image 1 - no giant card wrapper) */
            <div className="max-w-3xl space-y-6">
              {editableFields.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This collection has no editable columns.
                </p>
              ) : (
                <div className="space-y-6">
                  {editableFields.map((field) => (
                    <div key={field.name} className="grid gap-3">
                      <FieldLabel field={field} />
                      <FieldInput
                        field={field}
                        value={recordValues[field.name]}
                        onChange={(value) =>
                          setRecordValues((values) => ({
                            ...values,
                            [field.name]: value,
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between pt-6 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-lg"
                  onClick={() => setViewMode("table")}
                >
                  Cancel
                </Button>
                <div className="flex items-center gap-2">
                  {editingRecord ? (
                    <Button
                      type="button"
                      variant="destructive"
                      className="rounded-lg"
                      onClick={() => deleteRecord(editingRecord)}
                    >
                      <Trash2 className="size-4" />
                      Delete
                    </Button>
                  ) : null}
                  <BusyButton
                    type="button"
                    busy={recordSaving}
                    onClick={saveRecord}
                    disabled={editableFields.length === 0}
                    className="rounded-lg"
                  >
                    <Check className="size-4" />
                    {editingRecord ? "Save changes" : "Create item"}
                  </BusyButton>
                </div>
              </div>
            </div>
          ) : viewMode === "fields-layout" ? (
            /* FIELDS & LAYOUT CANVAS (matching Image 7) */
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-base font-semibold text-foreground">
                    Fields &amp; Layout
                  </h2>
                  <span className="text-xs font-medium text-warning">
                    Saves Automatically
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-lg"
                    onClick={openCreateField}
                  >
                    <Plus className="size-3.5" />
                    Add field
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-lg"
                    onClick={openEditCollection}
                  >
                    <Settings2 className="size-3.5" />
                    Table settings
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="rounded-lg"
                    onClick={() => setViewMode("table")}
                  >
                    <Check className="size-3.5" />
                    Done
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                {fields.map((field) => {
                  const isPk = field.name === selected.primary_key;
                  const isRel = field.type === "relation";
                  return (
                    <div
                      key={field.name}
                      className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-foreground/30"
                    >
                      <span className="cursor-grab text-muted-foreground">
                        <GripVertical className="size-4" strokeWidth={1.75} />
                      </span>
                      <div className="flex min-w-0 flex-1 items-center gap-2.5">
                        <span className="font-mono text-sm font-medium text-foreground">
                          {field.name}
                        </span>
                        <span className="rounded-md border border-border bg-surface-subtle px-2 py-0.5 text-xs text-muted-foreground">
                          {field.type}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {isPk ? (
                          <span title="Primary key" className="text-muted-foreground">
                            <Key className="size-4" strokeWidth={1.75} />
                          </span>
                        ) : null}
                        {field.hidden || field.readonly ? (
                          <span title="Hidden/Readonly" className="text-muted-foreground">
                            <EyeOff className="size-4" strokeWidth={1.75} />
                          </span>
                        ) : null}
                        {isRel ? (
                          <span title="Relation" className="text-muted-foreground">
                            <ExternalLink className="size-4" strokeWidth={1.75} />
                          </span>
                        ) : null}

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label="Edit field"
                          onClick={() => openEditField(field)}
                          disabled={isPk}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label="Delete field"
                          onClick={() => deleteField(field)}
                          disabled={isPk || field.readonly}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* TABLE & RECORD LISTING WORKING AREA (matching Image 5) */
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {total === 0
                      ? "0 Items"
                      : `${(page - 1) * 25 + 1}-${Math.min(page * 25, total)} of ${total} Items`}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <form onSubmit={submitSearch} className="relative min-w-[200px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchInput}
                      onChange={(event) => setSearchInput(event.target.value)}
                      placeholder={`Search ${selected.label || selected.name}…`}
                      className="h-9 pl-9 rounded-lg"
                    />
                  </form>
                  {search ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSearchInput("");
                        void refresh(selected.name, 1, "");
                      }}
                    >
                      <X className="size-3.5" />
                      Clear
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Refresh records"
                    onClick={() => refresh(selected.name, page, search)}
                  >
                    <RefreshCw className={cn("size-3.5", busy && "animate-spin")} />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-lg gap-1.5"
                    onClick={() => setViewMode("fields-layout")}
                  >
                    <Settings2 className="size-3.5" />
                    Fields
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="rounded-lg gap-1.5"
                    onClick={openCreateRecord}
                    disabled={editableFields.length === 0}
                  >
                    <Plus className="size-3.5" />
                    New item
                  </Button>
                </div>
              </div>

              <div className="flex gap-2">
                <div className="app-scrollbar flex-1 overflow-x-auto rounded-2xl border border-border">
                  <table className="w-full min-w-[640px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface-subtle text-left">
                        <th className="h-11 w-10 px-3 text-center">
                          <Checkbox
                            checked={
                              selectedRowIds.size > 0 &&
                              selectedRowIds.size === records.length
                            }
                            onCheckedChange={toggleSelectAll}
                            aria-label="Select all rows"
                          />
                        </th>
                        <th className="h-11 px-3 font-mono text-xs font-semibold text-muted-foreground">
                          {selected.primary_key}
                        </th>
                        {tableFields.map((field) => (
                          <th
                            key={field.name}
                            className="h-11 px-3 text-xs font-semibold text-muted-foreground"
                          >
                            {field.label || field.name}
                          </th>
                        ))}
                        <th className="h-11 w-10 px-3 text-center">
                          <button
                            type="button"
                            onClick={openCreateField}
                            title="Add column"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Plus className="size-3.5" />
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.length === 0 ? (
                        <tr>
                          <td
                            colSpan={tableFields.length + 3}
                            className="px-6 py-20 text-center"
                          >
                            <div className="flex flex-col items-center justify-center gap-2">
                              <span className="grid size-12 place-items-center rounded-full bg-surface-subtle text-muted-foreground border border-border">
                                <FilePlus2 className="size-5" strokeWidth={1.75} />
                              </span>
                              <p className="mt-2 text-sm font-semibold text-foreground">
                                {search ? "No matching records" : "No records yet"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {search
                                  ? "Try searching for a different keyword or clear your query."
                                  : `Add your first item to ${selected.label || selected.name}.`}
                              </p>
                              {search ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="mt-2 rounded-lg"
                                  onClick={() => {
                                    setSearchInput("");
                                    void refresh(selected.name, 1, "");
                                  }}
                                >
                                  Clear search
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={openCreateRecord}
                                  disabled={editableFields.length === 0}
                                  className="mt-2 rounded-lg"
                                >
                                  <Plus className="size-3.5" />
                                  Create record
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ) : (
                        records.map((record, index) => {
                          const rowId = String(record[selected.primary_key] ?? index);
                          const isSelected = selectedRowIds.has(rowId);
                          return (
                            <tr
                              key={rowId}
                              className={cn(
                                "border-b border-border transition-colors last:border-b-0 cursor-pointer hover:bg-surface-subtle",
                                isSelected && "bg-muted/70 hover:bg-muted"
                              )}
                              onClick={() => openEditRecord(record)}
                            >
                              <td
                                className="px-3 py-3 text-center"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleRowSelect(rowId);
                                }}
                              >
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleRowSelect(rowId)}
                                  aria-label={`Select row ${rowId}`}
                                />
                              </td>
                              <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                                {String(record[selected.primary_key] ?? "—")}
                              </td>
                              {tableFields.map((field) => {
                                const value = record[field.name];
                                return (
                                  <td
                                    key={field.name}
                                    className="max-w-[220px] px-3 py-3"
                                  >
                                    {field.type === "boolean" ? (
                                      <Badge variant={value ? "success" : "outline"}>
                                        {value ? "Yes" : "No"}
                                      </Badge>
                                    ) : field.type === "datetime" ? (
                                      <span className="text-muted-foreground">
                                        {format_datetime(value)}
                                      </span>
                                    ) : (
                                      <span className="line-clamp-2 break-words">
                                        {cell_value(value)}
                                      </span>
                                    )}
                                  </td>
                                );
                              })}
                              <td
                                className="px-3 py-3 text-right"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex justify-end gap-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    aria-label="Edit record"
                                    onClick={() => openEditRecord(record)}
                                  >
                                    <Pencil className="size-3.5" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    aria-label="Delete record"
                                    onClick={() => deleteRecord(record)}
                                  >
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Right-side utility strip (Image 5) */}
                <div className="hidden sm:flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface-subtle/80 p-2 text-muted-foreground self-start">
                  <button
                    type="button"
                    title="Table layout"
                    className="grid size-8 place-items-center rounded-lg hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <Table2 className="size-4" />
                  </button>
                  <button
                    type="button"
                    title="Filter"
                    className="grid size-8 place-items-center rounded-lg hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <Filter className="size-4" />
                  </button>
                  <button
                    type="button"
                    title="Sort"
                    className="grid size-8 place-items-center rounded-lg hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <ArrowUpDown className="size-4" />
                  </button>
                  <button
                    type="button"
                    title="Bookmarks"
                    className="grid size-8 place-items-center rounded-lg hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <Bookmark className="size-4" />
                  </button>
                </div>
              </div>

              {/* Table pagination */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  Page {page} of {pages} · {total} record{total === 1 ? "" : "s"}
                </span>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-lg"
                    disabled={page <= 1 || busy}
                    onClick={() => refresh(selected.name, page - 1, search)}
                  >
                    <ChevronLeft className="size-4" />
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-lg"
                    disabled={page >= pages || busy}
                    onClick={() => refresh(selected.name, page + 1, search)}
                  >
                    Next
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SLIDE-OVER NEW COLLECTION DRAWER (Image 6) */}
      <Dialog open={collectionDrawerOpen} onOpenChange={setCollectionDrawerOpen}>
        <DialogContent
          aria-describedby={undefined}
          className="max-h-[92vh] max-w-3xl overflow-y-auto rounded-2xl p-0 gap-0"
        >
          <div className="grid sm:grid-cols-[180px_1fr] min-h-[460px]">
            {/* Left step rail */}
            <div className="border-r border-border bg-surface-subtle p-4 space-y-1">
              <button
                type="button"
                onClick={() => setCollectionDrawerTab("setup")}
                className={cn(
                  "w-full rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors",
                  collectionDrawerTab === "setup"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                Collection Setup
              </button>
              <button
                type="button"
                onClick={() => setCollectionDrawerTab("optional")}
                className={cn(
                  "w-full rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors",
                  collectionDrawerTab === "optional"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                Optional Fields
              </button>
            </div>

            {/* Right content area */}
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-9 place-items-center rounded-lg border border-border bg-surface-subtle text-foreground">
                    <Box className="size-4" />
                  </span>
                  <DialogTitle className="text-base font-semibold">
                    {collectionMode === "create"
                      ? "Creating New Collection"
                      : "Collection Settings"}
                  </DialogTitle>
                </div>
              </div>

              {/* Callout Info Banner */}
              <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-subtle p-3 text-xs text-muted-foreground">
                <Info className="size-4 shrink-0 text-foreground" />
                <span>Name the collection and setup its unique &quot;key&quot; field...</span>
              </div>

              {collectionDrawerTab === "setup" ? (
                <div className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-3">
                      <Label htmlFor="col-name" className="text-sm font-semibold">
                        Name *
                      </Label>
                      <Input
                        id="col-name"
                        value={collectionForm.name}
                        disabled={collectionMode === "edit"}
                        placeholder="A unique table name..."
                        className="h-11 font-mono rounded-xl bg-card border-input"
                        onChange={(event) =>
                          setCollectionForm((form) => ({
                            ...form,
                            name: slugify(event.target.value),
                            label:
                              form.label ||
                              event.target.value
                                .replace(/[_-]+/g, " ")
                                .replace(/\b\w/g, (l) => l.toUpperCase()),
                          }))
                        }
                      />
                      <p className="text-xs text-muted-foreground italic">
                        Collection names are case sensitive
                      </p>
                    </div>

                    <div className="grid gap-3">
                      <Label className="text-sm font-semibold">Singleton</Label>
                      <label className="flex h-11 items-center gap-3 rounded-xl border border-input bg-card px-4 text-sm cursor-pointer transition-colors hover:border-foreground/30">
                        <Checkbox
                          checked={collectionForm.singleton}
                          onCheckedChange={(checked) =>
                            setCollectionForm((form) => ({
                              ...form,
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
                          value={collectionForm.primaryKey}
                          disabled={collectionMode === "edit"}
                          placeholder="id"
                          className="h-11 font-mono rounded-xl bg-card border-input"
                          onChange={(event) =>
                            setCollectionForm((form) => ({
                              ...form,
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
                            disabled={collectionMode === "edit"}
                            value={collectionForm.primaryKeyType}
                            onChange={(e) =>
                              setCollectionForm((form) => ({
                                ...form,
                                primaryKeyType: e.target.value,
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

                  <div className="grid gap-3">
                    <Label htmlFor="col-label" className="text-sm font-semibold">
                      Display Label
                    </Label>
                    <Input
                      id="col-label"
                      value={collectionForm.label}
                      placeholder="e.g. Products"
                      className="h-11 rounded-xl bg-card border-input"
                      onChange={(event) =>
                        setCollectionForm((form) => ({
                          ...form,
                          label: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              ) : (
                /* OPTIONAL FIELDS TAB */
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
                        setCollectionForm((form) => ({
                          ...form,
                          fields: [
                            ...form.fields,
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
                    {collectionForm.fields.map((field, index) => (
                      <div
                        key={index}
                        className="grid gap-2 sm:grid-cols-[1fr_1fr_130px_auto]"
                      >
                        <Input
                          value={field.name}
                          placeholder="column_name"
                          className="h-10 rounded-lg bg-card border-input"
                          onChange={(e) =>
                            setCollectionForm((form) => ({
                              ...form,
                              fields: form.fields.map((item, itemIdx) =>
                                itemIdx === index
                                  ? { ...item, name: slugify(e.target.value) }
                                  : item
                              ),
                            }))
                          }
                        />
                        <Input
                          value={field.label}
                          placeholder="Label"
                          className="h-10 rounded-lg bg-card border-input"
                          onChange={(e) =>
                            setCollectionForm((form) => ({
                              ...form,
                              fields: form.fields.map((item, itemIdx) =>
                                itemIdx === index
                                  ? { ...item, label: e.target.value }
                                  : item
                              ),
                            }))
                          }
                        />
                        <select
                          value={field.type}
                          onChange={(e) =>
                            setCollectionForm((form) => ({
                              ...form,
                              fields: form.fields.map((item, itemIdx) =>
                                itemIdx === index
                                  ? { ...item, type: e.target.value as CmsFieldType }
                                  : item
                              ),
                            }))
                          }
                          className="h-10 rounded-lg border border-input bg-card px-2 text-sm text-foreground outline-none"
                        >
                          {FIELD_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() =>
                            setCollectionForm((form) => ({
                              ...form,
                              fields: form.fields.filter((_, i) => i !== index),
                            }))
                          }
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Drawer footer */}
              <div className="flex items-center justify-between pt-4 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-lg"
                  onClick={() => setCollectionDrawerOpen(false)}
                >
                  Cancel
                </Button>
                <div className="flex items-center gap-2">
                  {collectionDrawerTab === "setup" ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-lg"
                      onClick={() => setCollectionDrawerTab("optional")}
                    >
                      Next: Fields
                      <ChevronRight className="size-4" />
                    </Button>
                  ) : null}
                  <BusyButton
                    type="button"
                    busy={collectionSaving}
                    onClick={saveCollection}
                    disabled={!collectionForm.name}
                    className="rounded-lg"
                  >
                    {collectionMode === "create" ? "Create collection" : "Save settings"}
                  </BusyButton>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* FIELD CREATE / EDIT DIALOG */}
      <Dialog open={fieldOpen} onOpenChange={setFieldOpen}>
        <DialogContent aria-describedby={undefined} className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              {editingField ? "Edit field" : "Add field"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-3">
                <Label htmlFor="field-name" className="text-sm font-semibold">
                  Column name
                </Label>
                <Input
                  id="field-name"
                  value={fieldForm.name}
                  disabled={editingField !== null}
                  placeholder="e.g. published_at"
                  className="h-10 rounded-lg bg-card border-input font-mono text-sm"
                  onChange={(event) =>
                    setFieldForm((form) => ({ ...form, name: slugify(event.target.value) }))
                  }
                />
              </div>
              <div className="grid gap-3">
                <Label htmlFor="field-label" className="text-sm font-semibold">
                  Label
                </Label>
                <Input
                  id="field-label"
                  value={fieldForm.label}
                  placeholder="Published at"
                  className="h-10 rounded-lg bg-card border-input"
                  onChange={(event) =>
                    setFieldForm((form) => ({ ...form, label: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-3">
              <Label htmlFor="field-type" className="text-sm font-semibold">
                Type
              </Label>
              <div className="relative">
                <select
                  id="field-type"
                  value={fieldForm.type}
                  onChange={(event) =>
                    setFieldForm((form) => ({
                      ...form,
                      type: event.target.value as CmsFieldType,
                    }))
                  }
                  className="h-10 w-full appearance-none rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none"
                >
                  {FIELD_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              </div>
            </div>

            {fieldForm.type === "select" ? (
              <div className="grid gap-3">
                <Label htmlFor="field-choices" className="text-sm font-semibold">
                  Choices (comma separated)
                </Label>
                <Input
                  id="field-choices"
                  value={fieldForm.choices}
                  placeholder="draft, published, archived"
                  className="h-10 rounded-lg bg-card border-input"
                  onChange={(event) =>
                    setFieldForm((form) => ({ ...form, choices: event.target.value }))
                  }
                />
              </div>
            ) : null}

            <div className="flex flex-wrap gap-4 pt-2 text-sm">
              <label className="flex items-center gap-2 cursor-pointer font-medium">
                <Checkbox
                  checked={fieldForm.required}
                  onCheckedChange={(checked) =>
                    setFieldForm((form) => ({ ...form, required: checked === true }))
                  }
                />
                Required
              </label>
              <label className="flex items-center gap-2 cursor-pointer font-medium">
                <Checkbox
                  checked={fieldForm.unique}
                  onCheckedChange={(checked) =>
                    setFieldForm((form) => ({ ...form, unique: checked === true }))
                  }
                />
                Unique
              </label>
              <label className="flex items-center gap-2 cursor-pointer font-medium">
                <Checkbox
                  checked={fieldForm.hidden}
                  onCheckedChange={(checked) =>
                    setFieldForm((form) => ({ ...form, hidden: checked === true }))
                  }
                />
                Hidden
              </label>
              <label className="flex items-center gap-2 cursor-pointer font-medium">
                <Checkbox
                  checked={fieldForm.readonly}
                  onCheckedChange={(checked) =>
                    setFieldForm((form) => ({ ...form, readonly: checked === true }))
                  }
                />
                Read only
              </label>
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              className="rounded-lg"
              onClick={() => setFieldOpen(false)}
            >
              Cancel
            </Button>
            <BusyButton
              type="button"
              busy={fieldSaving}
              onClick={saveField}
              disabled={!fieldForm.name}
              className="rounded-lg"
            >
              {editingField ? "Save field" : "Add field"}
            </BusyButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* BOOTSTRAP DATABASE DIALOG */}
      <Dialog open={bootstrapOpen} onOpenChange={setBootstrapOpen}>
        <DialogContent aria-describedby={undefined} className="rounded-2xl sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              Bootstrap Database
            </DialogTitle>
          </DialogHeader>

          {bootstrapLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : bootstrapReport ? (
            <div className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">
                Introspects existing SQLite tables into native CMS collections.
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-border bg-surface-subtle p-3 text-center">
                  <p className="text-xs text-muted-foreground">Ready</p>
                  <p className="text-lg font-semibold tabular-nums text-foreground">
                    {bootstrapReport.summary.ready}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-surface-subtle p-3 text-center">
                  <p className="text-xs text-muted-foreground">Changes</p>
                  <p className="text-lg font-semibold tabular-nums text-foreground">
                    {bootstrapReport.summary.new + bootstrapReport.summary.update}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-surface-subtle p-3 text-center">
                  <p className="text-xs text-muted-foreground">Skipped</p>
                  <p className="text-lg font-semibold tabular-nums text-foreground">
                    {bootstrapReport.summary.skipped}
                  </p>
                </div>
              </div>

              {bootstrapReport.tables.length > 0 ? (
                <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-border p-2">
                  {bootstrapReport.tables.map((table) => (
                    <div
                      key={table.name}
                      className="flex items-center justify-between rounded px-2 py-1 text-xs"
                    >
                      <span className="font-mono font-medium text-foreground">
                        {table.name}
                      </span>
                      <span className="text-muted-foreground">
                        {table.field_count} columns · PK: {table.primary_key ?? "—"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="pt-4">
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
              disabled={bootstrapLoading || !bootstrapReport || bootstrapReport.tables.length === 0}
              onClick={applyBootstrap}
              className="rounded-lg"
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
