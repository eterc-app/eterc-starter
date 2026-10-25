import { Flashdata } from "@/engine/ui/Flashdata";
import { site_url } from "@/engine/Url";
import type { EtViewProps } from "@/engine/views-registry";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Show({ data }: EtViewProps) {
  const update_id = Number(data.update_id ?? 0);
  const is_own_account = data.is_own_account === true;

  return (
    <div className="app-page max-w-3xl">
      <PageHeader
        eyebrow="Content"
        title="Administrator"
        description="Account details and sign-in status."
        actions={
          <>
            <Button asChild variant="outline">
              <a href={String(data.back_url ?? "")}>Back</a>
            </Button>
            <Button asChild>
              <a href={site_url(`eterc_administrators/create/${update_id}`)}>
                Edit
              </a>
            </Button>
            {is_own_account === false ? (
              <Button asChild variant="destructive">
                <a
                  href={site_url(
                    `eterc_administrators/delete_conf/${update_id}`,
                  )}
                >
                  Delete
                </a>
              </Button>
            ) : null}
          </>
        }
      />

      <Flashdata />

      <Card>
        <CardHeader className="border-b border-border">
          <CardTitle>Account details</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <dl className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-4">
              <dt className="text-sm text-muted-foreground">Username</dt>
              <dd className="text-right font-semibold">
                {String(data.username ?? "")}
              </dd>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-4">
              <dt className="text-sm text-muted-foreground">User ID</dt>
              <dd className="text-right font-mono text-xs">
                {String(data.eterc_user_id ?? "")}
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
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
