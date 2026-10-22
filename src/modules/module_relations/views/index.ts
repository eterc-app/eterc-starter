import type { EtViewComponent } from "@/engine/views-registry";
import PanelBodyView from "./panel_body";
import SummaryPanel from "./summary_panel";
export const views: Record<string, EtViewComponent> = {
  "module_relations/panel_body": PanelBodyView,
  "module_relations/summary_panel": SummaryPanel,
};
