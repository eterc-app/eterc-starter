import type { TgViewProps } from "@/engine/views-registry";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Database resource not found.
 *
 * Rendered by Db::not_found(); mirrors the administrators module's
 * not_found view using the db controller's data contract
 * { headline, message, back_url, back_label }.
 */
export default function NotFound({ data }: TgViewProps) {
  const headline = String(data.headline ?? "Not Found");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>{headline}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <p className="text-sm text-muted-foreground">
            {String(data.message ?? "")}
          </p>
          <Button asChild variant="outline">
            <a href={String(data.back_url ?? "")}>
              {String(data.back_label ?? "Go Back")}
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
