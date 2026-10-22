import type { EtViewProps } from "@/engine/views-registry";
import { PictureRegion } from "./picture_region";
export default function PanelBody({ data }: EtViewProps) {
  return <PictureRegion data={data} />;
}
