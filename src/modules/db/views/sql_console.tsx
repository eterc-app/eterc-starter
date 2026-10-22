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
import { Textarea } from "@/components/ui/textarea";

interface TableSummary {
  name: string;
  num_rows: number;
  primary_key: string;
}

interface SqlResult {
  ok: boolean;
  message: string;
  columns: string[];
  rows: Array<Record<string, unknown>>;
  affected_rows: number;
  last_insert_id: number;
  statement: string;
}

interface XhrReply<T> {
  status: string;
  data?: T;
  message?: string;
}

export default function SqlConsole({ data }: EtViewProps) {
  const { csrf_token } = useEtUi();

  const tables = (data.tables ?? []) as TableSummary[];
  const browse_url_root = String(data.browse_url_root ?? "").replace(/\/+$/, "");

  const [sql, setSql] = useState(String(data.sample_sql ?? ""));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SqlResult | null>(null);
  const [error, setError] = useState("");

  const run = async () => {
    setBusy(true);
    setResult(null);
    setError("");

    try {
      const response = await fetch("/api/xhr/db/run_sql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql, csrf_token: csrf_token }),
      });
      const json = (await response.json()) as XhrReply<SqlResult>;

      if (json.status !== "ok" || !json.data) {
        setError(json.message ?? "The request could not be completed.");
        return;
      }

      setResult(json.data);
    } catch {
      setError("A network error occurred. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Flashdata />

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Run SQL</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run();
            }}
            className="space-y-4"
          >
            <Textarea
              name="sql"
              rows={8}
              value={sql}
              onChange={(event) => setSql(event.target.value)}
              placeholder="SELECT * FROM sqlite_master WHERE type = 'table';"
              spellCheck={false}
              autoComplete="off"
              className="min-h-40 font-mono text-sm"
            />
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild variant="outline">
                <a href={String(data.tables_url ?? "")}>Database Tables</a>
              </Button>
              <Button type="submit" disabled={busy || sql.trim() === ""}>
                {busy ? "Running…" : "Run SQL"}
              </Button>
            </div>
          </form>

          {error ? (
            <p
              className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {result ? (
        <Card>
          <CardHeader className="border-b">
            <CardTitle>
              <span className={result.ok ? "text-emerald-600" : "text-destructive"}>
                {result.ok ? "Result" : "SQL Error"}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <p
              className={
                result.ok
                  ? "text-sm text-emerald-700"
                  : "text-sm font-medium text-destructive"
              }
            >
              {result.message}
            </p>

            {result.ok && result.columns.length > 0 && result.rows.length > 0 ? (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      {result.columns.map((column) => (
                        <TableHead key={column} className="px-3">
                          {column}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.rows.map((row, row_index) => (
                      <TableRow key={row_index}>
                        {result.columns.map((column) => (
                          <TableCell key={column} className="px-3">
                            {format_cell(row[column])}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Quick access to every table, alongside the SQL form. */}
      {tables.length > 0 ? (
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Tables</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-2">
              {tables.map((table) => (
                <Button asChild variant="outline" size="sm" key={table.name}>
                  <a href={`${browse_url_root}/${table.name}`}>
                    {table.name} ({table.num_rows.toLocaleString("en-US")})
                  </a>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
function format_cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}
