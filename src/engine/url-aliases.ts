/**
 * Public URL aliases.
 *
 * Clean paths are the canonical public URLs for the control panel and the
 * administrator module. Inbound requests are resolved to the internal module
 * names before controller dispatch:
 *
 *   /control                         -> /eterc_control
 *   /control/flo/home                -> /eterc_control-flo/home
 *   /control/module-builder          -> /eterc_control-module_builder
 *   /administrators/manage           -> /eterc_administrators/manage
 *
 * The browser URL and `current_url()` keep the clean path. Outbound
 * `site_url()` calls emit the clean path.
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
  ["cms_admin", "admin"],
  ["eterc_control-module_relations_builder", "control/module-relations-builder"],
  ["eterc_control-image_uploader_builder", "control/image-uploader-builder"],
  ["eterc_control-properties_builder", "control/properties-builder"],
  ["eterc_control-module_builder", "control/module-builder"],
  ["eterc_control-query_builder", "control/query-builder"],
  ["eterc_control-site_builder", "control/site-builder"],
  ["eterc_control-plural_maker", "control/plural-maker"],
  ["eterc_control-properties", "control/properties"],
  ["eterc_control-flo", "control/flo"],
  ["eterc_control-evo", "control/evo"],
  ["eterc_control", "control"],
  ["eterc_administrators", "administrators"],
];

/**
 * Convert public URL segments to the module/method segments used by the
 * framework. Unknown paths are returned unchanged.
 */
export function resolve_public_route(segments: string[]): string[] {
  const first = segments[0]?.toLowerCase();

  if (first === "admin") {
    if (segments.length === 1) {
      return ["cms_admin", "index"];
    }
    return ["cms_admin", ...segments.slice(1)];
  }

  if (first === "administrators") {
    if (segments.length === 1) {
      return ["eterc_administrators", "manage"];
    }
    return ["eterc_administrators", ...segments.slice(1)];
  }

  if (first === "control") {
    const second = segments[1]?.toLowerCase();
    const child = second ? CONTROL_CHILD_ALIASES[second] : undefined;
    if (child) {
      return [`eterc_control-${child}`, ...segments.slice(2)];
    }
    return ["eterc_control", ...segments.slice(1)];
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
