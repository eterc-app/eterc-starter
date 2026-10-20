import type { TgViewComponent } from "@/engine/views-registry";
import EvoHome from "./home";
import EvoModuleManager from "./module_manager";
import EvoAsk from "./ask";
import EvoDisabled from "./disabled";
import EvoErrorElement from "./error_element";
import EvoGenerationError from "./generation_error";
import EvoModuleDetailsIframe from "./module_details_iframe";

/**
 * View registration map for the Evo child module.
 *
 * Keys use the PHP view names under modules/trongate_control/evo/views/.
 */
export const views: Record<string, TgViewComponent> = {
  "evo/home": EvoHome,
  "evo/module_manager": EvoModuleManager,
  "evo/ask": EvoAsk,
  "evo/disabled": EvoDisabled,
  "evo/error_element": EvoErrorElement,
  "evo/generation_error": EvoGenerationError,
  "evo/module_details_iframe": EvoModuleDetailsIframe,
};
