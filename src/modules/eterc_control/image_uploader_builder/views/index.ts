import { createElement } from "react";
import type { EtViewComponent, EtViewProps } from "@/engine/views-registry";
import ConfUploaderDetails from "./conf_uploader_details";
import { ImageUploaderBuilderWizard } from "../ImageUploaderBuilderWizard";

function wizardAt(initialStep: string): EtViewComponent {
  return function ImageUploaderBuilderStep(props: EtViewProps) {
    const data = {
      ...((props.data ?? {}) as Record<string, unknown>),
      initialStep,
    };
    return createElement(ImageUploaderBuilderWizard, { data });
  };
}

export const views: Record<string, EtViewComponent> = {
  "image_uploader_builder/choose_mod": wizardAt("choose_mod"),
  "image_uploader_builder/conf_generate_uploader": wizardAt(
    "conf_generate_uploader"
  ),
  "image_uploader_builder/conf_uploader_details": ConfUploaderDetails,
  "image_uploader_builder/generate_result": wizardAt("generate_result"),
};
