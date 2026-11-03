import { Flashdata } from "@/engine/ui/Flashdata";
import { site_url } from "@/engine/Url";
import type { EtViewProps } from "@/engine/views-registry";
import { PageActions } from "@/components/app/PageActions";
import { PageActionsPortal } from "@/components/app/PageActionsSlot";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, KeyRound, Pencil, Trash2 } from "lucide-react";

export default function Show({ data }: EtViewProps) {
  const update_id = Number(data.update_id ?? 0);
  const is_own_account = data.is_own_account === true;

  return (
    <div className="app-page max-w-3xl">
      <PageActionsPortal>
        <PageActions
          items={[
            {
              label: "Back to administrators",
              icon: <ArrowLeft className="size-4" />,
              href: String(data.back_url ?? ""),
            },
            {
              label: "Edit administrator",
              icon: <Pencil className="size-4" />,
              href: site_url(`eterc_administrators/create/${update_id}`),
              variant: "default",
            },
            ...(is_own_account
              ? [
                {
                  label: "Profile & API keys",
                  icon: <KeyRound className="size-4" />,
                  href: site_url("admin/profile"),
                },
              ]
              : []),
            ...(is_own_account === false
              ? [
                {
                  label: "Delete administrator",
                  icon: <Trash2 className="size-4" />,
                  href: site_url(
                    `eterc_administrators/delete_conf/${update_id}`,
                  ),
                  variant: "destructive" as const,
                },
              ]
              : []),
          ]}
        />
      </PageActionsPortal>
      <Flashdata />

      <div className="space-y-4">
        <div className="border-b border-border pb-3">
          <h2 className="text-base font-semibold text-foreground">Account details</h2>
        </div>
        <div>
          <dl className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-4">
              <dt className="text-sm text-muted-foreground">Name</dt>
              <dd className="text-right font-semibold">
                {String(data.display_name ?? data.username ?? "")}
              </dd>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-4">
              <dt className="text-sm text-muted-foreground">Username</dt>
              <dd className="text-right font-mono text-xs">
                {String(data.username ?? "")}
              </dd>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-4">
              <dt className="text-sm text-muted-foreground">Email</dt>
              <dd className="text-right">{String(data.email ?? "") || "—"}</dd>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-4">
              <dt className="text-sm text-muted-foreground">Job title</dt>
              <dd className="text-right">{String(data.title ?? "") || "—"}</dd>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-4">
              <dt className="text-sm text-muted-foreground">Role</dt>
              <dd className="flex items-center justify-end gap-2 text-right">
                <Badge variant="outline">
                  {String(data.role_name ?? "Unassigned")}
                </Badge>
                {data.role_admin_access === true ? (
                  <Badge>Admin area</Badge>
                ) : null}
              </dd>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-4">
              <dt className="text-sm text-muted-foreground">Status</dt>
              <dd className="text-right">
                <Badge
                  variant={
                    String(data.active_formatted ?? "").toLowerCase() ===
                      "active"
                      ? "success"
                      : "outline"
                  }
                >
                  {String(data.active_formatted ?? "")}
                </Badge>
              </dd>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-4">
              <dt className="text-sm text-muted-foreground">User ID</dt>
              <dd className="text-right font-mono text-xs">
                {String(data.eterc_user_id ?? "")}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
