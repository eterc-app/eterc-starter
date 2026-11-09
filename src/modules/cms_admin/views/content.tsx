"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowDown,
  ArrowDownAZ,
  ArrowDownUp,
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowUp,
  ArrowUpAZ,
  Box,
  CalendarDays,
  Check,
  CircleCheck,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Columns3,
  Database,
  Filter,
  GripVertical,
  EyeOff,
  Image as ImageIcon,
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
  Sparkles,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  PageActionsPortal,
  PageRightSidebarPortal,
  useSetNavbarMeta,
} from "@/components/app/PageActionsSlot";
import { useConfirm } from "@/components/app/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
type CalendarView = "month" | "week" | "day" | "list";
type SidebarSection = "layout" | "refresh" | "import" | "assistant";
type ColumnAlignment = "left" | "center" | "right";

const display_layouts: {
  value: DisplayLayout;
  label: string;
  Icon: typeof LayoutGrid;
}[] = [
  { value: "table", label: "Table", Icon: Table2 },
  { value: "cards", label: "Cards", Icon: LayoutGrid },
  { value: "calendar", label: "Calendar", Icon: CalendarDays },
  { value: "kanban", label: "Kanban", Icon: Columns3 },
  { value: "map", label: "Map", Icon: MapPin },
];

const collection_layout_storage_key = "eterc-cms-content-layouts";
const layout_storage_unavailable = "__layout_storage_unavailable__";
const layout_storage_listeners = new Set<() => void>();

function subscribe_layout_storage(listener: () => void): () => void {
  layout_storage_listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    layout_storage_listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function get_layout_storage_snapshot(): string | null {
  try {
    return window.localStorage.getItem(collection_layout_storage_key);
  } catch {
    return layout_storage_unavailable;
  }
}

interface ColumnSort {
  field: string;
  direction: "asc" | "desc";
}
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

function is_display_layout(value: string): value is DisplayLayout {
  return display_layouts.some((layout) => layout.value === value);
}

function pagination_items(
  current: number,
  total: number
): (number | "start-ellipsis" | "end-ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  return [
    1,
    ...(start > 2 ? (["start-ellipsis"] as const) : []),
    ...Array.from({ length: end - start + 1 }, (_, index) => start + index),
    ...(end < total - 1 ? (["end-ellipsis"] as const) : []),
    total,
  ];
}

function parse_calendar_date(value: unknown): Date | null {
  if (typeof value === "string") {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (dateOnly) {
      const [, year, month, day] = dateOnly;
      const localDate = new Date(Number(year), Number(month) - 1, Number(day));
      if (
        localDate.getFullYear() === Number(year) &&
        localDate.getMonth() === Number(month) - 1 &&
        localDate.getDate() === Number(day)
      ) {
        return localDate;
      }
      return null;
    }
  }
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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
  onOpenFilters,
  activeFilterCount,
  placeholder,
}: {
  value: string;
  onChange: (val: string) => void;
  onSubmit: (e?: React.FormEvent) => void;
  onClear: () => void;
  onOpenFilters: () => void;
  activeFilterCount: number;
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
        variant="outline"
        size="sm"
        className="size-8 rounded-full p-0 text-muted-foreground"
        title="Search and filter"
        aria-label="Search and filter"
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
        className="h-8 w-44 sm:w-60 pl-8 pr-14 rounded-full bg-surface-subtle border-border text-xs"
      />
      <div className="absolute right-1 flex items-center gap-0.5">
        <button
          type="button"
          onClick={onOpenFilters}
          className={cn(
            "relative grid size-6 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            activeFilterCount > 0 && "text-primary"
          )}
          aria-label="Open search filters"
          title="Search filters"
        >
          <SlidersHorizontal className="size-3.5" />
          {activeFilterCount > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary" />
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => {
            if (value) onClear();
            setOpen(false);
          }}
          className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close search"
        >
          <X className="size-3" />
        </button>
      </div>
    </form>
  );
}

function ColumnResizeHandle({
  label,
  active,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  label: string;
  active: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${label} column`}
      className={cn(
        "absolute right-0 top-0 z-10 h-full w-2 translate-x-1/2 cursor-col-resize touch-none after:absolute after:inset-y-2 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-border/60 hover:after:w-0.5 hover:after:bg-primary focus-visible:after:w-0.5 focus-visible:after:bg-primary",
        active && "after:w-0.5 after:bg-primary"
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={(event) => event.stopPropagation()}
    />
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
  const savedLayoutPreferences = useSyncExternalStore(
    subscribe_layout_storage,
    get_layout_storage_snapshot,
    () => null
  );
  const layoutPreferences = useMemo<Record<string, DisplayLayout>>(() => {
    if (!savedLayoutPreferences || savedLayoutPreferences === layout_storage_unavailable) {
      return {};
    }
    try {
      const parsed: unknown = JSON.parse(savedLayoutPreferences);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Saved layout preferences are invalid.");
      }
      return Object.fromEntries(
        Object.entries(parsed).filter(
          ([, value]) => typeof value === "string" && is_display_layout(value)
        )
      ) as Record<string, DisplayLayout>;
    } catch (error) {
      console.error("Could not parse saved collection layouts.", error);
      return {};
    }
  }, [savedLayoutPreferences]);
  const displayLayout = selected
    ? layoutPreferences[selected.name] ?? "table"
    : "table";
  const [cardSize, setCardSize] = useState<
    "small" | "medium" | "large" | "extra-large"
  >("small");
  const [cardImageField, setCardImageField] = useState("auto");
  const [cardTitleField, setCardTitleField] = useState("auto");
  const [cardSubtitleField, setCardSubtitleField] = useState("auto");
  const [viewPanelCollapsed, setViewPanelCollapsed] = useState(true);
  const [sidebarSection, setSidebarSection] = useState<SidebarSection>("layout");
  const [columnSort, setColumnSort] = useState<ColumnSort | null>(null);
  const [columnAlignments, setColumnAlignments] = useState<
    Record<string, ColumnAlignment>
  >({});
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const [recordContextMenu, setRecordContextMenu] = useState<{
    x: number;
    y: number;
    record: Record<string, unknown>;
    rowId: string;
    index: number;
  } | null>(null);
  const columnResizeRef = useRef<{
    key: string;
    startX: number;
    startWidth: number;
  } | null>(null);
  const [filterFocusRequest, setFilterFocusRequest] = useState(0);
  const handledFilterFocusRef = useRef(0);
  const filterSectionRef = useRef<HTMLElement>(null);
  const [columnPreferences, setColumnPreferences] = useState<Record<string, string[]>>({});
  const [primaryKeyColumnVisibility, setPrimaryKeyColumnVisibility] = useState<Record<string, boolean>>({});
  const [filterRules, setFilterRules] = useState<FilterRule[]>([]);
  const [draftFilterRules, setDraftFilterRules] = useState<FilterRule[]>([]);
  const [calendarField, setCalendarField] = useState("");
  const [calendarEndField, setCalendarEndField] = useState("");
  const [calendarDisplayField, setCalendarDisplayField] = useState("");
  const [calendarFirstDay, setCalendarFirstDay] = useState(0);
  const [calendarView, setCalendarView] = useState<CalendarView>("month");
  const [calendarRecordOffsets, setCalendarRecordOffsets] = useState<
    Record<string, number>
  >({});
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [kanbanField, setKanbanField] = useState("");
  const [mapField, setMapField] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<string[]>([]);

  // Record Form state
  const [editingRecord, setEditingRecord] = useState<Record<string, unknown> | null>(null);
  const [recordValues, setRecordValues] = useState<Record<string, unknown>>({});
  const [recordSaving, setRecordSaving] = useState(false);

  const setDisplayLayout = (layout: DisplayLayout) => {
    if (!selected) return;
    const next = { ...layoutPreferences, [selected.name]: layout };
    try {
      window.localStorage.setItem(
        collection_layout_storage_key,
        JSON.stringify(next)
      );
      layout_storage_listeners.forEach((listener) => listener());
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `Could not save this collection's layout: ${error.message}`
          : "Could not save this collection's layout."
      );
    }
  };

  useEffect(() => {
    if (savedLayoutPreferences === layout_storage_unavailable) {
      toast.error("Could not access saved collection layouts in this browser.");
    }
  }, [savedLayoutPreferences]);

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
      nextFilters = filterRules,
      nextSort: ColumnSort | null = columnSort
    ) => {
      setBusy(true);
      try {
        const snapshot = await cms_call<Snapshot>("data_state", {
          collection: collectionName ?? selected?.name ?? "",
          page: nextPage,
          search: nextSearch,
          filter: filter_payload(nextFilters, fields),
          sort: nextSort?.field,
          direction: nextSort?.direction,
        });
        applySnapshot(snapshot);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not load content.");
      } finally {
        setBusy(false);
      }
    },
    [applySnapshot, columnSort, fields, filterRules, search, selected]
  );

  const applyColumnSort = useCallback(
    (nextSort: ColumnSort | null) => {
      setColumnSort(nextSort);
      void refresh(selected?.name, 1, search, filterRules, nextSort);
    },
    [filterRules, refresh, search, selected?.name]
  );

  const selectCollection = useCallback(
    async (name: string) => {
      setViewMode("table");
      setSelectedRowIds(new Set());
      setFilterRules([]);
      setDraftFilterRules([]);
      setCalendarField("");
      setCalendarEndField("");
      setCalendarDisplayField("");
      setCalendarView("month");
      setCalendarRecordOffsets({});
      setKanbanField("");
      setMapField("");
      setColumnSort(null);
      await refresh(name, 1, "", [], null);
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
    !columnSort &&
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
  const cardSortFields = [
    ...(selected &&
    !fields.some((field) => field.name === selected.primary_key)
      ? [{ name: selected.primary_key, label: selected.primary_key }]
      : []),
    ...fields
      .filter((field) => !is_alias_field(field))
      .map((field) => ({
        name: field.name,
        label: field.label || field.name,
      })),
  ];
  const defaultCardSortField =
    cardSortFields.find((field) => field.name.toLowerCase() === "id") ??
    cardSortFields[0];
  const nonTablePaginationItems = pagination_items(page, pages);
  const primaryKeyColumnVisible = selected
    ? primaryKeyColumnVisibility[selected.name] ?? true
    : true;
  const tableRecords = records;
  const updateColumnVisibility = useCallback(
    (fieldName: string, visible: boolean) => {
      if (!selected) return;
      const names = columnPreferences[selected.name] ?? tableFields.map((field) => field.name);
      const next = visible
        ? [...names, fieldName]
        : names.filter((name) => name !== fieldName);
      setColumnPreferences((preferences) => ({
        ...preferences,
        [selected.name]: next,
      }));
    },
    [columnPreferences, selected, tableFields]
  );
  const updatePrimaryKeyColumnVisibility = useCallback(
    (visible: boolean) => {
      if (!selected) return;
      setPrimaryKeyColumnVisibility((visibility) => ({
        ...visibility,
        [selected.name]: visible,
      }));
    },
    [selected]
  );
  const moveColumn = useCallback(
    (fieldName: string, direction: -1 | 1) => {
      if (!selected) return;
      const names = [...tableFields.map((field) => field.name)];
      const position = names.indexOf(fieldName);
      const target = position + direction;
      if (position < 0 || target < 0 || target >= names.length) return;
      [names[position], names[target]] = [names[target], names[position]];
      setColumnPreferences((preferences) => ({
        ...preferences,
        [selected.name]: names,
      }));
    },
    [selected, tableFields]
  );
  const beginColumnResize = (
    event: React.PointerEvent<HTMLButtonElement>,
    fieldName: string,
    defaultWidth: number
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const key = `${selected?.name ?? ""}:${fieldName}`;
    const currentWidth =
      columnWidths[key] ??
      event.currentTarget.parentElement?.getBoundingClientRect().width ??
      defaultWidth;
    columnResizeRef.current = {
      key,
      startX: event.clientX,
      startWidth: currentWidth || defaultWidth,
    };
    setResizingColumn(key);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const updateColumnResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    const resize = columnResizeRef.current;
    if (!resize) return;
    const width = Math.min(600, Math.max(80, resize.startWidth + event.clientX - resize.startX));
    setColumnWidths((widths) => ({ ...widths, [resize.key]: width }));
  };
  const endColumnResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!columnResizeRef.current) return;
    columnResizeRef.current = null;
    setResizingColumn(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const dateFields = visibleFields.filter((field) => field.type === "datetime");
  const cardImageFields = visibleFields.filter(
    (field) => field.type === "image" || field.interface === "image"
  );
  const cardTextFields = visibleFields.filter(
    (field) =>
      field.name !== selected?.primary_key &&
      !is_alias_field(field) &&
      (field.type === "string" || field.type === "text")
  );
  const resolvedCardImageField =
    cardImageField === "none"
      ? undefined
      : cardImageFields.find((field) => field.name === cardImageField) ??
        cardImageFields[0];
  const resolvedCardTitleField =
    cardTitleField === "none"
      ? undefined
      : cardTextFields.find((field) => field.name === cardTitleField) ??
        cardTextFields[0];
  const cardSubtitleFields = cardTextFields.filter(
    (field) => field.name !== resolvedCardTitleField?.name
  );
  const resolvedCardSubtitleField =
    cardSubtitleField === "none"
      ? undefined
      : cardSubtitleFields.find((field) => field.name === cardSubtitleField) ??
        cardSubtitleFields[0];
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

  const openFilters = useCallback(() => {
    setSidebarSection("layout");
    setViewPanelCollapsed(false);
    setFilterFocusRequest((request) => request + 1);
  }, []);

  const openSidebarSection = useCallback((section: SidebarSection) => {
    setSidebarSection(section);
    setViewPanelCollapsed(false);
  }, []);

  const exportCurrentPage = useCallback(() => {
    if (!selected) return;
    const exportFields = [
      { name: selected.primary_key, label: selected.primary_key },
      ...tableFields.map((field) => ({
        name: field.name,
        label: field.label || field.name,
      })),
    ];
    const escapeCsv = (value: unknown) =>
      `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [
      exportFields.map((field) => escapeCsv(field.label)).join(","),
      ...records.map((record) =>
        exportFields.map((field) => escapeCsv(record[field.name])).join(",")
      ),
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selected.name}-page-${page}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [page, records, selected, tableFields]);

  useEffect(() => {
    if (
      filterFocusRequest === handledFilterFocusRef.current ||
      viewPanelCollapsed
    ) return;
    filterSectionRef.current?.scrollIntoView({ block: "nearest" });
    handledFilterFocusRef.current = filterFocusRequest;
  }, [filterFocusRequest, viewPanelCollapsed]);

  const navbarMeta = useMemo(() => {
    const searchControl = selected ? (
      <ExpandableSearch
        value={searchInput}
        onChange={setSearchInput}
        onSubmit={submitSearch}
        onClear={clearSearch}
        onOpenFilters={openFilters}
        activeFilterCount={filterRules.length}
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
      rightSidebar: viewMode === "table",
      rightSidebarCollapsed: viewPanelCollapsed,
    };
  }, [
    busy,
    clearSearch,
    collections,
    editingRecord,
    filterRules.length,
    openFilters,
    searchInput,
    selectCollection,
    selected,
    submitSearch,
    viewPanelCollapsed,
    viewMode,
  ]);

  useSetNavbarMeta(navbarMeta);

  const setRowSelected = (id: string, checked: boolean) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const currentRecordIds = records.map((record, index) =>
    String(record[selected?.primary_key ?? "id"] ?? index)
  );
  const allRecordsSelected =
    currentRecordIds.length > 0 &&
    currentRecordIds.every((id) => selectedRowIds.has(id));
  const toggleSelectAll = () => {
    setSelectedRowIds((previous) => {
      const next = new Set(previous);
      for (const id of currentRecordIds) {
        if (allRecordsSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="app-page h-full min-h-0 gap-0">
      <PageActionsPortal>
        {viewMode === "record-form" ? (
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8 rounded-full"
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
                className="size-8 rounded-full"
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
              className="size-8 rounded-full"
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
              className="size-8 rounded-full"
              title="Refresh"
              aria-label="Refresh"
              disabled={busy}
              onClick={() => refresh(selected?.name, page, search)}
            >
              <RefreshCw className={cn("size-4", busy && "animate-spin")} />
            </Button>
            {selectedRowIds.size > 0 ? (
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="size-8 rounded-full"
                title={`Delete ${selectedRowIds.size} selected record${selectedRowIds.size === 1 ? "" : "s"}`}
                aria-label={`Delete ${selectedRowIds.size} selected record${selectedRowIds.size === 1 ? "" : "s"}`}
                onClick={deleteSelected}
              >
                <Trash2 className="size-4" />
              </Button>
            ) : null}
            {selected && canCreateRecord ? (
              <Button
                type="button"
                variant="default"
                size="icon"
                className="size-8 rounded-full"
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

      <div className="mb-1 shrink-0 md:hidden">
        <ContentSidebar
          collections={collections}
          activeName={selected?.name}
          onSelect={selectCollection}
          busy={busy}
        />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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
            <div
              className={cn(
                "flex min-h-0 min-w-0 flex-1 flex-col",
                displayLayout === "cards" ? "gap-1" : "gap-4"
              )}
            >
              {displayLayout === "table" ? (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
                <div className="app-scrollbar min-h-0 flex-1 overflow-auto">
                  <table className="w-full min-w-full table-fixed text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-surface-subtle/95">
                      <tr className="border-b border-border bg-surface-subtle/80 text-xs font-semibold text-muted-foreground">
                        {manualOrderingActive ? (
                          <th className="w-9 px-1 py-3">
                            <span className="sr-only">Reorder</span>
                          </th>
                        ) : null}
                        <th className="w-10 px-3 py-3 text-center">
                          <Checkbox
                            checked={allRecordsSelected}
                            onCheckedChange={toggleSelectAll}
                            aria-label="Select all rows"
                            className="size-4 border-2"
                          />
                        </th>
                        {primaryKeyColumnVisible ? <th
                          className="relative px-3 py-3 font-mono"
                          style={{
                            width: columnWidths[`${selected.name}:${selected.primary_key}`] ?? 140,
                          }}
                        >
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="group inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-inherit transition-colors hover:bg-muted"
                                aria-label={`Column options for ${selected.primary_key || "id"}`}
                              >
                                {selected.primary_key || "id"}
                                <ArrowUp className="size-3 opacity-0 transition-opacity group-hover:opacity-70 group-focus-visible:opacity-70" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuItem
                                onSelect={() => updatePrimaryKeyColumnVisibility(false)}
                              >
                                <EyeOff />
                                Hide Field
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <ColumnResizeHandle
                            label={selected.primary_key || "id"}
                            active={resizingColumn === `${selected.name}:${selected.primary_key}`}
                            onPointerDown={(event) =>
                              beginColumnResize(event, selected.primary_key, 140)
                            }
                            onPointerMove={updateColumnResize}
                            onPointerUp={endColumnResize}
                          />
                        </th> : null}
                        {tableFields.map((field) => (
                          <th
                            key={field.name}
                            className={cn(
                              "relative px-3 py-3 whitespace-nowrap",
                              columnAlignments[field.name] === "center" && "text-center",
                              columnAlignments[field.name] === "right" && "text-right"
                            )}
                            style={{
                              width: columnWidths[`${selected.name}:${field.name}`] ?? 180,
                            }}
                          >
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className="group inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-inherit transition-colors hover:bg-muted"
                                  aria-label={`Column options for ${field.label || field.name}`}
                                >
                                  {field.label || field.name}
                                  {filterRules.some((rule) => rule.field === field.name) ? (
                                    <Filter
                                      className="size-3 text-primary"
                                      aria-label="Filtered"
                                    />
                                  ) : null}
                                  {columnSort?.field === field.name ? (
                                    columnSort.direction === "asc"
                                      ? <ArrowUpAZ className="size-3.5" />
                                      : <ArrowDownAZ className="size-3.5" />
                                  ) : (
                                    <ArrowUp className="size-3 opacity-0 transition-opacity group-hover:opacity-70 group-focus-visible:opacity-70" />
                                  )}
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start">
                                <DropdownMenuItem onSelect={() => applyColumnSort({ field: field.name, direction: "asc" })}>
                                  <ArrowUpAZ />
                                  Sort Ascending
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => applyColumnSort({ field: field.name, direction: "desc" })}>
                                  <ArrowDownAZ />
                                  Sort Descending
                                </DropdownMenuItem>
                                {columnSort?.field === field.name ? (
                                  <DropdownMenuItem onSelect={() => applyColumnSort(null)}>
                                    Clear Sort
                                  </DropdownMenuItem>
                                ) : null}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={() => setColumnAlignments((alignments) => ({ ...alignments, [field.name]: "left" }))}>
                                  <AlignLeft />
                                  Left Align
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => setColumnAlignments((alignments) => ({ ...alignments, [field.name]: "center" }))}>
                                  <AlignCenter />
                                  Center Align
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => setColumnAlignments((alignments) => ({ ...alignments, [field.name]: "right" }))}>
                                  <AlignRight />
                                  Right Align
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  disabled={tableFields[0]?.name === field.name}
                                  onSelect={() => moveColumn(field.name, -1)}
                                >
                                  <ChevronLeft />
                                  Move Column Left
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={tableFields[tableFields.length - 1]?.name === field.name}
                                  onSelect={() => moveColumn(field.name, 1)}
                                >
                                  <ChevronRight />
                                  Move Column Right
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  disabled={tableFields.length <= 1}
                                  onSelect={() => updateColumnVisibility(field.name, false)}
                                >
                                  <EyeOff />
                                  Hide Field
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <ColumnResizeHandle
                              label={field.label || field.name}
                              active={resizingColumn === `${selected.name}:${field.name}`}
                              onPointerDown={(event) =>
                                beginColumnResize(event, field.name, 180)
                              }
                              onPointerMove={updateColumnResize}
                              onPointerUp={endColumnResize}
                            />
                          </th>
                        ))}
                        <th className="sticky right-0 z-20 p-0">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="absolute right-0 top-1/2 grid size-8 -translate-y-1/2 place-items-center text-muted-foreground transition-colors hover:text-foreground"
                                aria-label="Add a column"
                                title="Add a column"
                              >
                                <Plus className="size-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
                              {!primaryKeyColumnVisible ? (
                                <DropdownMenuItem
                                  onSelect={() => updatePrimaryKeyColumnVisibility(true)}
                                >
                                  {selected.primary_key || "id"}
                                </DropdownMenuItem>
                              ) : null}
                              {availableTableFields.length === 0 ? (
                                primaryKeyColumnVisible ? (
                                  <DropdownMenuItem disabled>All fields are hidden or already shown</DropdownMenuItem>
                                ) : null
                              ) : availableTableFields.map((field) => {
                                const isVisible = tableFields.some((item) => item.name === field.name);
                                return (
                                  <DropdownMenuItem
                                    key={field.name}
                                    disabled={isVisible}
                                    onSelect={() => updateColumnVisibility(field.name, true)}
                                  >
                                    {field.label || field.name}
                                    {isVisible ? <span className="ml-auto text-xs text-muted-foreground">Shown</span> : null}
                                  </DropdownMenuItem>
                                );
                              })}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.length === 0 ? (
                        <tr>
                          <td
                            colSpan={tableFields.length + 3 + (primaryKeyColumnVisible ? 1 : 0) + (sortField ? 1 : 0)}
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
                        tableRecords.map((record) => {
                          const index = records.indexOf(record);
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
                              onContextMenu={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setRecordContextMenu({
                                  x: Math.min(event.clientX, window.innerWidth - 200),
                                  y: Math.min(event.clientY, window.innerHeight - 190),
                                  record,
                                  rowId,
                                  index,
                                });
                              }}
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
                                onClick={(event) => event.stopPropagation()}
                              >
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={(checked) =>
                                    setRowSelected(rowId, checked === true)
                                  }
                                  aria-label={`Select row ${rowId}`}
                                  className="size-4 border-2"
                                />
                              </td>
                              {primaryKeyColumnVisible ? <td
                                className="px-3 py-3 font-mono text-xs text-muted-foreground"
                                style={{
                                  width: columnWidths[`${selected.name}:${selected.primary_key}`] ?? 140,
                                }}
                              >
                                {String(record[selected.primary_key] ?? "—")}
                              </td> : null}
                              {tableFields.map((field) => {
                                const value = record[field.name];
                                return (
                                  <td
                                    key={field.name}
                                    className={cn(
                                      "min-w-0 px-3 py-3",
                                      columnAlignments[field.name] === "center" && "text-center",
                                      columnAlignments[field.name] === "right" && "text-right"
                                    )}
                                    style={{
                                      width: columnWidths[`${selected.name}:${field.name}`] ?? 180,
                                    }}
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
                              <td className="sticky right-0 z-10 p-0" />
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
                <>
                <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-1">
                  <button
                    type="button"
                    className={cn(
                      "inline-flex cursor-pointer items-center gap-1.5 text-sm transition-colors",
                      allRecordsSelected
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    aria-pressed={allRecordsSelected}
                    onClick={toggleSelectAll}
                  >
                    <CircleCheck
                      className="size-4 shrink-0"
                      aria-hidden="true"
                    />
                    Select All
                  </button>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <button
                      type="button"
                      className="inline-flex cursor-pointer items-center justify-center rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
                      title={`Card size: ${cardSize}. Change card size`}
                      aria-label={`Card size: ${cardSize}. Change card size`}
                      onClick={() =>
                        setCardSize((size) =>
                          size === "small"
                            ? "medium"
                            : size === "medium"
                              ? "large"
                              : size === "large"
                                ? "extra-large"
                                : "small"
                        )
                      }
                    >
                      <LayoutGrid className="size-4" />
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="cursor-pointer px-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                          aria-label="Choose sort field"
                        >
                          {cardSortFields.find(
                            (field) => field.name === columnSort?.field
                          )?.label ?? defaultCardSortField?.label ?? "Sort by"}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {cardSortFields.map((field) => (
                          <DropdownMenuItem
                            key={field.name}
                            onSelect={() =>
                              applyColumnSort({
                                field: field.name,
                                direction: columnSort?.direction ?? "asc",
                              })
                            }
                          >
                            {columnSort?.field === field.name ? (
                              <Check />
                            ) : null}
                            {field.label}
                          </DropdownMenuItem>
                        ))}
                        {columnSort ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => applyColumnSort(null)}>
                              Clear sort
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <button
                      type="button"
                      className="inline-flex cursor-pointer items-center justify-center rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={
                        columnSort?.direction === "desc"
                          ? "Sort ascending"
                          : "Sort descending"
                      }
                      title={
                        columnSort?.direction === "desc"
                          ? "Sort ascending"
                          : "Sort descending"
                      }
                      disabled={!columnSort}
                      onClick={() => {
                        if (!columnSort) return;
                        applyColumnSort({
                          ...columnSort,
                          direction:
                            columnSort.direction === "asc" ? "desc" : "asc",
                        });
                      }}
                    >
                      {columnSort?.direction === "desc" ? (
                        <ArrowDownAZ className="size-4" />
                      ) : (
                        <ArrowUpAZ className="size-4" />
                      )}
                    </button>
                  </div>
                </div>
                <div
                  className={cn(
                    "grid items-start gap-4",
                    cardSize === "small"
                      ? "grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 2xl:grid-cols-9"
                      : cardSize === "medium"
                        ? "grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8"
                        : cardSize === "large"
                          ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5"
                          : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
                  )}
                >
                  {records.map((record, index) => {
                    const rowId = String(record[selected.primary_key] ?? index);
                    const imageValue = resolvedCardImageField
                      ? record[resolvedCardImageField.name]
                      : undefined;
                    const imageUrl =
                      typeof imageValue === "string" ? imageValue : "";
                    return (
                      <article
                        key={rowId}
                        className="relative min-w-0"
                      >
                        <button
                          type="button"
                          aria-label={`${selectedRowIds.has(rowId) ? "Deselect" : "Select"} record ${rowId}`}
                          aria-pressed={selectedRowIds.has(rowId)}
                          onClick={() =>
                            setRowSelected(rowId, !selectedRowIds.has(rowId))
                          }
                          className={cn(
                            "absolute left-2 top-2 z-10 grid size-5 place-items-center rounded-full border-2 bg-card/90 transition-colors",
                            selectedRowIds.has(rowId)
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border text-transparent hover:border-foreground"
                          )}
                        >
                          {selectedRowIds.has(rowId) ? (
                            <Check className="size-3.5" strokeWidth={2.5} />
                          ) : null}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditRecord(record)}
                          aria-label={`Edit record ${rowId}`}
                          className="group block w-full overflow-hidden rounded-xl border border-border bg-card text-left transition-colors hover:border-foreground/30 hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          <div className="relative aspect-square overflow-hidden bg-muted">
                            <div className="absolute inset-0 grid place-items-center text-muted-foreground">
                              <Box className="size-9" strokeWidth={1.5} />
                            </div>
                            {imageUrl ? (
                              <>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={imageUrl}
                                  alt={resolvedCardImageField?.label || resolvedCardImageField?.name || "Record image"}
                                  loading="lazy"
                                  onError={(event) => {
                                    event.currentTarget.style.display = "none";
                                  }}
                                  className="absolute inset-0 size-full object-cover"
                                />
                              </>
                            ) : null}
                          </div>
                          {resolvedCardTitleField || resolvedCardSubtitleField ? (
                            <div className="flex min-w-0 items-center gap-1.5 overflow-hidden px-3 py-2 text-sm">
                              {resolvedCardTitleField ? (
                                <span className="min-w-0 truncate font-semibold">
                                  <FieldValueDisplay
                                    field={resolvedCardTitleField}
                                    value={record[resolvedCardTitleField.name]}
                                    userLabel={userLabels[String(record[resolvedCardTitleField.name])]}
                                  />
                                </span>
                              ) : null}
                              {resolvedCardSubtitleField ? (
                                <>
                                  {resolvedCardTitleField ? (
                                    <span className="shrink-0 text-muted-foreground">·</span>
                                  ) : null}
                                  <span className="min-w-0 truncate text-xs text-muted-foreground">
                                    <FieldValueDisplay
                                      field={resolvedCardSubtitleField}
                                      value={record[resolvedCardSubtitleField.name]}
                                      userLabel={userLabels[String(record[resolvedCardSubtitleField.name])]}
                                    />
                                  </span>
                                </>
                              ) : null}
                            </div>
                          ) : (
                            <p className="truncate px-3 py-2 font-mono text-xs text-muted-foreground">
                              #{rowId}
                            </p>
                          )}
                        </button>
                      </article>
                    );
                  })}
                  {records.length === 0 ? <p className="col-span-full py-12 text-center text-sm text-muted-foreground">No records to display.</p> : null}
                </div>
                </>
              ) : displayLayout === "calendar" ? (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background">
                  {dateFields.length === 0 ? (
                    <p className="p-8 text-center text-sm text-muted-foreground">
                      Add a date/time field to this collection to use the calendar layout.
                    </p>
                  ) : (() => {
                    const selectedDateField =
                      dateFields.find((field) => field.name === calendarField)?.name ??
                      dateFields[0].name;
                    const selectedEndField = dateFields.find(
                      (field) => field.name === calendarEndField
                    )?.name;
                    const calendarDisplayFields = visibleFields.filter(
                      (field) => !is_alias_field(field)
                    );
                    const titleField =
                      calendarDisplayFields.find(
                        (field) => field.name === calendarDisplayField
                      ) ?? calendarDisplayFields[0];
                    const startOfPeriod = new Date(calendarMonth);
                    if (calendarView === "month") {
                      startOfPeriod.setDate(1);
                      startOfPeriod.setDate(
                        startOfPeriod.getDate() -
                          ((startOfPeriod.getDay() - calendarFirstDay + 7) % 7)
                      );
                    } else if (calendarView === "week") {
                      startOfPeriod.setDate(
                        startOfPeriod.getDate() -
                          ((startOfPeriod.getDay() - calendarFirstDay + 7) % 7)
                      );
                    }
                    startOfPeriod.setHours(0, 0, 0, 0);
                    const dayCount =
                      calendarView === "month"
                        ? 42
                        : calendarView === "week"
                          ? 7
                          : 1;
                    const days = Array.from({ length: dayCount }, (_, index) => {
                      const date = new Date(startOfPeriod);
                      date.setDate(startOfPeriod.getDate() + index);
                      return date;
                    });
                    const dayKey = (date: Date) =>
                      `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
                    const recordsByDay = new Map<
                      string,
                      { record: Record<string, unknown>; index: number }[]
                    >();
                    const listRecords: {
                      record: Record<string, unknown>;
                      index: number;
                      date: Date;
                    }[] = [];
                    records.forEach((record, index) => {
                      const rawDate = record[selectedDateField];
                      if (rawDate === null || rawDate === undefined || rawDate === "") return;
                      const date = parse_calendar_date(rawDate);
                      if (!date) return;
                      date.setHours(0, 0, 0, 0);
                      const rawEndDate = selectedEndField
                        ? record[selectedEndField]
                        : undefined;
                      const parsedEndDate = parse_calendar_date(rawEndDate) ?? date;
                      const endDate = new Date(
                        parsedEndDate
                      );
                      endDate.setHours(0, 0, 0, 0);
                      listRecords.push({ record, index, date });
                      for (
                        const eventDate = new Date(date);
                        eventDate <= endDate && eventDate.getTime() - date.getTime() <= 366 * 86400000;
                        eventDate.setDate(eventDate.getDate() + 1)
                      ) {
                        const key = dayKey(eventDate);
                        recordsByDay.set(key, [
                          ...(recordsByDay.get(key) ?? []),
                          { record, index },
                        ]);
                      }
                    });
                    const weekdayLabels = Array.from({ length: 7 }, (_, index) => {
                      const day = (calendarFirstDay + index) % 7;
                      return new Intl.DateTimeFormat(undefined, {
                        weekday: "short",
                      }).format(new Date(2024, 0, 7 + day));
                    });
                    const periodLabel =
                      calendarView === "day"
                        ? calendarMonth.toLocaleDateString(undefined, {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          })
                        : calendarView === "week"
                          ? `${days[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
                          : calendarMonth.toLocaleDateString(undefined, {
                              month: "long",
                              year: "numeric",
                            });
                    const shiftCalendar = (direction: -1 | 1, jump = false) => {
                      const next = new Date(calendarMonth);
                      if (jump) {
                        next.setFullYear(next.getFullYear() + direction);
                      } else if (calendarView === "month") {
                        next.setMonth(next.getMonth() + direction, 1);
                      } else {
                        next.setDate(
                          next.getDate() +
                            direction * (calendarView === "week" ? 7 : 1)
                        );
                      }
                      setCalendarMonth(next);
                    };
                    return (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-2 sm:px-4">
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              aria-label="Previous year"
                              title="Previous year"
                              onClick={() => shiftCalendar(-1, true)}
                            >
                              <ChevronsLeft className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              aria-label={`Previous ${calendarView}`}
                              onClick={() => shiftCalendar(-1)}
                            >
                              <ChevronLeft className="size-4" />
                            </Button>
                            <button
                              type="button"
                              className="h-8 rounded-md px-3 text-sm font-normal text-foreground transition-colors hover:bg-muted"
                              onClick={() => setCalendarMonth(new Date())}
                            >
                              Today
                            </button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              aria-label={`Next ${calendarView}`}
                              onClick={() => shiftCalendar(1)}
                            >
                              <ChevronRight className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              aria-label="Next year"
                              title="Next year"
                              onClick={() => shiftCalendar(1, true)}
                            >
                              <ChevronsRight className="size-4" />
                            </Button>
                          </div>
                          <h2 className="text-sm font-semibold">{periodLabel}</h2>
                          <div className="flex items-center gap-1" aria-label="Calendar view">
                            {(["month", "week", "day", "list"] as const).map((view) => (
                              <button
                                key={view}
                                type="button"
                                aria-pressed={calendarView === view}
                                onClick={() => setCalendarView(view)}
                                className={cn(
                                  "h-8 rounded-md px-3 text-sm capitalize transition-colors hover:bg-muted",
                                  calendarView === view
                                    ? "font-bold text-foreground"
                                    : "font-normal text-muted-foreground"
                                )}
                              >
                                {view}
                              </button>
                            ))}
                          </div>
                        </div>
                        {calendarView === "list" ? (
                          <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto bg-background">
                            {listRecords
                              .sort((left, right) => left.date.getTime() - right.date.getTime())
                              .map(({ record, index, date }) => {
                                const rowId = String(record[selected.primary_key] ?? index);
                                return (
                                  <button
                                    key={rowId}
                                    type="button"
                                    onClick={() => openEditRecord(record)}
                                    className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-surface-subtle"
                                  >
                                    <time
                                      dateTime={date.toISOString()}
                                      className="w-28 shrink-0 text-xs text-muted-foreground"
                                    >
                                      {date.toLocaleDateString(undefined, {
                                        month: "short",
                                        day: "numeric",
                                        year: "numeric",
                                      })}
                                    </time>
                                    <span className="min-w-0 truncate text-sm font-medium">
                                      {titleField
                                        ? <FieldValueDisplay field={titleField} value={record[titleField.name]} userLabel={userLabels[String(record[titleField.name])]} />
                                        : `#${rowId}`}
                                    </span>
                                  </button>
                                );
                              })}
                            {listRecords.length === 0 ? (
                              <p className="p-8 text-center text-sm text-muted-foreground">
                                No records have a date in this field.
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          <>
                            <div className={cn(
                              "grid border-b border-border bg-muted/30 text-center text-xs font-medium text-muted-foreground",
                              calendarView === "day" ? "grid-cols-1" : "grid-cols-7"
                            )}>
                              {(calendarView === "day"
                                ? [weekdayLabels[calendarMonth.getDay()]]
                                : weekdayLabels
                              ).map((day) => (
                                <div key={day} className="py-2">{day}</div>
                              ))}
                            </div>
                            <div
                              className={cn(
                                "grid min-h-0",
                                calendarView === "month"
                                  ? "grid-cols-7"
                                  : calendarView === "week"
                                    ? "grid-cols-7"
                                    : "grid-cols-1"
                              )}
                            >
                              {days.map((date) => {
                                const key = dayKey(date);
                                const dayRecords = recordsByDay.get(key) ?? [];
                                const recordOffset =
                                  (calendarRecordOffsets[key] ?? 0) % Math.max(dayRecords.length, 1);
                                const visibleRecord = dayRecords[recordOffset];
                                const inMonth =
                                  date.getMonth() === calendarMonth.getMonth();
                                const today =
                                  date.toDateString() === new Date().toDateString();
                                return (
                                  <div
                                    key={key}
                                    className={cn(
                                      "min-h-20 overflow-hidden border-b border-r border-border p-1.5 last:border-r-0 sm:min-h-20 sm:p-2",
                                      !inMonth &&
                                        calendarView === "month" &&
                                        "bg-muted/20 text-muted-foreground/60",
                                      today && "bg-muted-foreground/20",
                                    )}
                                  >
                                    <button
                                      type="button"
                                      aria-label={`Show ${date.toLocaleDateString()}`}
                                      onClick={() => {
                                        setCalendarMonth(date);
                                        setCalendarView("day");
                                      }}
                                      className={cn(
                                        "mb-1 flex h-6 w-full items-center justify-end px-1.5 text-xs",
                                        today && "font-semibold text-foreground"
                                      )}
                                    >
                                      {date.getDate()}
                                    </button>
                                    <div className="space-y-1">
                                      {visibleRecord ? (
                                        <button
                                          type="button"
                                          onClick={() => openEditRecord(visibleRecord.record)}
                                          className="block w-full truncate rounded-md bg-primary/10 px-1.5 py-1 text-left text-xs text-foreground hover:bg-primary/20"
                                        >
                                          {titleField
                                            ? <FieldValueDisplay field={titleField} value={visibleRecord.record[titleField.name]} userLabel={userLabels[String(visibleRecord.record[titleField.name])]} />
                                            : `#${String(visibleRecord.record[selected.primary_key] ?? visibleRecord.index)}`}
                                        </button>
                                      ) : null}
                                      {dayRecords.length > 1 ? (
                                        <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                                          <button
                                            type="button"
                                            aria-label={`Previous record on ${date.toLocaleDateString()}`}
                                            className="rounded px-1 hover:bg-muted hover:text-foreground"
                                            onClick={() =>
                                              setCalendarRecordOffsets((offsets) => ({
                                                ...offsets,
                                                [key]:
                                                  (recordOffset - 1 + dayRecords.length) %
                                                  dayRecords.length,
                                              }))
                                            }
                                          >
                                            <ChevronLeft className="size-3" aria-hidden="true" />
                                          </button>
                                          <span>
                                            {recordOffset + 1}/{dayRecords.length}
                                          </span>
                                          <button
                                            type="button"
                                            aria-label={`Next record on ${date.toLocaleDateString()}`}
                                            className="rounded px-1 hover:bg-muted hover:text-foreground"
                                            onClick={() =>
                                              setCalendarRecordOffsets((offsets) => ({
                                                ...offsets,
                                                [key]: (recordOffset + 1) % dayRecords.length,
                                              }))
                                            }
                                          >
                                            <ChevronRight className="size-3" aria-hidden="true" />
                                          </button>
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </>
                    );
                  })()}
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
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-3 text-xs text-muted-foreground">
              <span>
                Page {page} of {pages} · {total} records
              </span>
              <nav className="flex items-center gap-1" aria-label="Content pages">
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
                {nonTablePaginationItems.map((item) =>
                  typeof item === "number" ? (
                    <Button
                      key={item}
                      type="button"
                      variant={page === item ? "secondary" : "ghost"}
                      size="icon-xs"
                      className="min-w-7"
                      disabled={busy}
                      aria-current={page === item ? "page" : undefined}
                      aria-label={`Go to page ${item}`}
                      onClick={() => refresh(selected?.name, item)}
                    >
                      {item}
                    </Button>
                  ) : (
                    <span
                      key={item}
                      aria-hidden="true"
                      className="px-1 text-muted-foreground"
                    >
                      …
                    </span>
                  )
                )}
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
              </nav>
            </div>
          ) : null}
      </div>

      {recordContextMenu ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close record actions"
            onClick={() => setRecordContextMenu(null)}
            onContextMenu={(event) => {
              event.preventDefault();
              setRecordContextMenu(null);
            }}
          />
          <div
            role="menu"
            aria-label={`Actions for record ${recordContextMenu.rowId}`}
            className="fixed z-50 min-w-48 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-[0_16px_40px_-20px_rgb(0_0_0/0.35)]"
            style={{ left: Math.max(8, recordContextMenu.x), top: Math.max(8, recordContextMenu.y) }}
            onContextMenu={(event) => event.preventDefault()}
          >
            <button
              type="button"
              role="menuitem"
              className="flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent"
              onClick={() => {
                openEditRecord(recordContextMenu.record);
                setRecordContextMenu(null);
              }}
            >
              <Pencil className="size-4" />
              Edit record
            </button>
            {manualOrderingActive ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!canReorderRecords || reordering || recordContextMenu.index === 0}
                  className="flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                  onClick={() => {
                    moveRecord(recordContextMenu.index, recordContextMenu.index - 1);
                    setRecordContextMenu(null);
                  }}
                >
                  <ArrowUp className="size-4" />
                  Move up
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={
                    !canReorderRecords ||
                    reordering ||
                    recordContextMenu.index === records.length - 1
                  }
                  className="flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                  onClick={() => {
                    moveRecord(recordContextMenu.index, recordContextMenu.index + 1);
                    setRecordContextMenu(null);
                  }}
                >
                  <ArrowDown className="size-4" />
                  Move down
                </button>
              </>
            ) : null}
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              role="menuitem"
              className="flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
              onClick={() => {
                void deleteRecord(recordContextMenu.record);
                setRecordContextMenu(null);
              }}
            >
              <Trash2 className="size-4" />
              Delete record
            </button>
          </div>
        </>
      ) : null}

      <PageRightSidebarPortal>
      {selected && viewMode === "table" ? (
        <aside
          className={cn(
            "flex h-full min-h-0 w-full flex-col border-l border-border bg-card",
            viewPanelCollapsed
              ? "lg:w-14"
              : "border border-border lg:w-80"
          )}
        >
          {viewPanelCollapsed ? (
            <div className="flex h-full flex-col items-center py-2">
              <button
                type="button"
                className="grid size-12 place-items-center text-foreground transition-colors hover:bg-muted/70"
                aria-label="Expand layout options"
                title="Layout Options"
                onClick={() => openSidebarSection("layout")}
              >
                <Layers className="size-4" strokeWidth={2.5} />
              </button>
              <button
                type="button"
                className="grid size-12 place-items-center border-t border-border text-foreground transition-colors hover:bg-muted/70"
                aria-label="Refresh content"
                title="Auto Refresh"
                onClick={() => openSidebarSection("refresh")}
              >
                <RefreshCw className={cn("size-4", busy && "animate-spin")} strokeWidth={2.5} />
              </button>
              <button
                type="button"
                className="grid size-12 place-items-center border-t border-border text-foreground transition-colors hover:bg-muted/70"
                aria-label="Open import and export options"
                title="Import / Export"
                onClick={() => openSidebarSection("import")}
              >
                <ArrowDownUp className="size-4" strokeWidth={2.5} />
              </button>
              <button
                type="button"
                className="mt-auto grid size-12 place-items-center border-t border-border text-foreground transition-colors hover:bg-muted/70"
                aria-label="Open AI Assistant"
                title="AI Assistant"
                onClick={() => openSidebarSection("assistant")}
              >
                <Sparkles className="size-4" strokeWidth={2.5} />
              </button>
            </div>
          ) : (
            <>
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              {sidebarSection === "layout" ? (
                <Layers className="size-4 shrink-0 text-muted-foreground" />
              ) : sidebarSection === "refresh" ? (
                <RefreshCw className="size-4 shrink-0 text-muted-foreground" />
              ) : sidebarSection === "import" ? (
                <ArrowDownUp className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <Sparkles className="size-4 shrink-0 text-muted-foreground" />
              )}
              <h2 className="truncate text-sm font-semibold">
                {sidebarSection === "layout"
                  ? "Layout Options"
                  : sidebarSection === "refresh"
                    ? "Auto Refresh"
                    : sidebarSection === "import"
                      ? "Import / Export"
                      : "AI Assistant"}
              </h2>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Collapse right sidebar"
              title="Collapse right sidebar"
              onClick={() => setViewPanelCollapsed(true)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          {sidebarSection === "layout" ? (
          <div className="cms-sidebar-scroll min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          <section className="space-y-3">
            <div className="space-y-2">
              <span className="block text-sm font-semibold">Layout</span>
              <Select
                value={displayLayout}
                onValueChange={(value) => {
                  if (is_display_layout(value)) setDisplayLayout(value);
                }}
              >
                <SelectTrigger aria-label="Layout" className="w-full font-normal">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start" className="min-w-(--radix-select-trigger-width)">
                  {display_layouts.map(({ value, label, Icon }) => (
                    <SelectItem key={value} value={value}>
                      <Icon className="size-4 text-muted-foreground" />
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {displayLayout === "cards" ? (
              <>
                <div className="space-y-2">
                  <span className="flex items-center gap-2">
                    <ImageIcon className="size-4 text-muted-foreground" />
                    Image Source
                  </span>
                  <Select
                    value={resolvedCardImageField?.name ?? "none"}
                    onValueChange={setCardImageField}
                  >
                    <SelectTrigger aria-label="Image Source" className="w-full font-normal">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="start" className="min-w-(--radix-select-trigger-width)">
                      <SelectItem value="none">No image</SelectItem>
                      {cardImageFields.map((field) => (
                        <SelectItem key={field.name} value={field.name}>
                          {field.label || field.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <span className="block text-sm font-semibold">Title</span>
                  <Select
                    value={resolvedCardTitleField?.name ?? "none"}
                    onValueChange={setCardTitleField}
                  >
                    <SelectTrigger aria-label="Title" className="w-full font-normal">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="start" className="min-w-(--radix-select-trigger-width)">
                      <SelectItem value="none">No title</SelectItem>
                      {cardTextFields.map((field) => (
                        <SelectItem key={field.name} value={field.name}>
                          {field.label || field.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <span className="block text-sm font-semibold">Subtitle</span>
                  <Select
                    value={resolvedCardSubtitleField?.name ?? "none"}
                    onValueChange={setCardSubtitleField}
                  >
                    <SelectTrigger aria-label="Subtitle" className="w-full font-normal">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="start" className="min-w-(--radix-select-trigger-width)">
                      <SelectItem value="none">No subtitle</SelectItem>
                      {cardSubtitleFields.map((field) => (
                        <SelectItem key={field.name} value={field.name}>
                          {field.label || field.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : null}
            {displayLayout === "calendar" ? (
              <>
                <label className="block space-y-1.5 text-xs text-muted-foreground">
                  Start Date Field
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                    value={calendarField || dateFields[0]?.name || ""}
                    onChange={(event) => setCalendarField(event.target.value)}
                  >
                    {dateFields.map((field) => (
                      <option key={field.name} value={field.name}>
                        {field.label || field.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1.5 text-xs text-muted-foreground">
                  End Date Field
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                    value={calendarEndField}
                    onChange={(event) => setCalendarEndField(event.target.value)}
                  >
                    <option value="">Optional</option>
                    {dateFields
                      .filter((field) => field.name !== (calendarField || dateFields[0]?.name))
                      .map((field) => (
                        <option key={field.name} value={field.name}>
                          {field.label || field.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="block space-y-1.5 text-xs text-muted-foreground">
                  Display Template
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                    value={calendarDisplayField || cardTextFields[0]?.name || ""}
                    onChange={(event) => setCalendarDisplayField(event.target.value)}
                  >
                    {visibleFields
                      .filter((field) => !is_alias_field(field))
                      .map((field) => (
                      <option key={field.name} value={field.name}>
                        {field.label || field.name}
                      </option>
                      ))}
                  </select>
                </label>
                <label className="block space-y-1.5 text-xs text-muted-foreground">
                  First Day of the Week
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                    value={calendarFirstDay}
                    onChange={(event) => setCalendarFirstDay(Number(event.target.value))}
                  >
                    {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map(
                      (day, index) => (
                        <option key={day} value={index}>{day}</option>
                      )
                    )}
                  </select>
                </label>
              </>
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

          <section ref={filterSectionRef} className="space-y-3 border-t border-border pt-4">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Filters</h2>
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

          </div>
          ) : sidebarSection === "refresh" ? (
            <section className="flex flex-1 flex-col gap-3 p-4">
              <p className="text-sm text-muted-foreground">
                Reload the current collection and page to get the latest records.
              </p>
              <Button
                type="button"
                className="w-full"
                disabled={busy}
                onClick={() => void refresh(selected.name, page, search)}
              >
                <RefreshCw className={cn("size-4", busy && "animate-spin")} />
                Refresh content
              </Button>
            </section>
          ) : sidebarSection === "import" ? (
            <section className="flex flex-1 flex-col gap-4 p-4">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Import</h3>
                <p className="text-xs text-muted-foreground">
                  Record import is not available yet.
                </p>
              </div>
              <div className="space-y-2 border-t border-border pt-4">
                <h3 className="text-sm font-semibold">Export</h3>
                <p className="text-xs text-muted-foreground">
                  Download the records on the current page as a CSV file.
                </p>
                <Button
                  type="button"
                  className="w-full"
                  variant="outline"
                  disabled={records.length === 0}
                  onClick={exportCurrentPage}
                >
                  <ArrowDownUp className="size-4" />
                  Export current page
                </Button>
              </div>
            </section>
          ) : (
          <section className="flex min-h-0 flex-1 flex-col gap-3 p-4">
            <div className="cms-sidebar-scroll flex-1 space-y-2 overflow-y-auto rounded-lg bg-muted/40 p-3">
              {chatMessages.length === 0 ? (
                <div className="flex min-h-32 flex-col items-center justify-center gap-3 text-center">
                  <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
                    <MessageSquareText className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-medium">Build with AI Assistant</p>
                    <p className="mt-1 text-xs text-muted-foreground">AI responses may be inaccurate</p>
                  </div>
                </div>
              ) : chatMessages.map((message, index) => (
                <p key={`${index}-${message}`} className="ml-auto w-fit max-w-[90%] rounded-lg bg-primary px-2.5 py-1.5 text-xs text-primary-foreground">
                  {message}
                </p>
              ))}
            </div>
            <form
              className="flex shrink-0 items-center gap-2 rounded-xl border border-input p-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!chatInput.trim()) return;
                setChatMessages((messages) => [...messages, chatInput.trim()]);
                setChatInput("");
              }}
            >
              <Input value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Type your message here..."               className="h-9 min-w-0 border-0 px-1 text-xs shadow-none" />
              <Button type="submit" size="icon" className="size-8 shrink-0" aria-label="Send question" disabled={!chatInput.trim()}>
                <Send className="size-4" />
              </Button>
            </form>
          </section>
          )}
            </>
          )}
        </aside>
      ) : null}
      </PageRightSidebarPortal>
      </div>

      {confirm_dialog}
    </div>
  );
}
