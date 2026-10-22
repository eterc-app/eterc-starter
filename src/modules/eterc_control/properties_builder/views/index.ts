import type { EtViewComponent } from "@/engine/views-registry";
import PropertiesBuilderHome from "./home";

/**
 * View registration map for the properties_builder child module — keys are
 * "{module}/{view_file}" and match the PHP view filename
 * modules/eterc_control/properties_builder/views/home.php.
 */
export const views: Record<string, EtViewComponent> = {
  "properties_builder/home": PropertiesBuilderHome,
};
