import type { EtViewProps } from "@/engine/views-registry";
import { PanelBody } from "./PanelBody";
import type { PanelBodyData } from "./types";
export default function PanelBodyView({ data }: EtViewProps) {
  return <PanelBody data={data as unknown as PanelBodyData} />;
}
