import { BASE_URL } from "@/engine/config";
import { Flashdata } from "@/engine/ui/Flashdata";
import type { EtViewProps } from "@/engine/views-registry";
import { Pagination } from "@/modules/pagination/PaginationRenderer";
import { EmptyState } from "@/components/app/EmptyState";
import { PageActions } from "@/components/app/PageActions";
import { PageActionsPortal } from "@/components/app/PageActionsSlot";
import { Badge } from "@/components/ui/badge";
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
import { Plus, Users } from "lucide-react";
import { PerPageSelect } from "./PerPageSelect";

export default function Manage({ data }: EtViewProps) {
  const rows = (data.rows ?? []) as Array<Record<string, unknown>>;
  const pagination_data = (data.pagination_data ?? {}) as Record<string, unknown>;
  const per_page_options = (data.per_page_options ?? []) as number[];
  const selected_per_page = Number(data.selected_per_page ?? 1);

  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  const has_pagination =
    Number(pagination_data.total_rows ?? 0) > Number(pagination_data.limit ?? 0);

  return (
    <div className="app-page">
      <PageActionsPortal>
        <PageActions
          items={[
            {
              label: "Create administrator",
              icon: <Plus className="size-4" />,
              href: `${base}administrators/create`,
              variant: "default",
            },
          ]}
        />
      </PageActionsPortal>

      <Flashdata />

      {rows.length === 0 ? (
        <EmptyState
          icon={<Users className="size-5" strokeWidth={1.75} />}
          title="No administrators yet"
          description="Create an account to let someone sign in to this workspace."
          action={
            <Button asChild>
              <a href={`${base}administrators/create`}>Create administrator</a>
            </Button>
          }
        />
      ) : (
        <>
          <Card className="overflow-hidden p-0">
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 border-b border-border px-4 py-3">
              <CardTitle>Administrators</CardTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                Records per page
                <PerPageSelect
                  options={per_page_options}
                  selected={selected_per_page}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-4">Username</TableHead>
                    <TableHead>User ID</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="w-24 px-4 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={String(row.id)}>
                      <TableCell className="px-4 font-mono text-xs font-semibold">
                        {String(row.username ?? "")}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {String(row.eterc_user_id ?? "")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            String(row.active_formatted ?? "").toLowerCase() ===
                            "active"
                              ? "success"
                              : "outline"
                          }
                        >
                          {String(row.active_formatted ?? "")}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 text-right">
                        <Button asChild variant="outline" size="sm">
                          <a href={`${base}administrators/show/${row.id}`}>
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
