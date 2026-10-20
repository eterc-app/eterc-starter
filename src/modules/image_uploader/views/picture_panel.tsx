import type { TgViewProps } from "@/engine/views-registry";
import { PictureRegion } from "./picture_region";

/**
 * Image Uploader — show-page "Picture" card.
 * Port of modules/image_uploader/views/picture_panel.php.
 *
 * The PHP view was a shell that fetched its body via Trongate MX. The port
 * renders the card and its live region server-side (see draw_panel()), so
 * the panel always reflects the current database state without an extra
 * client fetch.
 */
export default function PicturePanel({ data }: TgViewProps) {
  return (
    <div className="card">
      <div className="card-heading">Picture</div>
      <div className="card-body">
        <PictureRegion data={data} />
      </div>
    </div>
  );
}
