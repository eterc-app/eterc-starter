import type { EtViewComponent } from "@/engine/views-registry";
import FloHome from "./home";
import FloTriggerView from "./flo_trigger";
export const views: Record<string, EtViewComponent> = {
  "flo/home": FloHome,
  "flo/flo_trigger": FloTriggerView,
};
