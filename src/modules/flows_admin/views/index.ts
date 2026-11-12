import type { EtViewComponent } from "@/engine/views-registry";
import FlowsList from "./FlowsList";
import FlowBuilder from "./FlowBuilder";

export const views: Record<string, EtViewComponent> = {
  "flows_admin/index": FlowsList,
  "flows_admin/builder": FlowBuilder,
};
