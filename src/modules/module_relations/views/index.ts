import type { EtViewComponent } from "@/engine/views-registry";
import PanelBodyView from "./panel_body";
import SummaryPanel from "./summary_panel";

/**
 * View registration map for the module_relations runtime — keys are
 * "{module}/{view_file}" and match the PHP originals under
 * modules/module_relations/views/.
 */
export const views: Record<string, EtViewComponent> = {
  "module_relations/panel_body": PanelBodyView,
  "module_relations/summary_panel": SummaryPanel,
};
