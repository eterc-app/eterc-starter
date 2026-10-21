/**
 * Public URL aliases.
 *
 * Clean paths are the canonical public URLs for the control panel and the
 * administrator module. The legacy PHP paths stay valid for compatibility:
 *
 *   /control                         -> /trongate_control
 *   /control/flo/home                -> /trongate_control-flo/home
 *   /control/module-builder          -> /trongate_control-module_builder
 *   /administrators/manage           -> /trongate_administrators/manage
 *
 * Inbound requests are resolved to the legacy module names before controller
 * dispatch, while the browser URL and `current_url()` keep the clean path.
 * Outbound `site_url()` calls emit the clean path.
 */

const CONTROL_CHILD_ALIASES: Record<string, string> = {
  "module-builder": "module_builder",
  "site-builder": "site_builder",
  "properties": "properties",
  "properties-builder": "properties_builder",
  "flo": "flo",
  "evo": "evo",
  "image-uploader": "image_uploader_builder",
  "image-uploader-builder": "image_uploader_builder",
  "module-relations-builder": "module_relations_builder",
  "relations-builder": "module_relations_builder",
  "query-builder": "query_builder",
  "plural-maker": "plural_maker",
};

/** Longest legacy prefixes first so child modules win over the parent. */
const PUBLIC_PREFIXES: ReadonlyArray<readonly [string, string]> = [
  ["trongate_control-module_relations_builder", "control/module-relations-builder"],
  ["trongate_control-image_uploader_builder", "control/image-uploader-builder"],
  ["trongate_control-properties_builder", "control/properties-builder"],
  ["trongate_control-module_builder", "control/module-builder"],
  ["trongate_control-query_builder", "control/query-builder"],
  ["trongate_control-site_builder", "control/site-builder"],
  ["trongate_control-plural_maker", "control/plural-maker"],
  ["trongate_control-properties", "control/properties"],
  ["trongate_control-flo", "control/flo"],
  ["trongate_control-evo", "control/evo"],
  ["trongate_control", "control"],
  ["trongate_administrators", "administrators"],
];

/**
 * Convert public URL segments to the module/method segments used by the
 * framework. Unknown paths are returned unchanged.
 */
export function resolve_public_route(segments: string[]): string[] {
  const first = segments[0]?.toLowerCase();

  if (first === "administrators") {
    if (segments.length === 1) {
      return ["trongate_administrators", "manage"];
    }
    return ["trongate_administrators", ...segments.slice(1)];
  }

  if (first === "control") {
    const second = segments[1]?.toLowerCase();
    const child = second ? CONTROL_CHILD_ALIASES[second] : undefined;
    if (child) {
      return [`trongate_control-${child}`, ...segments.slice(2)];
    }
    return ["trongate_control", ...segments.slice(1)];
  }

  return segments;
}

/**
 * Convert a framework path to its clean public form. Query strings and hashes
 * are preserved; paths that already use a clean form are unchanged.
 */
export function to_public_path(path: string): string {
  const has_leading_slash = path.startsWith("/");
  const source = has_leading_slash ? path.slice(1) : path;

  for (const [legacy, clean] of PUBLIC_PREFIXES) {
    if (source === legacy) {
      return `${has_leading_slash ? "/" : ""}${clean}`;
    }
    const boundary = source.charAt(legacy.length);
    if (
      source.startsWith(legacy) &&
      (boundary === "/" || boundary === "?" || boundary === "#")
    ) {
      return `${has_leading_slash ? "/" : ""}${clean}${source.slice(legacy.length)}`;
    }
  }

  return path;
}
