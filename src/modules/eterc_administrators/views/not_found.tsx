import type { EtViewProps } from "@/engine/views-registry";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
export default function NotFound({ data }: EtViewProps) {
  const headline = String(data.headline ?? "");

  return (
    <div className="space-y-6">
      <h1>{headline}</h1>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>{headline}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 pt-6">
          <p className="text-sm text-muted-foreground">
            {String(data.message ?? "")}
          </p>
          <Button asChild variant="outline">
            <a href={String(data.back_url ?? "")}>
              {String(data.back_label ?? "")}
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
