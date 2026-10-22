import { BASE_URL } from "./config";
import { get_context, previous_url as ctxPreviousUrl, current_url as ctxCurrentUrl } from "./request-context";
import { EtRedirectSignal } from "./signals";
import { to_public_path } from "./url-aliases";

/**
 * URL helpers — port of engine/et_helpers/url_helper.php + modules/url.
 *
 * segment(), current_url(), previous_url(), get_num_segments() and
 * get_last_segment() are re-exported from the request context.
 */

export { segment, current_url, previous_url, remove_query_string, get_num_segments, get_last_segment } from "./request-context";

/** Absolute URL for a framework path (respects BASE_URL). */
export function site_url(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const base = BASE_URL.endsWith("/") ? BASE_URL : BASE_URL + "/";
  const publicPath = to_public_path(path);
  return base.replace(/\/$/, "") + "/" + publicPath.replace(/^\//, "");
}

/**
 * Redirect to a URL and stop processing (throws; the dispatcher performs the
 * actual navigation — PHP parity for `redirect('module/method')`).
 */
export function redirect(target: string): never {
  throw new EtRedirectSignal(site_url(target));
}

/** anchor() — PHP parity string builder. */
export function anchor(
  url: string,
  text: string,
  attributes: Record<string, string> = {}
): string {
  const href = /^https?:\/\//.test(url) ? url : site_url(url);
  const attrs = Object.entries(attributes)
    .map(([key, value]) => ` ${key}="${String(value).replace(/"/g, "&quot;")}"`)
    .join("");
  return `<a href="${href}"${attrs}>${text}</a>`;
}

/** Full current URL including query string. */
export function current_url_with_query(): string {
  const ctx = get_context();
  return ctx.url;
}

/** HTTP referrer (fallback: current URL). */
export function referrer(): string {
  return ctxPreviousUrl() || ctxCurrentUrl();
}
