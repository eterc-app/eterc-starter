import type { EtViewProps } from "@/engine/views-registry";
import {
  createPageDraft,
  type SitePage,
  type SitePageSummary,
} from "../page-types";
import { SiteBuilderStudio } from "../SiteBuilderStudio";

export default function SiteBuilderStudioView({ data }: EtViewProps) {
  const page =
    data.page !== null &&
    typeof data.page === "object" &&
    !Array.isArray(data.page)
      ? (data.page as SitePage)
      : createPageDraft("Home", "landing");

  const pages = Array.isArray(data.pages)
    ? (data.pages as SitePageSummary[])
    : [];

  return (
    <SiteBuilderStudio
      initialPages={pages}
      initialPage={page}
      csrfToken={String(data.csrf_token ?? "")}
      apiRoot={String(data.api_root ?? "/api/xhr/eterc_control-site_builder")}
      publicBase={String(data.public_base ?? "/pages")}
      mediaApiRoot={String(
        data.media_api_root ??
          "/api/xhr/eterc_control-image_uploader_builder"
      )}
      mediaLibraryUrl={String(
        data.media_library_url ?? "/control/image-uploader-builder"
      )}
      moduleGeneratorUrl={String(
        data.module_generator_url ?? "/control/site-builder/module_generator"
      )}
    />
  );
}
