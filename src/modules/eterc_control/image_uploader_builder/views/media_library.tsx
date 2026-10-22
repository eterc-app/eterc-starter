import type { EtViewProps } from "@/engine/views-registry";
import type { UploaderModuleChoice } from "../types";
import type { MediaItem, MediaStats } from "../media-store";
import { MediaLibrary } from "../MediaLibrary";

export default function MediaLibraryView({ data }: EtViewProps) {
  const media = Array.isArray(data.media) ? (data.media as MediaItem[]) : [];
  const stats =
    data.stats !== null && typeof data.stats === "object"
      ? (data.stats as MediaStats)
      : {
          count: media.length,
          total_bytes: media.reduce((total, item) => total + item.size, 0),
          total_label: "",
        };

  return (
    <MediaLibrary
      initialMedia={media}
      initialStats={stats}
      modules={
        Array.isArray(data.modules)
          ? (data.modules as UploaderModuleChoice[])
          : []
      }
      csrfToken={String(data.csrf_token ?? "")}
      uploadUrl={String(data.upload_url ?? "/api/media/upload")}
      apiRoot={String(
        data.api_root ?? "/api/xhr/eterc_control-image_uploader_builder"
      )}
      uploaderDetailsUrl={String(data.uploader_details_url ?? "")}
    />
  );
}
