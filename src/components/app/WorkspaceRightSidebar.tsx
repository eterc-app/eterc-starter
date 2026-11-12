"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUp,
  Bot,
  Database,
  FileJson2,
  Plus,
  Sparkles,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  CmsCollectionWithFields,
  CmsField,
} from "@/modules/cms/cms-types";
import { cms_call } from "@/modules/cms_admin/views/ui";
import {
  collection_schema,
  csv_cell,
  download_text,
  import_field_value,
  parse_csv,
} from "@/modules/cms_admin/views/workspace-transfer";

interface DataSnapshot {
  collections?: CmsCollectionWithFields[];
  selected?: CmsCollectionWithFields | null;
  fields?: CmsField[];
  records?: Record<string, unknown>[];
  pages?: number;
}

export function WorkspaceRightSidebar({ collapsed = false }: { collapsed?: boolean }) {
  const [collections, setCollections] = useState<CmsCollectionWithFields[]>([]);
  const [collectionName, setCollectionName] = useState("");
  const [loadingCollections, setLoadingCollections] = useState(true);
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState<"assistant" | "data">("assistant");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const collection = useMemo(
    () => collections.find((item) => item.name === collectionName) ?? null,
    [collectionName, collections]
  );

  const loadCollections = useCallback(async () => {
    setLoadingCollections(true);
    try {
      const snapshot = await cms_call<DataSnapshot>("data_state");
      const available = snapshot.collections ?? [];
      setCollections(available);
      setCollectionName((current) =>
        available.some((item) => item.name === current)
          ? current
          : available[0]?.name ?? ""
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `Could not load collections: ${error.message}`
          : "Could not load collections."
      );
    } finally {
      setLoadingCollections(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void cms_call<DataSnapshot>("data_state")
      .then((snapshot) => {
        if (!active) return;
        const available = snapshot.collections ?? [];
        setCollections(available);
        setCollectionName(available[0]?.name ?? "");
      })
      .catch((error: unknown) => {
        if (!active) return;
        toast.error(
          error instanceof Error
            ? `Could not load collections: ${error.message}`
            : "Could not load collections."
        );
      })
      .finally(() => {
        if (active) setLoadingCollections(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const export_records = useCallback(async () => {
    if (!collection) return;
    setBusy(true);
    try {
      const firstPage = await cms_call<DataSnapshot>("data_state", {
        collection: collection.name,
        page: 1,
      });
      const pages = Math.max(1, Number(firstPage.pages ?? 1));
      const records = [...(firstPage.records ?? [])];
      for (let page = 2; page <= pages; page += 1) {
        const snapshot = await cms_call<DataSnapshot>("data_state", {
          collection: collection.name,
          page,
        });
        records.push(...(snapshot.records ?? []));
      }

      const fields = [
        { name: collection.primary_key },
        ...collection.fields.filter(
          (field) =>
            field.type !== "alias" && !field.hidden && !field.readonly
        ),
      ];
      const csv = [
        fields.map((field) => csv_cell(field.name)).join(","),
        ...records.map((record) =>
          fields.map((field) => csv_cell(record[field.name])).join(",")
        ),
      ].join("\r\n");
      download_text(
        `\uFEFF${csv}`,
        "text/csv;charset=utf-8",
        `${collection.name}.csv`
      );
      toast.success(`Exported ${records.length} ${collection.label || collection.name} records.`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `Could not export records: ${error.message}`
          : "Could not export records."
      );
    } finally {
      setBusy(false);
    }
  }, [collection]);

  const export_schema = useCallback(async () => {
    setBusy(true);
    try {
      const snapshot = await cms_call<DataSnapshot>("data_state");
      download_text(
        JSON.stringify(collection_schema(snapshot.collections ?? []), null, 2),
        "application/json;charset=utf-8",
        "eterc-schema.json"
      );
      toast.success("Schema exported.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `Could not export schema: ${error.message}`
          : "Could not export schema."
      );
    } finally {
      setBusy(false);
    }
  }, []);

  const import_records = useCallback(
    async (file: File) => {
      if (!collection) return;
      setBusy(true);
      let imported = 0;
      try {
        const rows = parse_csv(await file.text());
        const [headerRow, ...dataRows] = rows;
        if (!headerRow?.length) throw new Error("The CSV file is empty.");
        const headers = headerRow.map((header) => header.trim());
        if (new Set(headers).size !== headers.length) {
          throw new Error("The CSV file contains duplicate column names.");
        }

        const fieldsByName = new Map(
          collection.fields.map((field) => [field.name, field])
        );
        const writableFields = headers.map((header) => {
          if (header === collection.primary_key) return null;
          const field = fieldsByName.get(header);
          if (!field) {
            throw new Error(`"${header}" is not a writable field in this collection.`);
          }
          return field.type === "alias" || field.readonly ? null : field;
        }).filter((field): field is CmsField => field !== null);
        if (writableFields.length === 0) {
          throw new Error("The CSV must include at least one writable field.");
        }

        for (const [index, row] of dataRows.entries()) {
          if (row.length !== headers.length) {
            throw new Error(`CSV row ${index + 2} has the wrong number of columns.`);
          }
          const values = Object.fromEntries(
            writableFields.map((field) => [
              field.name,
              import_field_value(field, row[headers.indexOf(field.name)]),
            ])
          );
          await cms_call("data_record_create", {
            collection: collection.name,
            values,
          });
          imported += 1;
        }
        toast.success(`Imported ${imported} record${imported === 1 ? "" : "s"}.`);
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : "The import failed.";
        toast.error(
          imported > 0
            ? `Imported ${imported} records before the import stopped: ${reason}`
            : `Could not import records: ${reason}`
        );
      } finally {
        setBusy(false);
        await loadCollections();
      }
    },
    [collection, loadCollections]
  );

  if (collapsed) {
    return (
      <div className="flex h-full w-full flex-col items-center bg-assistant-sidebar py-2">
        <button
          type="button"
          className={cn(
            "grid size-10 place-items-center rounded-lg text-foreground transition-colors hover:bg-muted/70",
            section === "data" && "bg-muted"
          )}
          aria-label="Open data tools"
          aria-pressed={section === "data"}
          title="Data tools"
          onClick={() => setSection("data")}
        >
          <Database className="size-4" />
        </button>
        <button
          type="button"
          className={cn(
            "mt-auto grid size-10 place-items-center rounded-lg text-foreground transition-colors hover:bg-muted/70",
            section === "assistant" && "bg-muted"
          )}
          aria-label="Open AI assistant"
          aria-pressed={section === "assistant"}
          title="AI Assistant"
          onClick={() => setSection("assistant")}
        >
          <Sparkles className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-assistant-sidebar text-foreground">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex min-w-0 items-center gap-2">
          {section === "assistant" ? (
            <Sparkles className="size-4 shrink-0" />
          ) : (
            <ArrowDownToLine className="size-4 shrink-0" />
          )}
          <h2 className="truncate text-sm font-semibold">
            {section === "assistant" ? "AI Assistant" : "Data tools"}
          </h2>
        </div>
        <button
          type="button"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={section === "assistant" ? "Open data tools" : "Open AI assistant"}
          title={section === "assistant" ? "Data tools" : "AI Assistant"}
          onClick={() =>
            setSection((current) => (current === "assistant" ? "data" : "assistant"))
          }
        >
          {section === "assistant" ? (
            <Database className="size-4" />
          ) : (
            <Bot className="size-4" />
          )}
        </button>
      </div>

      {section === "assistant" ? (
        <>
          <div className="flex h-12 shrink-0 items-center border-b border-border px-4">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Bot className="size-3.5" />
              <span>Not connected</span>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
            <div className="flex size-20 items-center justify-center rounded-full bg-assistant-icon-surface">
              <Sparkles className="size-8" />
            </div>
            <h3 className="mt-4 text-base font-medium">Build with AI Assistant</h3>
            <p className="text-xs text-muted-foreground">
              AI responses may be inaccurate
            </p>
          </div>
          <div className="shrink-0 px-3 pb-3">
            <div className="rounded-xl border border-input bg-card p-3">
              <textarea
                rows={2}
                disabled
                aria-label="Message the AI assistant"
                placeholder="Type your message here ..."
                className="max-h-32 min-h-10 w-full resize-none bg-transparent text-sm leading-5 text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
              />
              <div className="mt-2 flex items-center justify-between">
                <button
                  type="button"
                  disabled
                  aria-label="Attach a file"
                  className="inline-flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <Plus className="size-4" />
                </button>
                <button
                  type="button"
                  disabled
                  aria-label="Send message"
                  className="inline-flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <ArrowUp className="size-4" />
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="app-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-2">
            <label htmlFor="workspace-tools-collection" className="text-sm font-semibold">
              Collection
            </label>
            <select
              id="workspace-tools-collection"
              value={collectionName}
              onChange={(event) => setCollectionName(event.target.value)}
              disabled={loadingCollections || busy || collections.length === 0}
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm"
            >
              {collections.length === 0 ? (
                <option value="">
                  {loadingCollections ? "Loading collections..." : "No collections"}
                </option>
              ) : (
                collections.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.label || item.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <section className="space-y-2 border-t border-border pt-4">
            <h3 className="text-sm font-semibold">Records</h3>
            <p className="text-xs text-muted-foreground">
              Import a CSV using field names as column headers, or export all records in this
              collection.
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={busy || !collection}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="size-4" />
              Import CSV
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              aria-label="Choose CSV file to import"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void import_records(file);
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={busy || !collection}
              onClick={() => void export_records()}
            >
              <ArrowDownToLine className="size-4" />
              Export collection CSV
            </Button>
          </section>

          <section className="space-y-2 border-t border-border pt-4">
            <h3 className="text-sm font-semibold">Schema</h3>
            <p className="text-xs text-muted-foreground">
              Download collection and field definitions as JSON.
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={busy || loadingCollections}
              onClick={() => void export_schema()}
            >
              <FileJson2 className="size-4" />
              Export schema
            </Button>
          </section>

          {busy ? <p className="text-xs text-muted-foreground">Working...</p> : null}
        </div>
      )}
    </div>
  );
}
