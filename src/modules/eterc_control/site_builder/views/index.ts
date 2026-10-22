import type { EtViewComponent, EtViewProps } from "@/engine/views-registry";
import { SiteBuilderStatus } from "./status";
import SiteBuilderStudioView from "./studio";
const StatusView: EtViewComponent = function SiteBuilderStatusView(
  props: EtViewProps
) {
  const data = (props.data ?? {}) as Record<string, unknown>;
  return SiteBuilderStatus({
    generatedModulesDir: data.generated_modules_dir as string | undefined,
    navLinksPath: data.nav_links_path as string | undefined,
    studioUrl: data.studio_url as string | undefined,
  });
};

export const views: Record<string, EtViewComponent> = {
  "site_builder/studio": SiteBuilderStudioView,
  "site_builder/status": StatusView,
};
