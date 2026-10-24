import type { EtViewProps } from "@/engine/views-registry";
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
      csrfToken={String(data.csrf_token ?? "")}
      uploadUrl={String(data.upload_url ?? "/api/media/upload")}
      apiRoot={String(data.api_root ?? "/api/xhr/media")}
    />
  );
}
