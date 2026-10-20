import { createElement } from "react";
import type { TgViewComponent, TgViewProps } from "@/engine/views-registry";
import ConfUploaderDetails from "./conf_uploader_details";
import { ImageUploaderBuilderWizard } from "../ImageUploaderBuilderWizard";

/**
 * View registration map for the image_uploader_builder child module.
 *
 * Keys are "{module}/{view_file}" and match the PHP view filenames under
 * modules/trongate_control/image_uploader_builder/views/. Every wizard step
 * renders the same client wizard positioned at that step, so direct URLs
 * (and non-AJAX POST fallbacks) show the correct screen.
 */

function wizardAt(initialStep: string): TgViewComponent {
  return function ImageUploaderBuilderStep(props: TgViewProps) {
    const data = {
      ...((props.data ?? {}) as Record<string, unknown>),
      initialStep,
    };
    return createElement(ImageUploaderBuilderWizard, { data });
  };
}

export const views: Record<string, TgViewComponent> = {
  "image_uploader_builder/choose_mod": wizardAt("choose_mod"),
  "image_uploader_builder/conf_generate_uploader": wizardAt(
    "conf_generate_uploader"
  ),
  "image_uploader_builder/conf_uploader_details": ConfUploaderDetails,
  "image_uploader_builder/generate_result": wizardAt("generate_result"),
};
