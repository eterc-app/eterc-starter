import { AlertTriangle } from "lucide-react";
import { EtForm } from "@/engine/ui/EtForm";
import type { EtViewProps } from "@/engine/views-registry";
import { Notice } from "@/components/app/Notice";
import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PreviewItem {
  label: string;
  value: string;
}

export default function DeleteConf({ data }: EtViewProps) {
  const table = String(data.table ?? "");
  const update_id = Number(data.update_id ?? 0);
  const preview = (data.preview ?? []) as PreviewItem[];

  return (
    <div className="app-page max-w-3xl">
      <PageHeader
        eyebrow="Database"
        title="Delete record"
        description={`Delete record #${update_id} from ${table}.`}
      />

      <Card>
        <CardHeader className="border-b border-border">
          <CardTitle>Confirmation required</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <Notice icon={AlertTriangle} tone="destructive">
            This record will be permanently removed. This action cannot be
            undone.
          </Notice>

          {preview.length > 0 ? (
            <dl className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {preview.map((item) => (
                <div
                  key={item.label}
                  className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,12rem)_1fr] sm:gap-4"
                >
                  <dt className="text-sm font-semibold text-muted-foreground">
                    {item.label}
                  </dt>
                  <dd className="break-words font-mono text-xs">{item.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          <EtForm
            action="db/submit_delete"
            params={[table, update_id]}
            className="flex flex-col gap-2 border-t border-border pt-5 sm:flex-row"
          >
            <Button asChild variant="outline">
              <a href={String(data.cancel_url ?? "")}>Cancel</a>
            </Button>
            <Button type="submit" name="submit" value="Yes - Delete Now">
              Delete record
            </Button>
          </EtForm>
        </CardContent>
      </Card>
    </div>
  );
}
