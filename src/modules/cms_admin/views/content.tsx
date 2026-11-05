"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Database,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Search,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageActions } from "@/components/app/PageActions";
import { PageActionsPortal, useSetNavbarMeta } from "@/components/app/PageActionsSlot";
import { useConfirm } from "@/components/app/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { EtViewProps } from "@/engine/views-registry";
import { cn } from "@/lib/utils";
import type {
  CmsCollectionWithFields,
  CmsField,
} from "@/modules/cms/cms-types";
import { ContentSidebar } from "./ContentSidebar";
import {
  BusyButton,
  EmptyState,
  FieldInput,
  FieldLabel,
  cms_call,
} from "./ui";

interface Snapshot {
  collections?: CmsCollectionWithFields[];
  selected?: CmsCollectionWithFields | null;
  fields?: CmsField[];
  records?: Record<string, unknown>[];
  total?: number;
  page?: number;
  pages?: number;
  limit?: number;
  search?: string;
  csrf_token?: string;
  media_upload_url?: string;
  media_api_root?: string;
}

function cell_value(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function format_datetime(value: unknown): string {
  if (!value) return "—";
  try {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
  } catch {
    return String(value);
  }
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

function ExpandableSearch({
  value,
  onChange,
  onSubmit,
  onClear,
  placeholder,
}: {
  value: string;
  onChange: (val: string) => void;
  onSubmit: (e?: React.FormEvent) => void;
  onClear: () => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(Boolean(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title="Search"
        aria-label="Search"
        onClick={() => setOpen(true)}
      >
        <Search className="size-3.5" strokeWidth={1.75} />
      </Button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(e);
      }}
      className="relative flex items-center"
    >
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            if (!value) {
              setOpen(false);
            } else {
              onClear();
            }
          }
        }}
        placeholder={placeholder}
        className="h-8 w-44 sm:w-60 pl-8 pr-7 rounded-full bg-surface-subtle border-border text-xs"
      />
      <button
        type="button"
        onClick={() => {
          if (value) onClear();
          setOpen(false);
        }}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        aria-label="Close search"
      >
        <X className="size-3" />
      </button>
    </form>
  );
}

export default function ContentManager({ data }: EtViewProps) {
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

  // Mode: "table" for record listing, "record-form" for editing/creating a single record
  const [viewMode, setViewMode] = useState<"table" | "record-form">("table");
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  // Record Form state
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
        toast.error(error instanceof Error ? error.message : "Could not load content.");
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

  const deleteSelected = useCallback(async () => {
    if (!selected || selectedRowIds.size === 0) return;
    const confirmed = await confirm({
      title: `Delete ${selectedRowIds.size} record${selectedRowIds.size === 1 ? "" : "s"}?`,
      description: "The selected records will be permanently removed from the database.",
      confirmLabel: `Delete ${selectedRowIds.size} record${selectedRowIds.size === 1 ? "" : "s"}`,
    });
    if (!confirmed) return;
    try {
      for (const id of Array.from(selectedRowIds)) {
        await cms_call("data_record_delete", { collection: selected.name, id });
      }
      toast.success(`Deleted ${selectedRowIds.size} record${selectedRowIds.size === 1 ? "" : "s"}.`);
      setSelectedRowIds(new Set());
      await refresh(selected.name, 1, search);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete records.");
    }
  }, [confirm, refresh, search, selected, selectedRowIds]);

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

  const clearSearch = useCallback(() => {
    setSearchInput("");
    void refresh(selected?.name, 1, "");
  }, [refresh, selected?.name]);

  const navbarMeta = useMemo(() => {
    const searchControl = selected ? (
      <ExpandableSearch
        value={searchInput}
        onChange={setSearchInput}
        onSubmit={submitSearch}
        onClear={clearSearch}
        placeholder={`Search ${selected.label || selected.name}...`}
      />
    ) : null;

    if (!selected) {
      return {
        section: "Content",
        title: "Content",
        icon: <Layers className="size-4" strokeWidth={1.75} />,
      };
    }
    if (viewMode === "record-form") {
      return {
        section: selected.label || selected.name,
        title: editingRecord
          ? `Editing record in ${selected.label || selected.name}`
          : `New record in ${selected.label || selected.name}`,
        onBack: () => setViewMode("table"),
      };
    }
    return {
      section: "Content",
      title: selected.label || selected.name,
      search: searchControl,
    };
  }, [clearSearch, editingRecord, searchInput, selected, submitSearch, viewMode]);

  useSetNavbarMeta(navbarMeta);

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
        {viewMode === "record-form" ? (
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="rounded-full"
              title="Cancel"
              aria-label="Cancel"
              onClick={() => setViewMode("table")}
            >
              <ArrowLeft className="size-4" />
            </Button>
            {editingRecord ? (
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="rounded-full"
                title="Delete record"
                aria-label="Delete record"
                onClick={() => deleteRecord(editingRecord)}
              >
                <Trash2 className="size-4" />
              </Button>
            ) : null}
            <Button
              type="button"
              variant="default"
              size="icon"
              className="rounded-full"
              title={recordSaving ? "Saving..." : "Save record"}
              aria-label={recordSaving ? "Saving..." : "Save record"}
              disabled={recordSaving}
              onClick={saveRecord}
            >
              {recordSaving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" strokeWidth={2.5} />
              )}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="rounded-full"
              title="Refresh"
              aria-label="Refresh"
              disabled={busy}
              onClick={() => refresh(selected?.name, page, search)}
            >
              <RefreshCw className={cn("size-4", busy && "animate-spin")} />
            </Button>
            {selected && editableFields.length > 0 ? (
              <Button
                type="button"
                variant="default"
                size="icon"
                className="rounded-full"
                title="New record"
                aria-label="New record"
                onClick={openCreateRecord}
              >
                <Plus className="size-4" />
              </Button>
            ) : null}
          </div>
        )}
      </PageActionsPortal>

      <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        {/* Content Sidebar */}
        <ContentSidebar
          collections={collections}
          activeName={selected?.name}
          onSelect={selectCollection}
          busy={busy}
        />

        <div className="min-w-0">
          {!selected ? (
            <div className="py-16 text-center">
              <EmptyState
                icon={<Layers className="size-5" />}
                title={collections.length === 0 ? "No collections yet" : "Select a collection"}
                description={
                  collections.length === 0
                    ? "Collections are created in Data Studio. Create a collection first to begin adding content."
                    : "Choose a collection from the sidebar to view and add records."
                }
                action={
                  <Button asChild className="rounded-lg">
                    <Link href="/admin/data">
                      <Database className="size-4" />
                      Open Data Studio
                    </Link>
                  </Button>
                }
              />
            </div>
          ) : viewMode === "record-form" ? (
            /* RECORD FORM WORKING AREA */
            <div className="max-w-3xl space-y-6">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-lg"
                    onClick={() => setViewMode("table")}
                  >
                    <ArrowLeft className="size-4" />
                    Back to records
                  </Button>
                  <h2 className="text-sm font-semibold text-muted-foreground">
                    {editingRecord
                      ? `Edit record #${String(editingRecord[selected.primary_key] ?? "")}`
                      : `New ${selected.label || selected.name} record`}
                  </h2>
                </div>
              </div>

              {editableFields.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This collection has no editable fields. Go to Data Studio to add columns.
                </p>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveRecord();
                  }}
                  className="space-y-5"
                >
                  {editableFields.map((field) => (
                    <div key={field.name} className="grid gap-3">
                      <FieldLabel field={field} />
                      <FieldInput
                        field={field}
                        value={recordValues[field.name]}
                        media={{
                          csrfToken: String(initial.csrf_token ?? ""),
                          uploadUrl: String(
                            initial.media_upload_url ?? "/api/media/upload"
                          ),
                          apiRoot: String(
                            initial.media_api_root ?? "/api/xhr/media"
                          ),
                        }}
                        onChange={(value) =>
                          setRecordValues((values) => ({
                            ...values,
                            [field.name]: value,
                          }))
                        }
                      />
                    </div>
                  ))}

                  {/* Clean bottom buttons for form */}
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
                        type="submit"
                        busy={recordSaving}
                        className="rounded-lg"
                      >
                        <Check className="size-4" />
                        {editingRecord ? "Save changes" : "Create record"}
                      </BusyButton>
                    </div>
                  </div>
                </form>
              )}
            </div>
          ) : (
            /* TABLE WORKING AREA */
            <div className="space-y-4">
              {selectedRowIds.size > 0 ? (
                <div className="flex items-center justify-between gap-3">
                  <Badge variant="outline" className="tabular-nums">
                    {total} {total === 1 ? "record" : "records"}
                  </Badge>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="rounded-lg"
                    onClick={deleteSelected}
                  >
                    <Trash2 className="size-3.5" />
                    Delete ({selectedRowIds.size})
                  </Button>
                </div>
              ) : null}

              {/* Data Table */}
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="app-scrollbar overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface-subtle/80 text-xs font-semibold text-muted-foreground">
                        <th className="w-10 px-3 py-3 text-center">
                          <Checkbox
                            checked={
                              selectedRowIds.size === records.length && records.length > 0
                            }
                            onCheckedChange={toggleSelectAll}
                            aria-label="Select all rows"
                          />
                        </th>
                        <th className="px-3 py-3 font-mono">
                          {selected.primary_key || "id"}
                        </th>
                        {tableFields.map((field) => (
                          <th key={field.name} className="px-3 py-3 whitespace-nowrap">
                            {field.label || field.name}
                          </th>
                        ))}
                        <th className="w-16 px-3 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.length === 0 ? (
                        <tr>
                          <td
                            colSpan={tableFields.length + 3}
                            className="py-12 text-center"
                          >
                            <div className="flex flex-col items-center justify-center gap-2">
                              <p className="text-sm font-semibold text-muted-foreground">
                                {search ? "No records match your search" : "No records yet"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {search
                                  ? "Try searching for something else or clear the filter."
                                  : `Add your first record to ${selected.label || selected.name}.`}
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
                                  Add first record
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
                                    ) : field.type === "image" && value ? (
                                      <div className="flex items-center gap-2">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          src={String(value)}
                                          alt={field.name}
                                          className="size-7 rounded object-cover border border-border shrink-0 bg-muted"
                                          loading="lazy"
                                        />
                                        <span className="line-clamp-1 truncate text-xs text-muted-foreground">
                                          {cell_value(value)}
                                        </span>
                                      </div>
                                    ) : (
                                      <span className="line-clamp-2 break-words text-muted-foreground">
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

                {/* Table Bottoms: Pagination */}
                {pages > 1 ? (
                  <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
                    <span>
                      Page {page} of {pages} ({total} records)
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-xs"
                        disabled={page <= 1 || busy}
                        onClick={() => refresh(selected.name, page - 1)}
                      >
                        <ChevronLeft className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-xs"
                        disabled={page >= pages || busy}
                        onClick={() => refresh(selected.name, page + 1)}
                      >
                        <ChevronRight className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>

      {confirm_dialog}
    </div>
  );
}
