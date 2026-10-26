"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Database, Terminal } from "lucide-react";
import { Flashdata } from "@/engine/ui/Flashdata";
import { useEtUi } from "@/engine/ui/EtUiProvider";
import type { EtViewProps } from "@/engine/views-registry";
import { Notice } from "@/components/app/Notice";
import { PageActions } from "@/components/app/PageActions";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
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
    <div className="app-page">
      <PageHeader
        eyebrow="Database"
        title="SQL console"
        description="Run read or write statements against the local SQLite database."
        actions={
          <PageActions
            items={[
              {
                label: "Database tables",
                icon: <Database className="size-4" />,
                href: String(data.tables_url ?? ""),
              },
            ]}
          />
        }
      />

      <Flashdata />

      <Card>
        <CardHeader className="border-b border-border">
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
              className="min-h-48 font-mono text-sm"
            />
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button type="submit" disabled={busy || sql.trim() === ""}>
                <Terminal className="size-4" strokeWidth={1.75} />
                {busy ? "Running…" : "Run SQL"}
              </Button>
            </div>
          </form>

          {error ? (
            <Notice icon={AlertTriangle} tone="destructive" className="mt-4">
              {error}
            </Notice>
          ) : null}
        </CardContent>
      </Card>

      {result ? (
        <Card>
          <CardHeader className="border-b border-border">
            <CardTitle className="flex items-center gap-2">
              SQL result
              <Badge variant={result.ok ? "success" : "destructive"}>
                {result.ok ? "Success" : "Error"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <Notice
              icon={result.ok ? CheckCircle2 : AlertTriangle}
              tone={result.ok ? "success" : "destructive"}
            >
              {result.message}
            </Notice>

            {result.ok && result.columns.length > 0 && result.rows.length > 0 ? (
              <div className="app-scrollbar overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
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
                          <TableCell
                            key={column}
                            className="px-3 font-mono text-xs"
                          >
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

      {tables.length > 0 ? (
        <Card>
          <CardHeader className="border-b border-border">
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
