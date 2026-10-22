import type { EtViewProps } from "@/engine/views-registry";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PictureRegion } from "./picture_region";
export default function PicturePanel({ data }: EtViewProps) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Picture</CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <PictureRegion data={data} />
      </CardContent>
    </Card>
  );
}
