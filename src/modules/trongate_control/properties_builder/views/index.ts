import type { TgViewComponent } from "@/engine/views-registry";
import PropertiesBuilderHome from "./home";

/**
 * View registration map for the properties_builder child module — keys are
 * "{module}/{view_file}" and match the PHP view filename
 * modules/trongate_control/properties_builder/views/home.php.
 */
export const views: Record<string, TgViewComponent> = {
  "properties_builder/home": PropertiesBuilderHome,
};
