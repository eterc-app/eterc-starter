"use client";

import { useState } from "react";
import { Flashdata } from "@/engine/ui/Flashdata";
import { useEtUi } from "@/engine/ui/EtUiProvider";
import type { EtViewProps } from "@/engine/views-registry";
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

/**
 * Database tables — the `db` module's landing view.
 *
 * Rendered by Db::index(). The PHP-era admin tool was never shipped with
 * views (the original `modules/db` is the engine class), so this view is
 * designed directly from the data contract Db::index() supplies:
 *
 *   headline, subheading, tables (TableSummary[]),
 *   browse_url_root, forger_url_root, sql_console_url
 *
 * The per-table maintenance actions (Truncate / Resequence) POST JSON to
 * `/api/xhr/db/{method}/{table}` — the port's stand-in for the original tool's
 * AJAX endpoints — and report the result inline, since a client swap cannot
 * refresh the server-rendered row counts.
 */

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

  const call = async (
    method: "truncate" | "resequence",
    table: string,
    confirmation: string
  ) => {
    if (!window.confirm(confirmation)) return;

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
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {data.subheading ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {String(data.subheading)}
            </p>
          ) : null}
        </div>
        <Button asChild variant="outline">
          <a href={sql_console_url}>SQL Console</a>
        </Button>
      </div>

      <Flashdata />

      {notice ? (
        <p className="rounded-md border border-emerald-600/30 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {tables.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            There are currently no tables in the database.
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <CardHeader className="border-b px-4 py-3">
            <CardTitle>Tables</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="px-4">Table</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead>Columns</TableHead>
                  <TableHead>Primary Key</TableHead>
                  <TableHead className="px-4 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tables.map((table) => (
                  <TableRow key={table.name}>
                    <TableCell className="px-4 font-medium">
                      {table.name}
                    </TableCell>
                    <TableCell>{table.num_rows.toLocaleString("en-US")}</TableCell>
                    <TableCell>{table.num_columns}</TableCell>
                    <TableCell>{table.primary_key || "—"}</TableCell>
                    <TableCell className="px-4">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Button asChild variant="outline" size="sm">
                          <a href={`${browse_url_root}/${table.name}`}>Browse</a>
                        </Button>
                        <Button asChild variant="outline" size="sm">
                          <a href={`${forger_url_root}/${table.name}`}>Forge</a>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busy !== ""}
                          onClick={() =>
                            void call(
                              "resequence",
                              table.name,
                              `Resequence the 'id' column of '${table.name}' from 1? ` +
                                "This rewrites primary key values and cannot be undone."
                            )
                          }
                        >
                          Resequence
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={busy !== ""}
                          onClick={() =>
                            void call(
                              "truncate",
                              table.name,
                              `Truncate '${table.name}'? Every row in the table will be ` +
                                "deleted. This cannot be undone."
                            )
                          }
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
    </div>
  );
}
