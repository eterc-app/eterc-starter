import type { EtViewProps } from "@/engine/views-registry";
import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function NotFound({ data }: EtViewProps) {
  return (
    <div className="app-page max-w-3xl">
      <PageHeader eyebrow="Database" title="Record not found" />

      <Card>
        <CardContent className="space-y-5 pt-6">
          <p className="text-sm text-muted-foreground">
            {String(
              data.message ??
                "The record you are looking for does not exist or has been deleted."
            )}
          </p>
          <Button asChild variant="outline">
            <a href={String(data.back_url ?? "")}>
              {String(data.back_label ?? "Go back")}
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
