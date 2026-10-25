import { Database } from "lucide-react";
import { Flashdata } from "@/engine/ui/Flashdata";
import { site_url } from "@/engine/Url";
import type { EtViewProps } from "@/engine/views-registry";
import { Pagination } from "@/modules/pagination/PaginationRenderer";
import { EmptyState } from "@/components/app/EmptyState";
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
import { PerPageSelector } from "./PerPageSelector";

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
  const has_pagination =
    Number(pagination_data.total_rows ?? 0) > Number(pagination_data.limit ?? 0);

  const rowId = (row: Record<string, unknown>): unknown => row[primary_key];

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Database"
        title="Browse table"
        description="Browse and edit records in the local SQLite database."
        actions={
          <>
            <Button asChild>
              <a href={forger_url}>New record</a>
            </Button>
            <Button asChild variant="outline">
              <a href={String(data.sql_console_url ?? "")}>SQL console</a>
            </Button>
            <Button asChild variant="outline">
              <a href={String(data.tables_url ?? "")}>Tables</a>
            </Button>
          </>
        }
      />

      <Flashdata />

      {rows.length === 0 ? (
        <EmptyState
          icon={<Database className="size-5" strokeWidth={1.75} />}
          title="No records to display"
          description="This table is currently empty."
          action={
            <Button asChild>
              <a href={forger_url}>Create the first record</a>
            </Button>
          }
        />
      ) : (
        <>
          <Card className="overflow-hidden p-0">
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 border-b border-border px-4 py-3">
              <CardTitle className="font-mono text-sm">{table}</CardTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                Rows per page
                <PerPageSelector
                  options={per_page_options}
                  selected={selected_per_page}
                  module={module}
                  table={table}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map((column) => (
                      <TableHead key={column.name} className="px-4">
                        {column.name}
                        {column.is_primary_key ? (
                          <span className="ml-1 text-xs text-muted-foreground">
                            PK
                          </span>
                        ) : null}
                      </TableHead>
                    ))}
                    <TableHead className="sticky right-0 border-l border-border bg-surface-subtle px-4 text-right">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, row_index) => {
                    const id = rowId(row);
                    const identified =
                      primary_key !== "" && id !== null && id !== undefined;

                    return (
                      <TableRow key={row_index} className="group/row">
                        {columns.map((column) => {
                          const value = format_cell(row[column.name]);
                          return (
                            <TableCell
                              key={column.name}
                              className="px-4 font-mono text-xs"
                              title={value}
                            >
                              <span className="block max-w-[220px] truncate">
                                {value}
                              </span>
                            </TableCell>
                          );
                        })}
                        <TableCell className="sticky right-0 border-l border-border bg-card px-4 text-right group-hover/row:bg-surface-subtle">
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

          {has_pagination ? (
            <div className="flex justify-end">
              <Pagination
                data={{ ...pagination_data, include_showing_statement: false }}
              />
            </div>
          ) : null}
        </>
      )}
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
