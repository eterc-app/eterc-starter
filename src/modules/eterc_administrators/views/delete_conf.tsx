import { EtForm } from "@/engine/ui/EtForm";
import type { EtViewProps } from "@/engine/views-registry";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Delete confirmation — port of
 * modules/eterc_administrators/views/delete_conf.php.
 *
 * Deletion happens only after the "Yes - Delete Now" submit; the controller
 * then re-checks ownership and record existence (PHP parity).
 */
export default function DeleteConf({ data }: EtViewProps) {
  const update_id = Number(data.update_id ?? 0);

  return (
    <div className="space-y-6">
      <div>
        <h1>{String(data.headline ?? "")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This action permanently removes the administrator account.
        </p>
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Confirmation Required</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <p className="font-medium">Are you sure?</p>
          <p className="text-sm text-muted-foreground">
            You are about to delete a record. This cannot be undone. Do you
            really want to do this?
          </p>

          <EtForm
            action="eterc_administrators/submit_delete"
            params={[update_id]}
          >
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" variant="destructive">
                Yes - Delete Now
              </Button>
              <Button asChild variant="outline">
                <a href={String(data.cancel_url ?? "")}>Cancel</a>
              </Button>
            </div>
          </EtForm>
        </CardContent>
      </Card>
    </div>
  );
}
