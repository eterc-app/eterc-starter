"use client";

import { useState } from "react";
import { Flashdata } from "@/engine/ui/Flashdata";
import { useTgUi } from "@/engine/ui/TgUiProvider";
import type { TgViewProps } from "@/engine/views-registry";

/**
 * SQL console — run one SQL statement against the SQLite database.
 *
 * Rendered by DbAdmin::sql_console() with
 * { headline, tables, browse_url_root, tables_url, sample_sql }.
 *
 * Statements POST as JSON to /api/xhr/db/run_sql; the model returns a
 * SqlResult ({ ok, message, columns, rows, affected_rows, last_insert_id }).
 * Any statement the SQLite driver accepts is allowed — this screen is the
 * admin tool's deliberate "escape hatch", guarded by the admin session.
 */

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

export default function SqlConsole({ data }: TgViewProps) {
  const { csrfToken } = useTgUi();

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
        body: JSON.stringify({ sql, csrf_token: csrfToken }),
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
    <>
      <h1>{String(data.headline ?? "")}</h1>
      <Flashdata />

      <div className="card">
        <div className="card-heading">Run SQL</div>
        <div className="card-body">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run();
            }}
          >
            <textarea
              name="sql"
              rows={8}
              value={sql}
              onChange={(event) => setSql(event.target.value)}
              placeholder="SELECT * FROM sqlite_master WHERE type = 'table';"
              spellCheck={false}
              autoComplete="off"
            />
            <div className="text-center">
              <a className="button alt" href={String(data.tables_url ?? "")}>
                Database Tables
              </a>
              <button type="submit" disabled={busy || sql.trim() === ""}>
                {busy ? "Running…" : "Run SQL"}
              </button>
            </div>
          </form>

          {error ? (
            <p style={{ color: "red" }} role="alert">
              {error}
            </p>
          ) : null}

          {busy ? <div className="spinner spinner-lhs"></div> : null}
        </div>
      </div>

      {result ? (
        <div className="card">
          <div
            className={`card-heading${result.ok ? " success" : " danger"}`}
          >
            {result.ok ? "Result" : "SQL Error"}
          </div>
          <div className="card-body">
            <p style={{ color: result.ok ? "green" : "red" }}>{result.message}</p>

            {result.ok && result.columns.length > 0 && result.rows.length > 0 ? (
              <table className="records-table">
                <thead>
                  <tr>
                    {result.columns.map((column) => (
                      <th key={column}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, row_index) => (
                    <tr key={row_index}>
                      {result.columns.map((column) => (
                        <td key={column}>{format_cell(row[column])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Quick access to every table, alongside the SQL form. */}
      {tables.length > 0 ? (
        <div className="card options-card">
          <div className="card-heading">Tables</div>
          <div className="card-body">
            <div className="actions">
              {tables.map((table) => (
                <a
                  className="button alt"
                  key={table.name}
                  href={`${browse_url_root}/${table.name}`}
                >
                  {table.name} ({table.num_rows.toLocaleString("en-US")})
                </a>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Cell text — NULL renders as an empty cell, exactly like PHP's `echo null`. */
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
