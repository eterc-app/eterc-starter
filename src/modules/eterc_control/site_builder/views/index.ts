import type { EtViewComponent, EtViewProps } from "@/engine/views-registry";
import { SiteBuilderStatus } from "./status";
const StatusView: EtViewComponent = function SiteBuilderStatusView(
  props: EtViewProps
) {
  const data = (props.data ?? {}) as Record<string, unknown>;
  return SiteBuilderStatus({
    generatedModulesDir: data.generated_modules_dir as string | undefined,
    navLinksPath: data.nav_links_path as string | undefined,
  });
};

export const views: Record<string, EtViewComponent> = {
  "site_builder/status": StatusView,
};
