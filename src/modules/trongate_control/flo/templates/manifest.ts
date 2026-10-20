/**
 * Generated module manifest — records the metadata Flo (and the generated
 * module index) needs without opening the generated TypeScript files.
 */

import type { GeneratedModuleManifest, TemplateContext } from "../FloTypes";

/** Build the manifest.json body for a generated module. */
export function buildManifest(
  data: TemplateContext,
  generated_at = new Date().toISOString()
): GeneratedModuleManifest {
  return {
    module_name: data.module_folder_name,
    class_name: data.controller_name,
    record_name_singular: data.record_name_singular,
    record_name_plural: data.record_name_plural,
    nav_label: String(data.nav_label ?? ""),
    url_column: data.url_column,
    order_by: data.order_by,
    has_searchable: data.has_searchable,
    view_files: [...data.view_files],
    generated_by: "flo",
    generated_at,
  };
}

/** Serialise a manifest with a trailing newline (matches site_builder JSON style). */
export function renderManifest(manifest: GeneratedModuleManifest): string {
  return JSON.stringify(manifest, null, 2) + "\n";
}
