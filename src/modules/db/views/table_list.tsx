"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Database } from "lucide-react";
import { Flashdata } from "@/engine/ui/Flashdata";
import { useEtUi } from "@/engine/ui/EtUiProvider";
import type { EtViewProps } from "@/engine/views-registry";
import { useConfirm } from "@/components/app/ConfirmDialog";
import { EmptyState } from "@/components/app/EmptyState";
import { Notice } from "@/components/app/Notice";
import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface TableSummary {
  name: string;
  num_rows: number;
  num_columns: number;
  primary_key: string;
}

interface XhrReply<T> {
  status: string;
  data?: T;
  message?: string;
}

export default function TableList({ data }: EtViewProps) {
  const { csrf_token } = useEtUi();

  const tables = (data.tables ?? []) as TableSummary[];
  const browse_url_root = String(data.browse_url_root ?? "");
  const forger_url_root = String(data.forger_url_root ?? "");
  const sql_console_url = String(data.sql_console_url ?? "");

  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const { confirm, dialog: confirm_dialog } = useConfirm();

  const call = async (
    method: "truncate" | "resequence",
    table: string
  ) => {
    const confirmed = await confirm({
      title: method === "truncate" ? "Truncate table?" : "Resequence table?",
      description:
        method === "truncate" ? (
          <>
            Every row in{" "}
            <span className="font-mono text-foreground">{table}</span> will be
            permanently deleted. The table structure is kept. This cannot be
            undone.
          </>
        ) : (
          <>
            The{" "}
            <span className="font-mono text-foreground">id</span> column of{" "}
            <span className="font-mono text-foreground">{table}</span> will be
            renumbered from 1. Existing references to these IDs may break.
          </>
        ),
      confirmLabel: method === "truncate" ? "Truncate table" : "Resequence",
      tone: method === "truncate" ? "destructive" : "default",
    });
    if (!confirmed) return;

    setBusy(`${method}:${table}`);
    setNotice("");
    setError("");

    try {
      const response = await fetch(`/api/xhr/db/${method}/${table}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csrf_token: csrf_token }),
      });
      const json = (await response.json()) as XhrReply<{
        ok: boolean;
        message: string;
      }>;
      const result =
        json.status === "ok" && json.data
          ? json.data
          : {
              ok: false,
              message: json.message ?? "The request could not be completed.",
            };

      if (result.ok) {
        setNotice(result.message);
      } else {
        setError(result.message);
      }
    } catch {
      setError("A network error occurred. Please try again.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Database"
        title="Database tables"
        description={
          data.subheading
            ? String(data.subheading)
            : "Inspect schema and maintenance actions for the local SQLite database."
        }
        actions={
          <Button asChild variant="outline">
            <a href={sql_console_url}>SQL console</a>
          </Button>
        }
      />

      <Flashdata />

      {notice ? (
        <Notice icon={CheckCircle2} tone="success">
          {notice}
        </Notice>
      ) : null}
      {error ? (
        <Notice icon={AlertTriangle} tone="destructive">
          {error}
        </Notice>
      ) : null}

      {tables.length === 0 ? (
        <EmptyState
          icon={<Database className="size-5" strokeWidth={1.75} />}
          title="No tables yet"
          description="This database does not contain any tables."
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <CardHeader className="border-b border-border px-4 py-3">
            <CardTitle>Tables</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-4">Table</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead>Columns</TableHead>
                  <TableHead>Primary key</TableHead>
                  <TableHead className="px-4 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tables.map((table) => (
                  <TableRow key={table.name}>
                    <TableCell className="px-4 font-mono text-xs font-semibold">
                      {table.name}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {table.num_rows.toLocaleString("en-US")}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {table.num_columns}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {table.primary_key || "—"}
                    </TableCell>
                    <TableCell className="px-4">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Button asChild variant="outline" size="sm">
                          <a href={`${browse_url_root}/${table.name}`}>Browse</a>
                        </Button>
                        <Button asChild variant="outline" size="sm">
                          <a href={`${forger_url_root}/${table.name}`}>
                            New record
                          </a>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busy !== ""}
                          onClick={() => void call("resequence", table.name)}
                        >
                          Resequence
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={busy !== ""}
                          onClick={() => void call("truncate", table.name)}
                        >
                          Truncate
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {confirm_dialog}
    </div>
  );
}
