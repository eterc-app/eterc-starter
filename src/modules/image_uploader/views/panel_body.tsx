import type { EtViewProps } from "@/engine/views-registry";
import { PictureRegion } from "./picture_region";

/**
 * Image Uploader — picture panel live region (runtime).
 * Port of modules/image_uploader/views/panel_body.php.
 *
 * Rendered by draw_panel() (inside the Picture card) and returned by
 * remove_picture() so the interactive region can swap itself in place.
 * The single panel-scoped region (#iu-{panel_id}-body) is rendered by the
 * client component, keeping the markup identical in both cases.
 */
export default function PanelBody({ data }: EtViewProps) {
  return <PictureRegion data={data} />;
}
