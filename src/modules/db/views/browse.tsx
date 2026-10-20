import { Flashdata } from "@/engine/ui/Flashdata";
import { siteUrl } from "@/engine/url";
import type { TgViewProps } from "@/engine/views-registry";
import { Pagination } from "@/modules/pagination/PaginationRenderer";
import { PerPageSelector } from "./PerPageSelector";

/**
 * Record browser — the `db` module's paginated table view.
 *
 * Rendered by DbAdmin::browse(); designed from the data contract that method
 * supplies (there is no PHP original view to port):
 *
 *   headline, table, columns (ColumnInfo[]), rows (Row[]), primary_key,
 *   total_rows, pagination_data, per_page_options, selected_per_page,
 *   tables_url, forger_url, sql_console_url
 *
 * A server component (the canonical pagination renderer reads request
 * context), with the interactive per-page selector isolated in its own client
 * component.
 */

interface ColumnInfo {
  name: string;
  is_primary_key: boolean;
}

export default function Browse({ data }: TgViewProps) {
  const table = String(data.table ?? "");
  const module = String(data.viewModule ?? "db");
  const columns = (data.columns ?? []) as ColumnInfo[];
  const rows = (data.rows ?? []) as Array<Record<string, unknown>>;
  const pagination_data = (data.pagination_data ?? {}) as Record<string, unknown>;
  const per_page_options = (data.per_page_options ?? []) as number[];
  const selected_per_page = Number(data.selected_per_page ?? 1);
  const primary_key = String(data.primary_key ?? "");
  const forger_url = String(data.forger_url ?? "").replace(/\/+$/, "");

  const rowId = (row: Record<string, unknown>): unknown => row[primary_key];

  return (
    <>
      <h1>{String(data.headline ?? "")}</h1>
      <Flashdata />

      <p>
        <a className="button alt" href={forger_url}>
          Forge New Record
        </a>{" "}
        <a className="button alt" href={String(data.sql_console_url ?? "")}>
          SQL Console
        </a>{" "}
        <a className="button alt" href={String(data.tables_url ?? "")}>
          Database Tables
        </a>
      </p>

      {rows.length === 0 ? (
        <p>There are currently no records to display.</p>
      ) : (
        <>
          <Pagination data={pagination_data} />

          <table className="records-table">
            <thead>
              <tr>
                <th colSpan={columns.length + 1}>
                  <div>
                    <div>&nbsp;</div>
                    <div>
                      Records Per Page:{" "}
                      <PerPageSelector
                        options={per_page_options}
                        selected={selected_per_page}
                        module={module}
                        table={table}
                      />
                    </div>
                  </div>
                </th>
              </tr>
              <tr>
                {columns.map((column) => (
                  <th key={column.name}>
                    {column.name}
                    {column.is_primary_key ? " (PK)" : ""}
                  </th>
                ))}
                <th style={{ width: "20px" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, row_index) => {
                const id = rowId(row);
                const identified = primary_key !== "" && id !== null && id !== undefined;

                return (
                  <tr key={row_index}>
                    {columns.map((column) => (
                      <td key={column.name}>{format_cell(row[column.name])}</td>
                    ))}
                    <td>
                      {identified ? (
                        <div className="actions">
                          <a
                            className="button alt"
                            href={`${forger_url}/${String(id)}`}
                          >
                            Edit
                          </a>
                          <a
                            className="button danger"
                            href={siteUrl(
                              `${module}/delete_conf/${table}/${String(id)}`
                            )}
                          >
                            Delete
                          </a>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <Pagination
            data={{ ...pagination_data, include_showing_statement: false }}
          />
        </>
      )}
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
