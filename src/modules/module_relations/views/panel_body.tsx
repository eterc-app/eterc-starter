import type { EtViewProps } from "@/engine/views-registry";
import { PanelBody } from "./PanelBody";
import type { PanelBodyData } from "./types";

/**
 * panel_body view — the server-renderable entry point of the panel body.
 *
 * Registered as "module_relations/panel_body" so PHP-parity callers (a plain
 * form post, a server-rendered page) receive the same two-region markup the
 * PHP view produced. Interactive callers use the JSON representation and the
 * PanelBody component directly.
 */
export default function PanelBodyView({ data }: EtViewProps) {
  return <PanelBody data={data as unknown as PanelBodyData} />;
}
