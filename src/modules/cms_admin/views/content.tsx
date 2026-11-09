"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Database,
  GripVertical,
  LayoutGrid,
  Layers,
  Loader2,
  MapPin,
  MessageSquareText,
  Pencil,
  Plus,
  Search,
  RefreshCw,
  Send,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
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
  CmsFieldForm,
  FieldValueDisplay,
  default_value_for_field,
  is_status_field,
  is_system_sort_field,
  is_alias_field,
} from "./field-inputs";
import { MapCanvas } from "./field-inputs/MapCanvas";
import { BusyButton, EmptyState, cms_call } from "./ui";

interface Snapshot {
  collections?: CmsCollectionWithFields[];
  selected?: CmsCollectionWithFields | null;
  fields?: CmsField[];
  records?: Record<string, unknown>[];
  user_labels?: Record<string, string>;
  total?: number;
  page?: number;
  pages?: number;
  limit?: number;
  search?: string;
  csrf_token?: string;
  media_upload_url?: string;
  media_api_root?: string;
}

type DisplayLayout = "table" | "cards" | "calendar" | "kanban" | "map";
type FilterOperator =
  | "_eq"
  | "_neq"
  | "_contains"
  | "_gt"
  | "_gte"
  | "_lt"
  | "_lte"
  | "_null";

interface FilterRule {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
}

function filter_payload(
  rules: FilterRule[],
  fields: CmsField[]
): Record<string, unknown> | undefined {
  const conditions = rules.map((rule) => {
    let value: unknown = rule.value;
    if (rule.operator === "_null") value = true;
    else if (
      fields.some(
        (field) =>
          field.name === rule.field &&
          (field.type === "integer" || field.type === "decimal")
      )
    ) {
      value = Number(rule.value);
    }
    return { [rule.field]: { [rule.operator]: value } };
  });
  return conditions.length ? { _and: conditions } : undefined;
}

function coordinates(value: unknown): { latitude: number; longitude: number } | null {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  if (
    Array.isArray(parsed) &&
    parsed.length >= 2 &&
    Number.isFinite(Number(parsed[0])) &&
    Number.isFinite(Number(parsed[1]))
  ) {
    return { longitude: Number(parsed[0]), latitude: Number(parsed[1]) };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const point = parsed as Record<string, unknown>;
  const rawCoordinates = point.coordinates;
  const latitude = Number(
    point.latitude ?? point.lat ??
      (Array.isArray(rawCoordinates) ? rawCoordinates[1] : undefined)
  );
  const longitude = Number(
    point.longitude ?? point.lng ?? point.lon ??
      (Array.isArray(rawCoordinates) ? rawCoordinates[0] : undefined)
  );
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function record_defaults(fields: CmsField[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    if (is_alias_field(field)) continue;
    values[field.name] = default_value_for_field(field);
  }
  return values;
}

function parse_record_value(field: CmsField, value: unknown): unknown {
  if (
    is_status_field(field) &&
    (value === null || value === undefined || value === "")
  ) {
    return "draft";
  }
  if (value === null || value === undefined) {
    return default_value_for_field(field);
  }
  if (field.type === "json" && typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return default_value_for_field(field);
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return value;
    }
  }
  return value;
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
  const [userLabels, setUserLabels] = useState<Record<string, string>>(
    initial.user_labels ?? {}
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
  const [reordering, setReordering] = useState(false);
  const [draggedRecordId, setDraggedRecordId] = useState<string | null>(null);
  const [dropTargetRecordId, setDropTargetRecordId] = useState<string | null>(null);
  const [displayLayout, setDisplayLayout] = useState<DisplayLayout>("table");
  const [viewPanelOpen, setViewPanelOpen] = useState(false);
  const [columnPreferences, setColumnPreferences] = useState<Record<string, string[]>>({});
  const [filterRules, setFilterRules] = useState<FilterRule[]>([]);
  const [draftFilterRules, setDraftFilterRules] = useState<FilterRule[]>([]);
  const [calendarField, setCalendarField] = useState("");
  const [kanbanField, setKanbanField] = useState("");
  const [mapField, setMapField] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<string[]>([]);

  // Record Form state
  const [editingRecord, setEditingRecord] = useState<Record<string, unknown> | null>(null);
  const [recordValues, setRecordValues] = useState<Record<string, unknown>>({});
  const [recordSaving, setRecordSaving] = useState(false);

  const applySnapshot = useCallback((snapshot: Snapshot) => {
    setCollections(snapshot.collections ?? []);
    setSelected(snapshot.selected ?? null);
    setFields(snapshot.fields ?? []);
    setRecords(snapshot.records ?? []);
    setUserLabels(snapshot.user_labels ?? {});
    setTotal(Number(snapshot.total ?? 0));
    setPage(Number(snapshot.page ?? 1));
    setPages(Number(snapshot.pages ?? 1));
    setSearch(String(snapshot.search ?? ""));
    setSearchInput(String(snapshot.search ?? ""));
  }, []);

  const refresh = useCallback(
    async (
      collectionName?: string,
      nextPage = 1,
      nextSearch = search,
      nextFilters = filterRules
    ) => {
      setBusy(true);
      try {
        const snapshot = await cms_call<Snapshot>("data_state", {
          collection: collectionName ?? selected?.name ?? "",
          page: nextPage,
          search: nextSearch,
          filter: filter_payload(nextFilters, fields),
        });
        applySnapshot(snapshot);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not load content.");
      } finally {
        setBusy(false);
      }
    },
    [applySnapshot, fields, filterRules, search, selected]
  );

  const selectCollection = useCallback(
    async (name: string) => {
      setViewMode("table");
      setSelectedRowIds(new Set());
      setFilterRules([]);
      setDraftFilterRules([]);
      setCalendarField("");
      setKanbanField("");
      setMapField("");
      await refresh(name, 1, "", []);
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

  const applyFilters = useCallback(() => {
    const invalidRule = draftFilterRules.find(
      (rule) =>
        rule.operator !== "_null" &&
        (!rule.value.trim() ||
          (fields.some(
            (field) =>
              field.name === rule.field &&
              (field.type === "integer" || field.type === "decimal")
          ) &&
            Number.isNaN(Number(rule.value))))
    );
    if (invalidRule) {
      toast.error("Enter a valid value for each filter or choose an empty-value operator.");
      return;
    }
    setSelectedRowIds(new Set());
    setFilterRules(draftFilterRules);
    void refresh(selected?.name, 1, search, draftFilterRules);
  }, [draftFilterRules, fields, refresh, search, selected?.name]);

  const removeFilter = useCallback(
    (id: string) => {
      const next = filterRules.filter((rule) => rule.id !== id);
      setSelectedRowIds(new Set());
      setFilterRules(next);
      setDraftFilterRules((rules) => rules.filter((rule) => rule.id !== id));
      void refresh(selected?.name, 1, search, next);
    },
    [filterRules, refresh, search, selected?.name]
  );

  const openCreateRecord = useCallback(() => {
    setEditingRecord(null);
    setRecordValues(record_defaults(fields));
    setViewMode("record-form");
  }, [fields]);

  const openEditRecord = useCallback(
    (record: Record<string, unknown>) => {
      setEditingRecord(record);
      const values: Record<string, unknown> = {};
      for (const field of fields) {
        if (is_alias_field(field)) continue;
        values[field.name] = parse_record_value(field, record[field.name]);
      }
      for (const [key, value] of Object.entries(record)) {
        if (!(key in values)) values[key] = value ?? "";
      }
      setRecordValues(values);
      setViewMode("record-form");
    },
    [fields]
  );

  const saveRecord = useCallback(async () => {
    if (!selected) return;
    setRecordSaving(true);
    try {
      const values: Record<string, unknown> = {};
      for (const field of fields) {
        if (field.hidden || field.readonly) continue;
        if (is_alias_field(field)) continue;
        if (editingRecord && field.name === selected.primary_key) continue;
        const rawValue = recordValues[field.name];
        const value =
          is_status_field(field) &&
          (rawValue === null || rawValue === undefined || rawValue === "")
            ? "draft"
            : rawValue;
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
  const sortField = useMemo(
    () => fields.find(is_system_sort_field),
    [fields]
  );
  const manualOrderingActive =
    Boolean(sortField) &&
    (selected?.ordering_mode ??
      (sortField ? "manual" : "default")) === "manual";
  const canReorderRecords =
    manualOrderingActive &&
    !search.trim() &&
    !searchInput.trim() &&
    viewMode === "table";
  const availableTableFields = useMemo(
    () =>
      visibleFields.filter(
        (field) =>
          field.name !== selected?.primary_key && !is_alias_field(field)
      ),
    [selected?.primary_key, visibleFields]
  );
  const tableFields = useMemo(() => {
    const saved = selected ? columnPreferences[selected.name] : undefined;
    if (saved) {
      return saved
        .map((name) => availableTableFields.find((field) => field.name === name))
        .filter((field): field is CmsField => Boolean(field));
    }
    const shown = availableTableFields.slice(0, 8);
    if (sortField && !shown.some((field) => field.name === sortField.name)) {
      return [...availableTableFields.slice(0, 7), sortField];
    }
    return shown;
  }, [availableTableFields, columnPreferences, selected, sortField]);
  const dateFields = visibleFields.filter((field) => field.type === "datetime");
  const kanbanFields = visibleFields.filter(
    (field) => field.type === "select" || field.type === "string" || field.type === "text"
  );
  const mapFields = visibleFields.filter(
    (field) => field.interface === "map" || field.type === "json"
  );
  const formFields = useMemo(
    () =>
      fields.filter(
        (field) =>
          !field.hidden &&
          (!editingRecord || field.name !== selected?.primary_key)
      ),
    [editingRecord, fields, selected?.primary_key]
  );
  const editableFields = useMemo(
    () =>
      formFields.filter(
        (field) => !field.readonly && !is_alias_field(field)
      ),
    [formFields]
  );
  const canCreateRecord = editableFields.length > 0 || Boolean(sortField);

  const saveRecordOrder = useCallback(
    async (orderedRecords: Record<string, unknown>[]) => {
      if (!selected || !sortField || !canReorderRecords || reordering) return;
      const previousRecords = records;
      setRecords(orderedRecords);
      setReordering(true);
      try {
        await cms_call("data_records_reorder", {
          collection: selected.name,
          page,
          record_ids: orderedRecords.map((record) =>
            String(record[selected.primary_key])
          ),
        });
        toast.success("Record order updated.");
        await refresh(selected.name, page, "");
      } catch (error) {
        setRecords(previousRecords);
        toast.error(error instanceof Error ? error.message : "Could not reorder records.");
        await refresh(selected.name, page, "");
      } finally {
        setReordering(false);
        setDraggedRecordId(null);
        setDropTargetRecordId(null);
      }
    },
    [
      canReorderRecords,
      page,
      records,
      refresh,
      reordering,
      selected,
      sortField,
    ]
  );

  const moveRecord = useCallback(
    (from: number, to: number) => {
      if (!canReorderRecords || reordering || to < 0 || to >= records.length) return;
      const orderedRecords = [...records];
      const [moved] = orderedRecords.splice(from, 1);
      orderedRecords.splice(to, 0, moved);
      void saveRecordOrder(orderedRecords);
    },
    [canReorderRecords, records, reordering, saveRecordOrder]
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
    const pageSidebar = (
      <ContentSidebar
        collections={collections}
        activeName={selected?.name}
        onSelect={selectCollection}
        busy={busy}
        layout="navigation"
      />
    );

    if (!selected) {
      return {
        section: "Content",
        title: "Content",
        icon: <Layers className="size-4" strokeWidth={1.75} />,
        pageSidebar,
      };
    }
    if (viewMode === "record-form") {
      return {
        section: selected.label || selected.name,
        title: editingRecord
          ? `Editing record in ${selected.label || selected.name}`
          : `New record in ${selected.label || selected.name}`,
        onBack: () => setViewMode("table"),
        pageSidebar,
      };
    }
    return {
      section: "Content",
      title: selected.label || selected.name,
      search: searchControl,
      pageSidebar,
    };
  }, [
    busy,
    clearSearch,
    collections,
    editingRecord,
    searchInput,
    selectCollection,
    selected,
    submitSearch,
    viewMode,
  ]);

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
            {selected ? (
              <Button
                type="button"
                variant={viewPanelOpen ? "secondary" : "outline"}
                size="sm"
                className="h-8 rounded-full"
                aria-expanded={viewPanelOpen}
                onClick={() => setViewPanelOpen((open) => !open)}
              >
                <SlidersHorizontal className="size-3.5" />
                View options
              </Button>
            ) : null}
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
            {selected && canCreateRecord ? (
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

      <div className="mb-4 md:hidden">
        <ContentSidebar
          collections={collections}
          activeName={selected?.name}
          onSelect={selectCollection}
          busy={busy}
        />
      </div>

      <div className="flex min-w-0 flex-col gap-5 lg:flex-row">
      <div className="min-w-0 flex-1">
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
            <div className="w-full md:w-4/5 space-y-6">
              {formFields.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This collection has no fields. Go to Data Studio to add columns.
                </p>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveRecord();
                  }}
                  className="space-y-5"
                >
                  <CmsFieldForm
                    fields={formFields}
                    values={recordValues}
                    collections={collections}
                    media={{
                      csrfToken: String(initial.csrf_token ?? ""),
                      uploadUrl: String(
                        initial.media_upload_url ?? "/api/media/upload"
                      ),
                      apiRoot: String(
                        initial.media_api_root ?? "/api/xhr/media"
                      ),
                    }}
                    onChange={(name, value) =>
                      setRecordValues((values) => ({
                        ...values,
                        [name]: value,
                      }))
                    }
                  />

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

              {displayLayout === "table" ? (
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="app-scrollbar overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface-subtle/80 text-xs font-semibold text-muted-foreground">
                        {manualOrderingActive ? (
                          <th className="w-9 px-1 py-3">
                            <span className="sr-only">Reorder</span>
                          </th>
                        ) : null}
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
                        <th
                          className={cn(
                            "px-3 py-3 text-right",
                            sortField ? "w-44" : "w-16"
                          )}
                        >
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.length === 0 ? (
                        <tr>
                          <td
                            colSpan={tableFields.length + 3 + (sortField ? 1 : 0)}
                            className="py-12 text-center"
                          >
                            <div className="flex flex-col items-center justify-center gap-2">
                              <p className="text-sm font-semibold text-muted-foreground">
                                {search ? "No records match your search" : "No records yet"}
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
                                  disabled={!canCreateRecord}
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
                                isSelected && "bg-muted/70 hover:bg-muted",
                                dropTargetRecordId === rowId &&
                                  draggedRecordId !== rowId &&
                                  "border-t-2 border-t-primary",
                                draggedRecordId === rowId && "opacity-60"
                              )}
                              onDragOver={(event) => {
                                if (!canReorderRecords || reordering || !draggedRecordId) return;
                                event.preventDefault();
                                event.dataTransfer.dropEffect = "move";
                                setDropTargetRecordId(rowId);
                              }}
                              onDrop={(event) => {
                                event.preventDefault();
                                if (!canReorderRecords || reordering || !draggedRecordId) return;
                                const from = records.findIndex(
                                  (item, itemIndex) =>
                                    String(item[selected.primary_key] ?? itemIndex) === draggedRecordId
                                );
                                const to = records.findIndex(
                                  (item, itemIndex) =>
                                    String(item[selected.primary_key] ?? itemIndex) === rowId
                                );
                                setDraggedRecordId(null);
                                setDropTargetRecordId(null);
                                if (from >= 0 && to >= 0 && from !== to) moveRecord(from, to);
                              }}
                              onClick={() => openEditRecord(record)}
                            >
                              {manualOrderingActive ? (
                                <td
                                  className="px-1 py-2 text-center"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    draggable={canReorderRecords && !reordering}
                                    disabled={!canReorderRecords || reordering}
                                    aria-label={`Drag to reorder record ${rowId}`}
                                    title={
                                      canReorderRecords
                                        ? "Drag to reorder"
                                        : "Clear search to reorder"
                                    }
                                    onDragStart={(event) => {
                                      event.stopPropagation();
                                      event.dataTransfer.effectAllowed = "move";
                                      event.dataTransfer.setData("text/plain", rowId);
                                      setDraggedRecordId(rowId);
                                    }}
                                    onDragEnd={() => {
                                      setDraggedRecordId(null);
                                      setDropTargetRecordId(null);
                                    }}
                                    className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    <GripVertical className="size-4" />
                                  </button>
                                </td>
                              ) : null}
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
                                    <FieldValueDisplay
                                      field={field}
                                      value={value}
                                      userLabel={
                                        userLabels[String(Number(value))] ??
                                        userLabels[String(value)]
                                      }
                                    />
                                  </td>
                                );
                              })}
                              <td
                                className="px-3 py-3 text-right"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex justify-end gap-1">
                                  {manualOrderingActive ? (
                                    <>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-xs"
                                        aria-label={`Move record ${rowId} up`}
                                        title="Move up"
                                        disabled={
                                          !canReorderRecords || reordering || index === 0
                                        }
                                        onClick={() => moveRecord(index, index - 1)}
                                      >
                                        <ArrowUp className="size-3.5" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-xs"
                                        aria-label={`Move record ${rowId} down`}
                                        title="Move down"
                                        disabled={
                                          !canReorderRecords ||
                                          reordering ||
                                          index === records.length - 1
                                        }
                                        onClick={() => moveRecord(index, index + 1)}
                                      >
                                        <ArrowDown className="size-3.5" />
                                      </Button>
                                    </>
                                  ) : null}
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
                        onClick={() => refresh(selected?.name, page - 1)}
                      >
                        <ChevronLeft className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-xs"
                        disabled={page >= pages || busy}
                        onClick={() => refresh(selected?.name, page + 1)}
                      >
                        <ChevronRight className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
              ) : displayLayout === "cards" ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {records.map((record, index) => {
                    const rowId = String(record[selected.primary_key] ?? index);
                    return (
                      <article
                        key={rowId}
                        role="button"
                        tabIndex={0}
                        onClick={() => openEditRecord(record)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") openEditRecord(record);
                        }}
                        className="cursor-pointer rounded-xl border border-border bg-card p-4 transition-colors hover:bg-surface-subtle"
                      >
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <span className="truncate font-mono text-xs text-muted-foreground">#{rowId}</span>
                          <Pencil className="size-3.5 text-muted-foreground" />
                        </div>
                        <div className="space-y-3">
                          {tableFields.slice(0, 4).map((field) => (
                            <div key={field.name} className="min-w-0">
                              <p className="text-xs font-medium text-muted-foreground">{field.label || field.name}</p>
                              <div className="truncate text-sm">
                                <FieldValueDisplay field={field} value={record[field.name]} userLabel={userLabels[String(record[field.name])]} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </article>
                    );
                  })}
                  {records.length === 0 ? <p className="col-span-full py-12 text-center text-sm text-muted-foreground">No records to display.</p> : null}
                </div>
              ) : displayLayout === "calendar" ? (
                <div className="space-y-3">
                  {!calendarField && dateFields.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Add a date/time field to this collection to use the calendar layout.</p>
                  ) : records.map((record, index) => {
                    const rowId = String(record[selected.primary_key] ?? index);
                    const rawDate = record[calendarField || dateFields[0]?.name];
                    const date = rawDate ? new Date(String(rawDate)) : null;
                    const dateLabel = date && !Number.isNaN(date.getTime())
                      ? date.toLocaleString()
                      : "No date";
                    return (
                      <button key={rowId} type="button" onClick={() => openEditRecord(record)} className="flex w-full items-start gap-3 rounded-xl border border-border bg-card p-4 text-left hover:bg-surface-subtle">
                        <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-medium text-muted-foreground">{dateLabel}</span>
                          <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                            {tableFields.slice(0, 3).map((field) => (
                              <span key={field.name} className="max-w-full truncate text-sm">
                                <span className="text-muted-foreground">{field.label || field.name}: </span>
                                <FieldValueDisplay field={field} value={record[field.name]} userLabel={userLabels[String(record[field.name])]} />
                              </span>
                            ))}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : displayLayout === "kanban" ? (
                (() => {
                  const groupField = kanbanField || kanbanFields[0]?.name;
                  const groups = new Map<string, Record<string, unknown>[]>();
                  for (const record of records) {
                    const value = groupField ? record[groupField] : undefined;
                    const key = value === null || value === undefined || value === "" ? "No value" : String(value);
                    groups.set(key, [...(groups.get(key) ?? []), record]);
                  }
                  return !groupField ? (
                    <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Add a text or select field to group Kanban cards.</p>
                  ) : (
                    <div className="flex gap-3 overflow-x-auto pb-2">
                      {Array.from(groups.entries()).map(([group, groupRecords]) => (
                        <section key={group} className="w-64 shrink-0 rounded-xl bg-muted/40 p-3">
                          <h3 className="mb-3 flex items-center justify-between text-xs font-semibold">
                            <span className="truncate">{group}</span>
                            <Badge variant="outline">{groupRecords.length}</Badge>
                          </h3>
                          <div className="space-y-2">
                            {groupRecords.map((record, index) => {
                              const rowId = String(record[selected.primary_key] ?? index);
                              return (
                                <button key={rowId} type="button" onClick={() => openEditRecord(record)} className="w-full rounded-lg border border-border bg-card p-3 text-left hover:bg-surface-subtle">
                                  <span className="mb-2 block font-mono text-xs text-muted-foreground">#{rowId}</span>
                                  {tableFields.filter((field) => field.name !== groupField).slice(0, 3).map((field) => (
                                    <span key={field.name} className="mb-1 block truncate text-xs">
                                      <span className="text-muted-foreground">{field.label || field.name}: </span>
                                      <FieldValueDisplay field={field} value={record[field.name]} userLabel={userLabels[String(record[field.name])]} />
                                    </span>
                                  ))}
                                </button>
                              );
                            })}
                          </div>
                        </section>
                      ))}
                    </div>
                  );
                })()
              ) : (
                (() => {
                  const locationField = mapField || mapFields[0]?.name;
                  const points = records.flatMap((record, index) => {
                    const point = locationField ? coordinates(record[locationField]) : null;
                    return point ? [{ record, index, ...point }] : [];
                  });
                  return (
                    <div className="space-y-3">
                      {mapFields.length > 0 ? (
                        <label className="flex max-w-sm items-center gap-2 text-xs text-muted-foreground">
                          Location field
                          <select
                            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                            value={locationField}
                            onChange={(event) => setMapField(event.target.value)}
                          >
                            {mapFields.map((field) => (
                              <option key={field.name} value={field.name}>{field.label || field.name}</option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      {points.length > 0 ? (
                        <>
                          <MapCanvas
                            provider="openstreetmap"
                            apiKey=""
                            geometryType="MultiPoint"
                            coordinates={points.map((point) => [
                              point.longitude,
                              point.latitude,
                            ])}
                            center={{
                              lat: points.reduce((sum, point) => sum + point.latitude, 0) / points.length,
                              lng: points.reduce((sum, point) => sum + point.longitude, 0) / points.length,
                            }}
                            zoom={points.length === 1 ? 12 : 4}
                            height={420}
                            disabled
                            pointSelected={false}
                            onClearPoint={() => {}}
                            onMapClick={() => {}}
                          />
                          <div className="grid gap-3 sm:grid-cols-2" role="region" aria-label="Record locations">
                            {points.map((point) => {
                              const rowId = String(point.record[selected.primary_key] ?? point.index);
                              return (
                                <button
                                  key={rowId}
                                  type="button"
                                  title={`Record #${rowId}`}
                                  aria-label={`Open record ${rowId}`}
                                  onClick={() => openEditRecord(point.record)}
                                  className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-left hover:bg-surface-subtle"
                                >
                                  <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
                                  <span className="min-w-0">
                                    <span className="block font-mono text-xs text-muted-foreground">
                                      #{rowId}
                                    </span>
                                    <span className="mt-1 block text-sm">
                                      {point.latitude}, {point.longitude}
                                    </span>
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Showing {points.length} location {points.length === 1 ? "record" : "records"} from this page.
                          </p>
                        </>
                      ) : (
                        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                          {mapFields.length
                            ? "No values in this field contain latitude and longitude coordinates."
                            : "Add a JSON or map field with latitude and longitude values to plot records."}
                        </div>
                      )}
                    </div>
                  );
                })()
              )}
            </div>
          )}
          {displayLayout !== "table" && pages > 1 ? (
            <div className="flex items-center justify-between border-t border-border py-3 text-xs text-muted-foreground">
              <span>Page {page} of {pages} ({total} records)</span>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-xs"
                  disabled={page <= 1 || busy}
                  onClick={() => refresh(selected?.name, page - 1)}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-xs"
                  disabled={page >= pages || busy}
                  onClick={() => refresh(selected?.name, page + 1)}
                  aria-label="Next page"
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          ) : null}
      </div>

      {selected && viewMode === "table" && viewPanelOpen ? (
        <aside className="w-full shrink-0 space-y-5 rounded-xl border border-border bg-card p-4 lg:w-80">
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <LayoutGrid className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Layout</h2>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {([
                ["table", "Table"],
                ["cards", "Cards"],
                ["calendar", "Calendar"],
                ["kanban", "Kanban"],
                ["map", "Map"],
              ] as const).map(([layout, label]) => (
                <Button
                  key={layout}
                  type="button"
                  variant={displayLayout === layout ? "secondary" : "outline"}
                  size="sm"
                  className="justify-start"
                  onClick={() => setDisplayLayout(layout)}
                >
                  {label}
                </Button>
              ))}
            </div>
            {displayLayout === "calendar" ? (
              <label className="block space-y-1.5 text-xs text-muted-foreground">
                Date field
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                  value={calendarField}
                  onChange={(event) => setCalendarField(event.target.value)}
                >
                  <option value="">Choose a date field</option>
                  {dateFields.map((field) => (
                    <option key={field.name} value={field.name}>
                      {field.label || field.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {displayLayout === "kanban" ? (
              <label className="block space-y-1.5 text-xs text-muted-foreground">
                Group cards by
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                  value={kanbanField}
                  onChange={(event) => setKanbanField(event.target.value)}
                >
                  <option value="">Choose a field</option>
                  {kanbanFields.map((field) => (
                    <option key={field.name} value={field.name}>
                      {field.label || field.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </section>

          <section className="space-y-3 border-t border-border pt-4">
            <div className="flex items-center gap-2">
              <Columns3 className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Columns</h2>
            </div>
            <div className="space-y-1">
              {availableTableFields.map((field) => {
                const isVisible = tableFields.some((item) => item.name === field.name);
                const visibleIndex = tableFields.findIndex((item) => item.name === field.name);
                return (
                  <div key={field.name} className="flex items-center gap-1 rounded-md px-1 py-1 hover:bg-muted/50">
                    <Checkbox
                      checked={isVisible}
                      aria-label={`Show ${field.label || field.name}`}
                      onCheckedChange={(checked) => {
                        const current = selected ? columnPreferences[selected.name] : undefined;
                        const names = current ?? tableFields.map((item) => item.name);
                        const next = checked
                          ? [...names, field.name]
                          : names.filter((name) => name !== field.name);
                        setColumnPreferences((preferences) => ({
                          ...preferences,
                          [selected.name]: next,
                        }));
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {field.label || field.name}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Move ${field.name} up`}
                      disabled={!isVisible || visibleIndex <= 0}
                      onClick={() => {
                        const names = tableFields.map((item) => item.name);
                        const position = names.indexOf(field.name);
                        [names[position - 1], names[position]] = [names[position], names[position - 1]];
                        setColumnPreferences((preferences) => ({
                          ...preferences,
                          [selected.name]: names,
                        }));
                      }}
                    >
                      <ArrowUp className="size-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Move ${field.name} down`}
                      disabled={!isVisible || visibleIndex < 0 || visibleIndex >= tableFields.length - 1}
                      onClick={() => {
                        const names = tableFields.map((item) => item.name);
                        const position = names.indexOf(field.name);
                        [names[position + 1], names[position]] = [names[position], names[position + 1]];
                        setColumnPreferences((preferences) => ({
                          ...preferences,
                          [selected.name]: names,
                        }));
                      }}
                    >
                      <ArrowDown className="size-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="space-y-3 border-t border-border pt-4">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Advanced filters</h2>
            </div>
            {filterRules.length ? (
              <div className="space-y-1.5">
                {filterRules.map((rule) => (
                  <div key={rule.id} className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1.5 text-xs">
                    <span className="min-w-0 flex-1 truncate">
                      {fields.find((field) => field.name === rule.field)?.label || rule.field}{" "}
                      {rule.operator.replaceAll("_", " ")}{" "}
                      {rule.operator === "_null" ? "empty" : rule.value}
                    </span>
                    <Button type="button" variant="ghost" size="icon-xs" aria-label="Remove filter" onClick={() => removeFilter(rule.id)}>
                      <X className="size-3" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No filters applied.</p>
            )}
            <div className="space-y-2">
              {draftFilterRules.map((rule) => (
                <div key={rule.id} className="space-y-1.5 rounded-lg border border-border p-2">
                  <select
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                    value={rule.field}
                    onChange={(event) =>
                      setDraftFilterRules((rules) =>
                        rules.map((item) => item.id === rule.id ? { ...item, field: event.target.value } : item)
                      )
                    }
                    aria-label="Filter field"
                  >
                    {visibleFields.map((field) => (
                      <option key={field.name} value={field.name}>{field.label || field.name}</option>
                    ))}
                  </select>
                  <select
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                    value={rule.operator}
                    onChange={(event) =>
                      setDraftFilterRules((rules) =>
                        rules.map((item) => item.id === rule.id ? { ...item, operator: event.target.value as FilterOperator } : item)
                      )
                    }
                    aria-label="Filter operator"
                  >
                    <option value="_eq">is</option>
                    <option value="_neq">is not</option>
                    <option value="_contains">contains</option>
                    <option value="_gt">greater than</option>
                    <option value="_gte">at least</option>
                    <option value="_lt">less than</option>
                    <option value="_lte">at most</option>
                    <option value="_null">is empty</option>
                  </select>
                  {rule.operator !== "_null" ? (
                    <Input
                      value={rule.value}
                      onChange={(event) =>
                        setDraftFilterRules((rules) =>
                          rules.map((item) => item.id === rule.id ? { ...item, value: event.target.value } : item)
                        )
                      }
                      placeholder="Filter value"
                      className="h-8 text-xs"
                    />
                  ) : null}
                </div>
              ))}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() =>
                    setDraftFilterRules((rules) => [
                      ...rules,
                      {
                        id: `${Date.now()}-${rules.length}`,
                        field: visibleFields[0]?.name ?? "",
                        operator: "_contains",
                        value: "",
                      },
                    ])
                  }
                  disabled={visibleFields.length === 0}
                >
                  Add filter
                </Button>
                <Button type="button" size="sm" onClick={applyFilters} disabled={draftFilterRules.length === 0}>
                  Apply
                </Button>
              </div>
            </div>
          </section>

          <section className="space-y-3 border-t border-border pt-4">
            <div className="flex items-center gap-2">
              <MessageSquareText className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Ask AI about your data</h2>
            </div>
            <div className="max-h-40 min-h-16 space-y-2 overflow-y-auto rounded-lg bg-muted/40 p-2">
              {chatMessages.length === 0 ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Ask a question about this collection. AI chat is a UI preview and is not connected yet.
                </p>
              ) : chatMessages.map((message, index) => (
                <p key={`${index}-${message}`} className="ml-auto w-fit max-w-[90%] rounded-lg bg-primary px-2.5 py-1.5 text-xs text-primary-foreground">
                  {message}
                </p>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!chatInput.trim()) return;
                setChatMessages((messages) => [...messages, chatInput.trim()]);
                setChatInput("");
              }}
            >
              <Input value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Ask about your records..." className="h-9 min-w-0 text-xs" />
              <Button type="submit" size="icon" className="size-9 shrink-0" aria-label="Send question" disabled={!chatInput.trim()}>
                <Send className="size-4" />
              </Button>
            </form>
          </section>
        </aside>
      ) : null}
      </div>

      {confirm_dialog}
    </div>
  );
}
