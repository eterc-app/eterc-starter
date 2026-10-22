import type { EtViewComponent } from "@/engine/views-registry";
import Main from "./main";

/**
 * View registration map for the eterc_control parent module - keys are
 * "{module}/{view_file}" and match the PHP view filenames under
 * modules/eterc_control/views/.
 *
 * PHP originals: main.php (the SQL import wizard; the port also renders the
 * control-panel dashboard from the same view).
 */
export const views: Record<string, EtViewComponent> = {
  "eterc_control/main": Main,
};
