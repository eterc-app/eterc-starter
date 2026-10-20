import type { TgViewComponent, TgViewProps } from "@/engine/views-registry";
import { SiteBuilderStatus } from "./status";

/**
 * View registration map for the site_builder child module.
 *
 * site_builder has no PHP views; the only key is the port-only status page
 * rendered by Site_builder::index().
 */
const StatusView: TgViewComponent = function SiteBuilderStatusView(
  props: TgViewProps
) {
  const data = (props.data ?? {}) as Record<string, unknown>;
  return SiteBuilderStatus({
    generatedModulesDir: data.generated_modules_dir as string | undefined,
    navLinksPath: data.nav_links_path as string | undefined,
  });
};

export const views: Record<string, TgViewComponent> = {
  "site_builder/status": StatusView,
};
