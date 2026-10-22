import { Flashdata } from "@/engine/ui/Flashdata";
import { site_url } from "@/engine/Url";
import type { EtViewProps } from "@/engine/views-registry";
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
    <div className="space-y-6">
      <div>
        <h1>{String(data.headline ?? "")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Account details and sign-in status.
        </p>
      </div>

      <Flashdata />

      <Card>
        <CardHeader className="flex flex-col gap-3 border-b sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Record Details</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={String(data.back_url ?? "")}>Back</a>
            </Button>
            <Button asChild size="sm">
              <a
                href={site_url(`eterc_administrators/create/${update_id}`)}
              >
                Edit
              </a>
            </Button>
            {is_own_account === false ? (
              <Button asChild variant="destructive" size="sm">
                <a
                  href={site_url(
                    `eterc_administrators/delete_conf/${update_id}`,
                  )}
                >
                  Delete
                </a>
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <dl className="divide-y rounded-lg border">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3">
              <dt className="text-sm text-muted-foreground">Username</dt>
              <dd className="text-right font-medium">
                {String(data.username ?? "")}
              </dd>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3">
              <dt className="text-sm text-muted-foreground">User ID</dt>
              <dd className="text-right font-medium">
                {String(data.eterc_user_id ?? "")}
              </dd>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3">
              <dt className="text-sm text-muted-foreground">Status</dt>
              <dd className="text-right font-medium">
                {String(data.active_formatted ?? "")}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
