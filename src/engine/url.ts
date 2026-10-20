import { BASE_URL } from "./config";
import { getContext, previousUrl as ctxPreviousUrl, currentUrl as ctxCurrentUrl } from "./request-context";
import { TgRedirectSignal } from "./signals";

/**
 * URL helpers — port of engine/tg_helpers/url_helper.php + modules/url.
 *
 * segment(), current_url(), previous_url(), get_num_segments() and
 * get_last_segment() are re-exported from the request context.
 */

export { segment, currentUrl, previousUrl, removeQueryString, getNumSegments, getLastSegment } from "./request-context";

/** Absolute URL for a framework path (respects BASE_URL). */
export function siteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const base = BASE_URL.endsWith("/") ? BASE_URL : BASE_URL + "/";
  return base.replace(/\/$/, "") + "/" + path.replace(/^\//, "");
}

/**
 * Redirect to a URL and stop processing (throws; the dispatcher performs the
 * actual navigation — PHP parity for `redirect('module/method')`).
 */
export function redirect(target: string): never {
  throw new TgRedirectSignal(siteUrl(target));
}

/** anchor() — PHP parity string builder. */
export function anchor(
  url: string,
  text: string,
  attributes: Record<string, string> = {}
): string {
  const href = /^https?:\/\//.test(url) ? url : siteUrl(url);
  const attrs = Object.entries(attributes)
    .map(([key, value]) => ` ${key}="${String(value).replace(/"/g, "&quot;")}"`)
    .join("");
  return `<a href="${href}"${attrs}>${text}</a>`;
}

/** Full current URL including query string. */
export function currentUrlWithQuery(): string {
  const ctx = getContext();
  return ctx.url;
}

/** HTTP referrer (fallback: current URL). */
export function referrer(): string {
  return ctxPreviousUrl() || ctxCurrentUrl();
}
