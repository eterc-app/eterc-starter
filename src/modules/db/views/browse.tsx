import { Flashdata } from "@/engine/ui/Flashdata";
import { site_url } from "@/engine/Url";
import type { EtViewProps } from "@/engine/views-registry";
import { Pagination } from "@/modules/pagination/PaginationRenderer";
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
import { PerPageSelector } from "./PerPageSelector";

/**
 * Record browser — the `db` module's paginated table view.
 *
 * Rendered by Db::browse(); designed from the data contract that method
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

export default function Browse({ data }: EtViewProps) {
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
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Browse and edit records in {table}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={forger_url}>Forge New Record</a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={String(data.sql_console_url ?? "")}>SQL Console</a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={String(data.tables_url ?? "")}>Database Tables</a>
          </Button>
        </div>
      </div>

      <Flashdata />

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            There are currently no records to display.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden p-0">
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 border-b px-4 py-3">
              <CardTitle>{table}</CardTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                Records Per Page:
                <PerPageSelector
                  options={per_page_options}
                  selected={selected_per_page}
                  module={module}
                  table={table}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="border-b px-4 py-2">
                <Pagination data={pagination_data} />
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    {columns.map((column) => (
                      <TableHead key={column.name} className="px-4">
                        {column.name}
                        {column.is_primary_key ? " (PK)" : ""}
                      </TableHead>
                    ))}
                    <TableHead className="px-4 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, row_index) => {
                    const id = rowId(row);
                    const identified =
                      primary_key !== "" && id !== null && id !== undefined;

                    return (
                      <TableRow key={row_index}>
                        {columns.map((column) => (
                          <TableCell key={column.name} className="px-4">
                            {format_cell(row[column.name])}
                          </TableCell>
                        ))}
                        <TableCell className="px-4 text-right">
                          {identified ? (
                            <div className="flex justify-end gap-1.5">
                              <Button asChild variant="outline" size="sm">
                                <a href={`${forger_url}/${String(id)}`}>Edit</a>
                              </Button>
                              <Button asChild variant="destructive" size="sm">
                                <a
                                  href={site_url(
                                    `${module}/delete_conf/${table}/${String(id)}`
                                  )}
                                >
                                  Delete
                                </a>
                              </Button>
                            </div>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Pagination
              data={{ ...pagination_data, include_showing_statement: false }}
            />
          </div>
        </>
      )}
    </div>
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
