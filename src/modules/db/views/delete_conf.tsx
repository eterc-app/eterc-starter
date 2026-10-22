import { EtForm } from "@/engine/ui/EtForm";
import type { EtViewProps } from "@/engine/views-registry";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Delete confirmation — the `db` module's pre-deletion page.
 *
 * Rendered by Db::delete_conf() with
 * { headline, table, update_id, preview, cancel_url }. The preview is a short
 * read-only excerpt of the record being deleted (label/value pairs supplied by
 * the controller). Deletion only happens on "Yes - Delete Now".
 */

interface PreviewItem {
  label: string;
  value: string;
}

export default function DeleteConf({ data }: EtViewProps) {
  const table = String(data.table ?? "");
  const update_id = Number(data.update_id ?? 0);
  const preview = (data.preview ?? []) as PreviewItem[];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Confirmation Required</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <p className="font-medium">Are you sure?</p>
          <p className="text-sm text-muted-foreground">
            You are about to delete record #{update_id} from &apos;{table}&apos;.
            This cannot be undone. Do you really want to do this?
          </p>

          {preview.length > 0 ? (
            <dl className="divide-y rounded-md border bg-muted/30 px-4">
              {preview.map((item) => (
                <div
                  key={item.label}
                  className="grid gap-1 py-3 sm:grid-cols-[minmax(0,12rem)_1fr] sm:gap-4"
                >
                  <dt className="text-sm font-medium text-muted-foreground">
                    {item.label}
                  </dt>
                  <dd className="break-words text-sm">{item.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          <EtForm
            action="db/submit_delete"
            params={[table, update_id]}
            className="flex flex-col gap-2 border-t pt-4 sm:flex-row"
          >
            <Button asChild variant="outline">
              <a href={String(data.cancel_url ?? "")}>Cancel</a>
            </Button>
            <Button type="submit" name="submit" value="Yes - Delete Now">
              Yes - Delete Now
            </Button>
          </EtForm>
        </CardContent>
      </Card>
    </div>
  );
}
