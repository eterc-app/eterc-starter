import { createElement } from "react";
import type { EtViewComponent, EtViewProps } from "@/engine/views-registry";
import ConfRelationDetails from "./conf_relation_details";
import { ModuleRelationsBuilderWizard } from "../ModuleRelationsBuilderWizard";

function wizardAt(initialStep: string): EtViewComponent {
  return function ModuleRelationsBuilderStep(props: EtViewProps) {
    const data = {
      ...((props.data ?? {}) as Record<string, unknown>),
      initialStep,
    };
    return createElement(ModuleRelationsBuilderWizard, { data });
  };
}

export const views: Record<string, EtViewComponent> = {
  "module_relations_builder/choose_relation_type": wizardAt(
    "choose_relation_type"
  ),
  "module_relations_builder/select_module": wizardAt("select_module"),
  "module_relations_builder/bridging_question": wizardAt(
    "bridging_question"
  ),
  "module_relations_builder/conf_generate_relation": wizardAt(
    "conf_generate_relation"
  ),
  "module_relations_builder/conf_relation_details": ConfRelationDetails,
  "module_relations_builder/generate_relation": wizardAt(
    "generate_relation"
  ),
};
