/**
 * Public URL aliases.
 *
 * Clean paths are the canonical public URLs for the CMS admin and the legacy
 * administrator module. Inbound requests are resolved to the internal module
 * names before controller dispatch:
 *
 *   /admin                  -> /cms_admin
 *   /administrators/manage  -> /eterc_administrators/manage
 *
 * The browser URL and `current_url()` keep the clean path. Outbound
 * `site_url()` calls emit the clean path.
 */

/** Longest legacy prefixes first so child modules win over the parent. */
const PUBLIC_PREFIXES: ReadonlyArray<readonly [string, string]> = [
  ["cms_admin", "admin"],
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
    if (segments[1]?.toLowerCase() === "media") {
      return ["media", "index"];
    }
    return ["cms_admin", ...segments.slice(1)];
  }

  if (first === "administrators") {
    if (segments.length === 1) {
      return ["eterc_administrators", "manage"];
    }
    return ["eterc_administrators", ...segments.slice(1)];
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
