import type { TgViewComponent } from "@/engine/views-registry";
import Main from "./main";

/**
 * View registration map for the trongate_control parent module - keys are
 * "{module}/{view_file}" and match the PHP view filenames under
 * modules/trongate_control/views/.
 *
 * PHP originals: main.php (the SQL import wizard; the port also renders the
 * control-panel dashboard from the same view).
 */
export const views: Record<string, TgViewComponent> = {
  "trongate_control/main": Main,
};
