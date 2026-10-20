"use client";

import { useState } from "react";
import { Flashdata } from "@/engine/ui/Flashdata";
import { useTgUi } from "@/engine/ui/TgUiProvider";
import type { TgViewProps } from "@/engine/views-registry";

/**
 * Database tables — the `db` module's landing view.
 *
 * Rendered by DbAdmin::index(). The PHP-era admin tool was never shipped with
 * views (the original `modules/db` is the engine class), so this view is
 * designed directly from the data contract DbAdmin::index() supplies:
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

export default function TableList({ data }: TgViewProps) {
  const { csrfToken } = useTgUi();

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
        body: JSON.stringify({ csrf_token: csrfToken }),
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
    <>
      <h1>{String(data.headline ?? "")}</h1>
      <Flashdata />

      {data.subheading ? <p>{String(data.subheading)}</p> : null}

      <p>
        <a className="button alt" href={sql_console_url}>
          SQL Console
        </a>
      </p>

      {notice ? <p style={{ color: "green" }}>{notice}</p> : null}
      {error ? (
        <p style={{ color: "red" }} role="alert">
          {error}
        </p>
      ) : null}

      {tables.length === 0 ? (
        <p>There are currently no tables in the database.</p>
      ) : (
        <table className="records-table">
          <thead>
            <tr>
              <th>Table</th>
              <th>Rows</th>
              <th>Columns</th>
              <th>Primary Key</th>
              <th style={{ width: "20px" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tables.map((table) => (
              <tr key={table.name}>
                <td>{table.name}</td>
                <td>{table.num_rows.toLocaleString("en-US")}</td>
                <td>{table.num_columns}</td>
                <td>{table.primary_key || "—"}</td>
                <td>
                  <div className="actions">
                    <a
                      className="button alt"
                      href={`${browse_url_root}/${table.name}`}
                    >
                      Browse
                    </a>
                    <a
                      className="button alt"
                      href={`${forger_url_root}/${table.name}`}
                    >
                      Forge
                    </a>
                    <button
                      type="button"
                      className="button alt"
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
                    </button>
                    <button
                      type="button"
                      className="button danger"
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
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
