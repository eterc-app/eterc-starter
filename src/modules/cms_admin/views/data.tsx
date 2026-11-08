"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Bookmark,
  Check,
  Columns2,
  Database,
  EllipsisVertical,
  EyeOff,
  FilePlus2,
  GripVertical,
  Info,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { PageActions } from "@/components/app/PageActions";
import { PageActionsPortal, useSetNavbarMeta } from "@/components/app/PageActionsSlot";
import { useConfirm } from "@/components/app/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import { ColorPicker } from "@/components/ui/color-picker";
import { IconPicker } from "@/components/ui/icon-picker";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { EtViewProps } from "@/engine/views-registry";
import type {
  CmsBootstrapReport,
  CmsCollectionOrderingMode,
  CmsCollectionSort,
  CmsCollectionWithFields,
  CmsField,
} from "@/modules/cms/cms-types";
import { cms_interface_uses_choices } from "@/modules/cms/cms-interfaces";
import { CollectionDialog } from "./CollectionDialog";
import { CollectionOrderingControl } from "./CollectionOrderingControl";
import { FieldDrawer } from "./FieldDrawer";
import {
  empty_field_form,
  field_form_from_field,
  parse_field_default,
  type FieldFormState,
} from "./field-form";
import { BusyButton, EmptyState, cms_call } from "./ui";

interface Snapshot {
  collections?: CmsCollectionWithFields[];
  selected?: CmsCollectionWithFields | null;
  fields?: CmsField[];
}

function collection_settings(collection: CmsCollectionWithFields | null) {
  const hasManualSort = Boolean(
    collection?.fields.some(
      (field) =>
        field.options?._eterc_system_field === "sort" ||
        (field.name === "sort" &&
          field.type === "integer" &&
          field.interface === "number")
    )
  );
  return {
    label: collection?.label || "",
    icon: collection?.icon || "box",
    color: collection?.color || "",
    display_template: collection?.display_template || "",
    note: collection?.note || "",
    hidden: collection?.hidden || false,
    singleton: collection?.singleton || false,
    ordering_mode:
      collection?.ordering_mode ?? (hasManualSort ? "manual" : "default"),
    default_order: collection?.default_order ?? [],
  };
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
  const [fieldForm, setFieldForm] = useState<FieldFormState>(empty_field_form());
  const [fieldSaving, setFieldSaving] = useState(false);
  const [fieldLayoutSaving, setFieldLayoutSaving] = useState(false);
  const [draggedField, setDraggedField] = useState<string | null>(null);
  const [dropTargetField, setDropTargetField] = useState<string | null>(null);
  const fieldCardRefs = useRef(new Map<string, HTMLDivElement>());
  const previousFieldRects = useRef<Map<string, DOMRect> | null>(null);

  // Bootstrap Dialog states
  const [bootstrapOpen, setBootstrapOpen] = useState(false);
  const [bootstrapReport, setBootstrapReport] = useState<CmsBootstrapReport | null>(null);
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [bootstrapApplying, setBootstrapApplying] = useState(false);

  // Live collection setup settings (matching Directus Collection Setup)
  const [colSettings, setColSettings] = useState(() =>
    collection_settings(selected)
  );

  const saveCollectionSettings = useCallback(async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const updated = await cms_call<CmsCollectionWithFields>("data_collection_update", {
        name: selected.name,
        label: colSettings.label || selected.name,
        icon: colSettings.icon,
        color: colSettings.color,
        display_template: colSettings.display_template,
        note: colSettings.note,
        hidden: colSettings.hidden,
        singleton: colSettings.singleton,
        ordering_mode: colSettings.ordering_mode,
        default_order: colSettings.default_order,
      });
      setSelected(updated);
      setColSettings(collection_settings(updated));
      setCollections((prev) =>
        prev.map((c) => (c.name === updated.name ? updated : c))
      );
      toast.success("Collection settings saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update collection.");
    } finally {
      setBusy(false);
    }
  }, [colSettings, selected]);

  const orderingFields = fields
    .filter(
      (field) =>
        field.name !== selected?.primary_key &&
        field.type !== "alias" &&
        field.options?._eterc_system_field !== "sort" &&
        !(field.name === "sort" && field.type === "integer" && field.interface === "number")
    )
    .map((field) => ({
      name: field.name,
      label: field.label || field.name,
    }));

  const applySnapshot = useCallback((snapshot: Snapshot) => {
    const next_selected = snapshot.selected ?? null;
    setCollections(snapshot.collections ?? []);
    setSelected(next_selected);
    setColSettings(collection_settings(next_selected));
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
    setFieldForm(empty_field_form());
    setFieldOpen(true);
  }, []);

  const openEditField = useCallback((field: CmsField) => {
    setEditingField(field);
    setFieldForm(field_form_from_field(field));
    setFieldOpen(true);
  }, []);

  const saveField = useCallback(async () => {
    if (!selected) return;
    setFieldSaving(true);
    try {
      const options: Record<string, unknown> = {
        ...(fieldForm.options ?? {}),
      };
      if (cms_interface_uses_choices(fieldForm.interface)) {
        options.choices = fieldForm.choices;
      }
      const defaultValue = parse_field_default(
        fieldForm.type,
        fieldForm.defaultValue
      );
      if (defaultValue === undefined) {
        delete options.default;
      } else {
        options.default = defaultValue;
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
          group: fieldForm.group,
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
          group: fieldForm.group,
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

  useLayoutEffect(() => {
    const previousRects = previousFieldRects.current;
    if (!previousRects) return;
    previousFieldRects.current = null;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const [name, element] of fieldCardRefs.current) {
      const previous = previousRects.get(name);
      if (!previous) continue;
      const current = element.getBoundingClientRect();
      const deltaX = previous.left - current.left;
      const deltaY = previous.top - current.top;
      if (deltaX === 0 && deltaY === 0) continue;
      element.animate(
        [
          { transform: `translate(${deltaX}px, ${deltaY}px)` },
          { transform: "translate(0, 0)" },
        ],
        { duration: 220, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }
      );
    }
  }, [fields]);

  const reorderFields = useCallback(
    async (sourceName: string, targetName: string) => {
      if (!selected || sourceName === targetName || fieldLayoutSaving) return;
      const sourceIndex = fields.findIndex((field) => field.name === sourceName);
      const targetIndex = fields.findIndex((field) => field.name === targetName);
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;

      previousFieldRects.current = new Map(
        Array.from(fieldCardRefs.current, ([name, element]) => [
          name,
          element.getBoundingClientRect(),
        ])
      );
      const reordered = [...fields];
      const [moved] = reordered.splice(sourceIndex, 1);
      reordered.splice(targetIndex, 0, moved);
      setFields(reordered);
      setDraggedField(null);
      setDropTargetField(null);
      setFieldLayoutSaving(true);
      try {
        const updated = await cms_call<CmsField[]>("data_fields_reorder", {
          collection: selected.name,
          fields: reordered.map((field) => field.name),
        });
        setFields(updated);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not reorder fields.");
        await refresh(selected.name);
      } finally {
        setFieldLayoutSaving(false);
      }
    },
    [fieldLayoutSaving, fields, refresh, selected]
  );

  const cancelFieldDrag = useCallback(() => {
    setDraggedField(null);
    setDropTargetField(null);
    previousFieldRects.current = null;
  }, []);

  const setFieldWidth = useCallback(
    async (field: CmsField, width: "half" | "full") => {
      if (!selected || fieldLayoutSaving) return;
      setFieldLayoutSaving(true);
      try {
        await cms_call("data_field_update", {
          collection: selected.name,
          name: field.name,
          options: { ...field.options, width },
        });
        setFields((current) =>
          current.map((item) =>
            item.name === field.name
              ? { ...item, options: { ...item.options, width } }
              : item
          )
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not update field layout.");
      } finally {
        setFieldLayoutSaving(false);
      }
    },
    [fieldLayoutSaving, selected]
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
      const snapshot = await cms_call<Snapshot>("data_refresh", {
        collection: selected?.name ?? "",
      });
      applySnapshot(snapshot);
      toast.success("Database schema refreshed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not refresh the schema.");
    } finally {
      setBusy(false);
    }
  }, [applySnapshot, selected]);

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

  const backToCollections = useCallback(() => {
    setSelected(null);
    setFields([]);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("collection");
      url.searchParams.delete("new");
      window.history.replaceState(null, "", url);
    }
  }, []);

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
      onBack: backToCollections,
      badge: <Bookmark className="size-3.5 text-muted-foreground ml-1" />,
    };
  }, [backToCollections, selected]);

  useSetNavbarMeta(navbarMeta);

  return (
    <div className="app-page">
      <PageActionsPortal>
        <PageActions
          items={[
            ...(selected
              ? [
                {
                  label: "Save collection settings",
                  icon: <Check className="size-4" />,
                  variant: "default" as const,
                  onSelect: saveCollectionSettings,
                },
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
                {
                  label: "Delete collection",
                  icon: <Trash2 className="size-4" />,
                  variant: "destructive" as const,
                  onSelect: deleteCollection,
                },
              ]
              : [
                {
                  label: "New collection",
                  icon: <Plus className="size-4" />,
                  variant: "default" as const,
                  onSelect: openCreateCollection,
                },
              ]),
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

      <div className="min-w-0" aria-busy={busy}>
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
                <div className="grid grid-cols-1 gap-2">
                  {collections.map((col) => (
                    <Card
                      key={col.name}
                      className="group h-13 cursor-pointer flex-row items-center justify-between gap-3 px-4 py-0 transition-all hover:border-foreground/30"
                      onClick={() => selectCollection(col.name)}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-surface-subtle text-foreground">
                          <DynamicIcon
                            name={col.icon || "table-2"}
                            color={col.color || undefined}
                            className="size-4"
                          />
                        </span>
                        <div className="flex min-w-0 items-center gap-2">
                          <CardTitle className="truncate text-sm font-semibold text-foreground">
                            {col.label || col.name}
                          </CardTitle>
                          <span className="truncate font-mono text-xs text-muted-foreground">
                            {col.name}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                        <div className="hidden items-center gap-1.5 sm:flex">
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
                    </Card>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* COLLECTION SCHEMA STUDIO (Directus Style) */
            <div className="space-y-6">
              {/* Fields List */}
              <div className="grid grid-cols-1 gap-2.5">
                {fields.length === 0 ? (
                  <div className="rounded-xl border border-border bg-card p-8 text-center text-xs text-muted-foreground">
                    No fields created yet for this collection.
                  </div>
                ) : (
                  fields.map((field) => {
                    const isPk = field.name === selected.primary_key;
                    return (
                      <div
                        key={field.name}
                        ref={(element) => {
                          if (element) fieldCardRefs.current.set(field.name, element);
                          else fieldCardRefs.current.delete(field.name);
                        }}
                        onDragOver={(event) => {
                          if (!draggedField || draggedField === field.name) return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          setDropTargetField(field.name);
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          if (draggedField) void reorderFields(draggedField, field.name);
                        }}
                        onClick={() => openEditField(field)}
                        className={`group relative flex h-13 cursor-pointer items-center justify-between rounded-xl border border-border bg-card px-4 transition-[border-color,background-color,opacity,transform] duration-200 ease-out hover:border-foreground/30 ${
                          draggedField === field.name ? "z-10 scale-[1.015] border-foreground/50 opacity-80" : ""} ${
                          dropTargetField === field.name && draggedField !== field.name
                            ? "border-primary bg-primary/5"
                            : ""
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <button
                            type="button"
                            draggable={!fieldLayoutSaving}
                            aria-label={`Reorder ${field.name}`}
                            title="Drag to reorder"
                            onClick={(event) => event.stopPropagation()}
                            onDragStart={(event) => {
                              event.stopPropagation();
                              event.dataTransfer.effectAllowed = "move";
                              event.dataTransfer.setData("text/plain", field.name);
                              setDraggedField(field.name);
                            }}
                            onDragEnd={cancelFieldDrag}
                            className="shrink-0 cursor-grab text-muted-foreground transition-colors hover:text-foreground active:cursor-grabbing"
                          >
                            <GripVertical className="size-5" strokeWidth={2.25} />
                          </button>
                          <button
                            type="button"
                            className="truncate font-mono text-left text-sm font-medium text-foreground hover:underline"
                            onClick={(event) => {
                              event.stopPropagation();
                              openEditField(field);
                            }}
                            aria-label={`Edit ${field.label || field.name}${field.required ? ", required" : ""}`}
                          >
                            {field.label || field.name}
                            {field.required ? (
                              <span
                                className="ml-0.5 text-base font-semibold text-foreground"
                                aria-hidden="true"
                                title="Required"
                              >
                                *
                              </span>
                            ) : null}
                            <span className="ml-2 font-sans text-xs font-normal text-muted-foreground">
                              ({field.interface || field.type})
                            </span>
                          </button>
                          {isPk ? (
                            <span title="Primary key">
                              <KeyRound
                                className="size-4 shrink-0 rotate-45 text-muted-foreground"
                                strokeWidth={2.75}
                                aria-label="Primary key"
                              />
                            </span>
                          ) : null}
                        </div>

                        <div
                          className="flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          {field.hidden ? (
                            <span title="Hidden field">
                              <EyeOff
                                className="size-4 text-muted-foreground"
                                strokeWidth={2.75}
                                aria-label="Hidden field"
                              />
                            </span>
                          ) : null}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Actions for ${field.label || field.name}`}
                                title="Field actions"
                              >
                                <EllipsisVertical className="size-4" strokeWidth={2.75} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => openEditField(field)}>
                                <Pencil />
                                Edit field
                              </DropdownMenuItem>
                              {!isPk ? (
                                <>
                                  <DropdownMenuItem
                                    disabled={fieldLayoutSaving}
                                    onSelect={() =>
                                      void setFieldWidth(
                                        field,
                                        field.options.width === "half" ? "full" : "half"
                                      )
                                    }
                                  >
                                    <Columns2 />
                                    {field.options.width === "half"
                                      ? "Use full width"
                                      : "Use half width"}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onSelect={() => void deleteField(field)}
                                  >
                                    <Trash2 />
                                    Delete field
                                  </DropdownMenuItem>
                                </>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={openCreateField}
                  className="flex h-11 w-full items-center justify-center rounded-xl bg-foreground text-background font-medium text-sm transition-opacity hover:opacity-90 shadow-xs"
                >
                  Create Field
                </button>
              </div>

              {/* Directus-style Collection Setup */}
              <div className="space-y-4 pt-16">
                <div className="flex items-center gap-2">
                  <DynamicIcon
                    name={colSettings.icon || "box"}
                    size={18}
                    color={colSettings.color ? colSettings.color : undefined}
                    className="text-foreground shrink-0"
                  />
                  <h3 className="text-sm font-semibold text-foreground">Collection Setup</h3>
                </div>

                <div className="space-y-4 border-t border-border pt-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold text-muted-foreground">Collection</Label>
                    <Input
                      value={selected.name}
                      disabled
                      className="rounded-xl bg-card border-input font-mono opacity-80"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold text-muted-foreground">Note</Label>
                    <Input
                      value={colSettings.note}
                      placeholder="Collection description"
                      className="rounded-xl bg-card border-input"
                      onChange={(e) =>
                        setColSettings((s) => ({ ...s, note: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold text-muted-foreground">Icon</Label>
                    <IconPicker
                      value={colSettings.icon}
                      onChange={(icon) =>
                        setColSettings((s) => ({ ...s, icon }))
                      }
                      color={colSettings.color}
                      placeholder="School, box, user, etc."
                      className="h-13 rounded-xl"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-xs font-semibold text-muted-foreground">Color</Label>
                    <ColorPicker
                      value={colSettings.color}
                      onChange={(color) =>
                        setColSettings((s) => ({ ...s, color }))
                      }
                      className="rounded-xl"
                    />
                  </div>
                </div>

                <CollectionOrderingControl
                  mode={colSettings.ordering_mode as CmsCollectionOrderingMode}
                  defaultOrder={colSettings.default_order as CmsCollectionSort[]}
                  fields={orderingFields}
                  hasManualSort={selected.fields.some(
                    (field) =>
                      field.options?._eterc_system_field === "sort" ||
                      (field.name === "sort" &&
                        field.type === "integer" &&
                        field.interface === "number")
                  )}
                  onModeChange={(ordering_mode) =>
                    setColSettings((current) => ({ ...current, ordering_mode }))
                  }
                  onDefaultOrderChange={(default_order) =>
                    setColSettings((current) => ({ ...current, default_order }))
                  }
                />

                <div className="grid gap-2">
                  <Label className="text-xs font-semibold text-muted-foreground">Display Template</Label>
                  <div className="flex h-13 items-center rounded-xl border border-input bg-card px-3">
                    <Input
                      placeholder="e.g. {{first_name}} {{last_name}}"
                      value={colSettings.display_template}
                      onChange={(e) =>
                        setColSettings((s) => ({ ...s, display_template: e.target.value }))
                      }
                      className="h-full flex-1 border-none bg-transparent shadow-none text-xs px-1 focus-visible:outline-none"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex h-13 items-center justify-between rounded-xl border border-input bg-card px-4">
                    <span className="text-sm font-medium text-foreground">Hide within the App</span>
                    <Switch
                      checked={colSettings.hidden}
                      onCheckedChange={(hidden) =>
                        setColSettings((s) => ({ ...s, hidden }))
                      }
                    />
                  </div>
                  <div className="flex h-13 items-center justify-between rounded-xl border border-input bg-card px-4">
                    <span className="text-sm font-medium text-foreground">Treat as single object</span>
                    <Switch
                      checked={colSettings.singleton}
                      onCheckedChange={(singleton) =>
                        setColSettings((s) => ({ ...s, singleton }))
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label className="text-xs font-semibold text-muted-foreground">Collection Naming Translations</Label>
                  <div
                    role="status"
                    className="flex h-13 items-center gap-3 rounded-xl border border-border bg-card px-4 text-sm text-foreground"
                  >
                    <Info className="size-5 shrink-0" />
                    <span>No items</span>
                  </div>
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
          setColSettings(collection_settings(col));
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
        key={editingField ? `edit-${editingField.name}` : "create"}
        open={fieldOpen}
        onOpenChange={setFieldOpen}
        collectionName={selected?.label || selected?.name || ""}
        collections={collections}
        collectionFields={fields}
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
