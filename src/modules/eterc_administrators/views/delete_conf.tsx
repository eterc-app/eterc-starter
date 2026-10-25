import { AlertTriangle } from "lucide-react";
import { EtForm } from "@/engine/ui/EtForm";
import type { EtViewProps } from "@/engine/views-registry";
import { Notice } from "@/components/app/Notice";
import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function DeleteConf({ data }: EtViewProps) {
  const update_id = Number(data.update_id ?? 0);

  return (
    <div className="app-page max-w-3xl">
      <PageHeader
        eyebrow="Content"
        title="Delete administrator"
        description="This action permanently removes the administrator account."
      />

      <Card>
        <CardHeader className="border-b border-border">
          <CardTitle>Confirmation required</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <Notice icon={AlertTriangle} tone="destructive">
            You are about to delete this administrator. This cannot be undone.
          </Notice>

          <EtForm
            action="eterc_administrators/submit_delete"
            params={[update_id]}
          >
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" variant="destructive">
                Delete administrator
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
