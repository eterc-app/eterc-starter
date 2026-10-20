import { createElement } from "react";
import type { TgViewComponent, TgViewProps } from "@/engine/views-registry";
import ConfModuleDetails from "./conf_module_details";
import { ModuleBuilderWizard } from "../ModuleBuilderWizard";

/**
 * View registration map for the module_builder child module.
 *
 * Keys are "{module}/{view_file}" and match the PHP view filenames under
 * modules/trongate_control/module_builder/views/. Every wizard step renders
 * the same client wizard positioned at that step, so direct URLs
 * (and non-AJAX POST fallbacks) show the correct screen.
 */

function wizardAt(initialStep: string): TgViewComponent {
  return function ModuleBuilderStep(props: TgViewProps) {
    const data = {
      ...((props.data ?? {}) as Record<string, unknown>),
      initialStep,
    };
    return createElement(ModuleBuilderWizard, { data });
  };
}

export const views: Record<string, TgViewComponent> = {
  "module_builder/enter_mod_name": wizardAt("enter_mod_name"),
  "module_builder/add_nav_label": wizardAt("add_nav_label"),
  "module_builder/lets_add_properties_conf": wizardAt("lets_add_properties_conf"),
  "module_builder/choose_url_column": wizardAt("choose_url_column"),
  "module_builder/choose_order_by": wizardAt("choose_order_by"),
  "module_builder/conf_generate_mod": wizardAt("conf_generate_mod"),
  "module_builder/conf_module_details": ConfModuleDetails,
  "module_builder/generate_module": wizardAt("generate_module"),
};
