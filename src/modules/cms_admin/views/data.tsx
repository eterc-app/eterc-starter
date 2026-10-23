"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  Braces,
  ChevronLeft,
  ChevronRight,
  Database,
  FilePlus2,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { EtViewProps } from "@/engine/views-registry";
import type {
  CmsCollectionWithFields,
  CmsField,
  CmsFieldType,
} from "@/modules/cms/cms-types";
import {
  BusyButton,
  CopyButton,
  EmptyState,
  FieldInput,
  FieldLabel,
  PageHeader,
  cms_call,
  format_datetime,
} from "./ui";

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

  const [collectionOpen, setCollectionOpen] = useState(false);
  const [collectionMode, setCollectionMode] = useState<"create" | "edit">("create");
  const [collectionForm, setCollectionForm] = useState<CollectionForm>(emptyCollectionForm());
  const [collectionSaving, setCollectionSaving] = useState(false);

  const [fieldOpen, setFieldOpen] = useState(false);
  const [editingField, setEditingField] = useState<CmsField | null>(null);
  const [fieldForm, setFieldForm] = useState<FieldForm>(emptyFieldForm());
  const [fieldSaving, setFieldSaving] = useState(false);

  const [recordOpen, setRecordOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<Record<string, unknown> | null>(null);
  const [recordValues, setRecordValues] = useState<Record<string, unknown>>({});
  const [recordSaving, setRecordSaving] = useState(false);

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
      await refresh(name, 1, "");
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
    setCollectionForm(emptyCollectionForm());
    setCollectionOpen(true);
  }, []);

  const openEditCollection = useCallback(() => {
    if (!selected) return;
    setCollectionMode("edit");
    setCollectionForm({
      name: selected.name,
      label: selected.label,
      icon: selected.icon,
      note: selected.note,
      singleton: selected.singleton,
      hidden: selected.hidden,
      fields: [],
    });
    setCollectionOpen(true);
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
        setCollectionOpen(false);
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
        setCollectionOpen(false);
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
    if (
      !window.confirm(
        `Delete the collection '${selected.label || selected.name}' and all of its records? This cannot be undone.`
      )
    ) {
      return;
    }
    try {
      await cms_call("data_collection_delete", { name: selected.name });
      toast.success("Collection deleted.");
      setCollectionOpen(false);
      await refresh(undefined, 1, "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the collection.");
    }
  }, [refresh, selected]);

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
      const options: Record<string, unknown> = {};
      if (fieldForm.choices.trim()) {
        options.choices = fieldForm.choices
          .split(",")
          .map((choice) => choice.trim())
          .filter(Boolean);
      }
      if (fieldForm.defaultValue.trim()) options.default = fieldForm.defaultValue.trim();
      if (editingField) {
        await cms_call("data_field_update", {
          collection: selected.name,
          field: editingField.name,
          label: fieldForm.label,
          type: fieldForm.type,
          required: fieldForm.required,
          unique: fieldForm.unique,
          hidden: fieldForm.hidden,
          readonly: fieldForm.readonly,
          options,
        });
        toast.success("Field updated.");
      } else {
        await cms_call("data_field_create", {
          collection: selected.name,
          name: fieldForm.name,
          label: fieldForm.label || fieldForm.name,
          type: fieldForm.type,
          required: fieldForm.required,
          unique: fieldForm.unique,
          hidden: fieldForm.hidden,
          readonly: fieldForm.readonly,
          options,
        });
        toast.success("Field added.");
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
      if (!window.confirm(`Remove the field '${field.label || field.name}' from this collection?`)) {
        return;
      }
      try {
        await cms_call("data_field_delete", {
          collection: selected.name,
          field: field.name,
        });
        toast.success("Field removed.");
        await refresh(selected.name, page, search);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not remove the field.");
      }
    },
    [page, refresh, search, selected]
  );

  const openCreateRecord = useCallback(() => {
    setEditingRecord(null);
    setRecordValues(record_defaults(fields));
    setRecordOpen(true);
  }, [fields]);

  const openEditRecord = useCallback(
    (record: Record<string, unknown>) => {
      setEditingRecord(record);
      setRecordValues({ ...record });
      setRecordOpen(true);
    },
    []
  );

  const saveRecord = useCallback(async () => {
    if (!selected) return;
    setRecordSaving(true);
    try {
      const values: Record<string, unknown> = {};
      for (const field of fields) {
        if (field.readonly || field.hidden || field.name === "id") continue;
        if (field.name === "created_at" || field.name === "updated_at") continue;
        const value = recordValues[field.name];
        if (value !== undefined) values[field.name] = value;
      }
      if (editingRecord) {
        await cms_call("data_record_update", {
          collection: selected.name,
          id: editingRecord.id,
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
      setRecordOpen(false);
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
      if (!window.confirm("Delete this record? This cannot be undone.")) return;
      try {
        await cms_call("data_record_delete", {
          collection: selected.name,
          id: record.id,
        });
        toast.success("Record deleted.");
        await refresh(selected.name, page, search);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not delete the record.");
      }
    },
    [page, refresh, search, selected]
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

  const visibleFields = useMemo(
    () => fields.filter((field) => !field.hidden),
    [fields]
  );
  const tableFields = useMemo(() => visibleFields.slice(0, 8), [visibleFields]);
  const editableFields = useMemo(
    () =>
      fields.filter(
        (field) =>
          !field.hidden &&
          !field.readonly &&
          field.name !== "id" &&
          field.name !== "created_at" &&
          field.name !== "updated_at"
      ),
    [fields]
  );
  const endpoint = selected
    ? `/api/v1/cms/items/${selected.name}`
    : "/api/v1/cms/items/{collection}";

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 p-4 sm:p-6">
      <PageHeader
        eyebrow="Content service"
        title="Data Studio"
        description="Create collections, edit records and shape the API payloads your app consumes."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/api-reference" target="_blank">
                <Braces className="size-4" />
                API reference
              </Link>
            </Button>
            <Button onClick={openCreateCollection}>
              <Plus className="size-4" />
              New collection
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Collections</CardTitle>
            <CardDescription>{collections.length} available</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 p-2">
            {collections.length === 0 ? (
              <p className="px-2 py-4 text-xs text-muted-foreground">No collections yet.</p>
            ) : (
              collections.map((collection) => {
                const active = collection.name === selected?.name;
                return (
                  <button
                    key={collection.name}
                    type="button"
                    onClick={() => selectCollection(collection.name)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors ${
                      active
                        ? "bg-muted font-medium text-foreground"
                        : "text-foreground/80 hover:bg-muted/50"
                    }`}
                  >
                    <Table2 className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">
                      {collection.label || collection.name}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {collection.item_count}
                    </span>
                  </button>
                );
              })
            )}
            <div className="mt-2 border-t pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={refreshSchema}
                disabled={busy}
              >
                <RefreshCw className={`size-3.5 ${busy ? "animate-spin" : ""}`} />
                Refresh schema
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="min-w-0">
          {!selected ? (
            <Card>
              <CardContent className="pt-6">
                <EmptyState
                  icon={<Database className="size-5" />}
                  title="Create your first collection"
                  description="A collection is a database table with labels, field metadata and permissions. You can also start with a Posts collection and edit it."
                  action={
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button onClick={openCreateCollection}>
                        <Plus className="size-4" />
                        New collection
                      </Button>
                      <Button variant="outline" onClick={bootstrap} disabled={busy}>
                        <FilePlus2 className="size-4" />
                        Use starter Posts
                      </Button>
                    </div>
                  }
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="gap-3 border-b">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle>{selected.label || selected.name}</CardTitle>
                      <Badge variant="secondary">{total} records</Badge>
                      {selected.system ? <Badge variant="outline">System</Badge> : null}
                    </div>
                    <CardDescription className="mt-1">
                      {selected.note || `Table ${selected.name}`}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={openEditCollection}>
                      <Settings2 className="size-3.5" />
                      Collection settings
                    </Button>
                    <Button size="sm" onClick={openCreateRecord} disabled={editableFields.length === 0}>
                      <Plus className="size-3.5" />
                      New record
                    </Button>
                  </div>
                </div>
                <div className="flex flex-col gap-2 rounded-lg bg-muted/40 p-2 sm:flex-row sm:items-center">
                  <code className="min-w-0 flex-1 truncate px-1 font-mono text-[11px] text-muted-foreground">
                    GET {endpoint}
                  </code>
                  <CopyButton value={endpoint} label="Copy endpoint" />
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                <form onSubmit={submitSearch} className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[200px] flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchInput}
                      onChange={(event) => setSearchInput(event.target.value)}
                      placeholder={`Search ${selected.label || selected.name}…`}
                      className="pl-8"
                    />
                  </div>
                  <Button type="submit" variant="outline" disabled={busy}>
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                    Search
                  </Button>
                  {search ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setSearchInput("");
                        void refresh(selected.name, 1, "");
                      }}
                    >
                      <X className="size-4" />
                      Clear
                    </Button>
                  ) : null}
                  <Button type="button" variant="ghost" onClick={() => refresh(selected.name, page, search)}>
                    <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </form>

                {records.length === 0 ? (
                  <EmptyState
                    icon={<FilePlus2 className="size-5" />}
                    title={search ? "No matching records" : "No records yet"}
                    description={
                      search
                        ? "Try a different search term or clear the filter."
                        : "Create the first record for this collection. It will be available through the content API immediately."
                    }
                    action={
                      search ? (
                        <Button variant="outline" onClick={() => refresh(selected.name, 1, "")}>
                          Clear search
                        </Button>
                      ) : (
                        <Button onClick={openCreateRecord}>
                          <Plus className="size-4" />
                          New record
                        </Button>
                      )
                    }
                  />
                ) : (
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full min-w-[640px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40 text-left">
                          <th className="px-3 py-2 font-medium text-muted-foreground">ID</th>
                          {tableFields.map((field) => (
                            <th
                              key={field.name}
                              className="px-3 py-2 font-medium text-muted-foreground"
                            >
                              {field.label || field.name}
                            </th>
                          ))}
                          <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {records.map((record, index) => (
                          <tr
                            key={String(record.id ?? index)}
                            className="border-b last:border-b-0 hover:bg-muted/20"
                          >
                            <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                              {String(record.id ?? "—")}
                            </td>
                            {tableFields.map((field) => {
                              const value = record[field.name];
                              return (
                                <td key={field.name} className="max-w-[220px] px-3 py-2">
                                  {field.type === "boolean" ? (
                                    <Badge variant={value ? "default" : "secondary"}>
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
                            <td className="px-3 py-2">
                              <div className="flex justify-end gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label="Edit record"
                                  onClick={() => openEditRecord(record)}
                                >
                                  <Pencil className="size-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label="Delete record"
                                  onClick={() => deleteRecord(record)}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    Page {page} of {pages} · {total} record{total === 1 ? "" : "s"}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
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
                      disabled={page >= pages || busy}
                      onClick={() => refresh(selected.name, page + 1, search)}
                    >
                      Next
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={collectionOpen} onOpenChange={setCollectionOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {collectionMode === "create" ? "New collection" : "Collection settings"}
            </DialogTitle>
            <DialogDescription>
              {collectionMode === "create"
                ? "Collections become SQLite tables and immediately get REST endpoints under /api/v1/cms/items."
                : "Change labels and behavior. Field changes are applied to the underlying table."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="collection-name">Table name</Label>
                <Input
                  id="collection-name"
                  value={collectionForm.name}
                  disabled={collectionMode === "edit"}
                  placeholder="posts"
                  onChange={(event) =>
                    setCollectionForm((form) => ({
                      ...form,
                      name: slugify(event.target.value),
                      label:
                        form.label ||
                        event.target.value
                          .replace(/[_-]+/g, " ")
                          .replace(/\b\w/g, (letter) => letter.toUpperCase()),
                    }))
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  Letters, numbers and underscores. Cannot be changed later.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="collection-label">Label</Label>
                <Input
                  id="collection-label"
                  value={collectionForm.label}
                  placeholder="Posts"
                  onChange={(event) =>
                    setCollectionForm((form) => ({ ...form, label: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="collection-note">Description</Label>
              <Textarea
                id="collection-note"
                value={collectionForm.note}
                rows={2}
                placeholder="What is this collection for?"
                onChange={(event) =>
                  setCollectionForm((form) => ({ ...form, note: event.target.value }))
                }
              />
            </div>

            <div className="flex flex-wrap gap-5">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={collectionForm.singleton}
                  onCheckedChange={(checked) =>
                    setCollectionForm((form) => ({ ...form, singleton: checked === true }))
                  }
                />
                Singleton
              </label>
              {collectionMode === "edit" ? (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={collectionForm.hidden}
                    onCheckedChange={(checked) =>
                      setCollectionForm((form) => ({ ...form, hidden: checked === true }))
                    }
                  />
                  Hide from navigation
                </label>
              ) : null}
            </div>

            {collectionMode === "create" ? (
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Fields</p>
                    <p className="text-xs text-muted-foreground">
                      The ID, created_at and updated_at fields are added automatically.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
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
                {collectionForm.fields.map((field, index) => (
                  <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_150px_auto_auto]">
                    <Input
                      value={field.name}
                      placeholder="field_name"
                      onChange={(event) =>
                        setCollectionForm((form) => ({
                          ...form,
                          fields: form.fields.map((item, itemIndex) =>
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
                      onChange={(event) =>
                        setCollectionForm((form) => ({
                          ...form,
                          fields: form.fields.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, label: event.target.value } : item
                          ),
                        }))
                      }
                    />
                    <Select
                      value={field.type}
                      onValueChange={(value) =>
                        setCollectionForm((form) => ({
                          ...form,
                          fields: form.fields.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, type: value as CmsFieldType }
                              : item
                          ),
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FIELD_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Checkbox
                        checked={field.required}
                        onCheckedChange={(checked) =>
                          setCollectionForm((form) => ({
                            ...form,
                            fields: form.fields.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, required: checked === true }
                                : item
                            ),
                          }))
                        }
                      />
                      Required
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove field"
                      onClick={() =>
                        setCollectionForm((form) => ({
                          ...form,
                          fields: form.fields.filter((_, itemIndex) => itemIndex !== index),
                        }))
                      }
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Fields</p>
                    <p className="text-xs text-muted-foreground">
                      Add or remove columns. Existing data is preserved when possible.
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={openCreateField}>
                    <Plus className="size-3.5" />
                    Add field
                  </Button>
                </div>
                <div className="space-y-1">
                  {fields.map((field) => (
                    <div
                      key={field.name}
                      className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {field.label || field.name}
                        </span>
                        <span className="block truncate font-mono text-[10px] text-muted-foreground">
                          {field.name} · {field.type}
                        </span>
                      </span>
                      {field.readonly ? <Badge variant="secondary">Read only</Badge> : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Edit field"
                        onClick={() => openEditField(field)}
                        disabled={field.name === "id"}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Delete field"
                        onClick={() => deleteField(field)}
                        disabled={field.name === "id" || field.readonly}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex-wrap justify-between gap-2 sm:justify-between">
            {collectionMode === "edit" ? (
              <Button type="button" variant="destructive" onClick={deleteCollection}>
                <Trash2 className="size-4" />
                Delete collection
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setCollectionOpen(false)}>
                Cancel
              </Button>
              <BusyButton
                type="button"
                busy={collectionSaving}
                onClick={saveCollection}
                disabled={!collectionForm.name}
              >
                {collectionMode === "create" ? "Create collection" : "Save settings"}
              </BusyButton>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={fieldOpen} onOpenChange={setFieldOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingField ? "Edit field" : "Add field"}</DialogTitle>
            <DialogDescription>
              Field metadata controls the editor and the API documentation. The database column is
              created immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="field-name">Column name</Label>
                <Input
                  id="field-name"
                  value={fieldForm.name}
                  disabled={editingField !== null}
                  placeholder="published_at"
                  onChange={(event) =>
                    setFieldForm((form) => ({ ...form, name: slugify(event.target.value) }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="field-label">Label</Label>
                <Input
                  id="field-label"
                  value={fieldForm.label}
                  placeholder="Published at"
                  onChange={(event) =>
                    setFieldForm((form) => ({ ...form, label: event.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={fieldForm.type}
                onValueChange={(value) =>
                  setFieldForm((form) => ({ ...form, type: value as CmsFieldType }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {fieldForm.type === "select" ? (
              <div className="space-y-1.5">
                <Label htmlFor="field-choices">Choices</Label>
                <Input
                  id="field-choices"
                  value={fieldForm.choices}
                  placeholder="draft, published, archived"
                  onChange={(event) =>
                    setFieldForm((form) => ({ ...form, choices: event.target.value }))
                  }
                />
                <p className="text-[11px] text-muted-foreground">Comma separated.</p>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="field-default">Default value</Label>
              <Input
                id="field-default"
                value={fieldForm.defaultValue}
                placeholder="Optional"
                onChange={(event) =>
                  setFieldForm((form) => ({ ...form, defaultValue: event.target.value }))
                }
              />
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={fieldForm.required}
                  onCheckedChange={(checked) =>
                    setFieldForm((form) => ({ ...form, required: checked === true }))
                  }
                />
                Required
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={fieldForm.unique}
                  onCheckedChange={(checked) =>
                    setFieldForm((form) => ({ ...form, unique: checked === true }))
                  }
                />
                Unique
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={fieldForm.hidden}
                  onCheckedChange={(checked) =>
                    setFieldForm((form) => ({ ...form, hidden: checked === true }))
                  }
                />
                Hidden
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={fieldForm.readonly}
                  onCheckedChange={(checked) =>
                    setFieldForm((form) => ({ ...form, readonly: checked === true }))
                  }
                />
                Read only
              </label>
            </div>
            {editingField ? (
              <p className="rounded-md bg-muted/50 p-2 text-[11px] text-muted-foreground">
                Changing the type updates metadata only. SQLite keeps the existing column affinity;
                new values are validated by the CMS layer.
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setFieldOpen(false)}>
              Cancel
            </Button>
            <BusyButton
              type="button"
              busy={fieldSaving}
              onClick={saveField}
              disabled={!fieldForm.name}
            >
              {editingField ? "Save field" : "Add field"}
            </BusyButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={recordOpen} onOpenChange={setRecordOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingRecord ? "Edit record" : "New record"}</DialogTitle>
            <DialogDescription>
              {selected ? `Collection: ${selected.label || selected.name}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {editableFields.length === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                This collection has no editable fields. Add a field from Collection settings.
              </p>
            ) : (
              editableFields.map((field) => (
                <div key={field.name} className="space-y-1.5">
                  <FieldLabel field={field} />
                  <FieldInput
                    field={field}
                    value={recordValues[field.name]}
                    onChange={(value) =>
                      setRecordValues((values) => ({ ...values, [field.name]: value }))
                    }
                  />
                  {field.options.help ? (
                    <p className="text-[11px] text-muted-foreground">
                      {String(field.options.help)}
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRecordOpen(false)}>
              Cancel
            </Button>
            <BusyButton
              type="button"
              busy={recordSaving}
              onClick={saveRecord}
              disabled={editableFields.length === 0}
            >
              {editingRecord ? "Save record" : "Create record"}
            </BusyButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
