import { BASE_URL } from "@/engine/config";
import { Flashdata } from "@/engine/ui/Flashdata";
import type { EtViewProps } from "@/engine/views-registry";
import { Pagination } from "@/modules/pagination/PaginationRenderer";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PerPageSelect } from "./PerPageSelect";
export default function Manage({ data }: EtViewProps) {
  const rows = (data.rows ?? []) as Array<Record<string, unknown>>;
  const pagination_data = (data.pagination_data ?? {}) as Record<string, unknown>;
  const per_page_options = (data.per_page_options ?? []) as number[];
  const selected_per_page = Number(data.selected_per_page ?? 1);

  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1>Manage Administrators</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Accounts that can sign in to the Eterc control panel.
          </p>
        </div>
        <Button asChild>
          <a href={`${base}administrators/create`}>Create New Record</a>
        </Button>
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
              <CardTitle>Administrators</CardTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                Records Per Page:
                <PerPageSelect
                  options={per_page_options}
                  selected={selected_per_page}
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
                    <TableHead className="px-4">Username</TableHead>
                    <TableHead>User ID</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="w-24 px-4 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={String(row.id)}>
                      <TableCell className="px-4 font-medium">
                        {String(row.username ?? "")}
                      </TableCell>
                      <TableCell>{String(row.eterc_user_id ?? "")}</TableCell>
                      <TableCell>{String(row.active_formatted ?? "")}</TableCell>
                      <TableCell className="px-4 text-right">
                        <Button asChild variant="outline" size="sm">
                          <a
                            href={`${base}administrators/show/${row.id}`}
                          >
                            View
                          </a>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {rows.length > 9 ? (
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
