import type { EtViewComponent } from "@/engine/views-registry";
import FloHome from "./home";
import FloTriggerView from "./flo_trigger";

/**
 * View registration map for the Flo child module.
 *
 * Keys use the PHP view names under modules/eterc_control/flo/views/.
 */
export const views: Record<string, EtViewComponent> = {
  "flo/home": FloHome,
  "flo/flo_trigger": FloTriggerView,
};
