import type { EtViewComponent } from "@/engine/views-registry";
import PanelBody from "./panel_body";
import PicturePanel from "./picture_panel";
import UploadForm from "./upload_form";
export const views: Record<string, EtViewComponent> = {
  "image_uploader/panel_body": PanelBody,
  "image_uploader/picture_panel": PicturePanel,
  "image_uploader/upload_form": UploadForm,
};
