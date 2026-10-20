import { createElement } from "react";
import type { TgViewComponent, TgViewProps } from "@/engine/views-registry";
import ConfRelationDetails from "./conf_relation_details";
import { ModuleRelationsBuilderWizard } from "../ModuleRelationsBuilderWizard";

/**
 * View registration map for the module_relations_builder child module.
 *
 * Keys are "{module}/{view_file}" and match the PHP view filenames under
 * modules/trongate_control/module_relations_builder/views/. Every wizard step
 * renders the same client wizard positioned at that step, so direct URLs
 * (and non-AJAX POST fallbacks) show the correct screen.
 */

function wizardAt(initialStep: string): TgViewComponent {
  return function ModuleRelationsBuilderStep(props: TgViewProps) {
    const data = {
      ...((props.data ?? {}) as Record<string, unknown>),
      initialStep,
    };
    return createElement(ModuleRelationsBuilderWizard, { data });
  };
}

export const views: Record<string, TgViewComponent> = {
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
