import { getContext, hasContext } from "./request-context";
import { FLASHDATA_CLOSE, FLASHDATA_OPEN } from "./config";

/**
 * Flashdata — one-time messages, port of the flashdata module.
 *
 * set_flashdata() stores a JSON payload in the `tg_flash` cookie; middleware
 * forwards it as the `x-tg-flash` request header on GET renders and clears the
 * cookie afterwards, which reproduces PHP's "read once" session semantics.
 */

export const FLASH_COOKIE = "tg_flash";
export const FLASH_HEADER = "x-tg-flash";

interface FlashPayload {
  messages: string[];
}

function readFlashRaw(): FlashPayload | null {
  if (!hasContext()) return null;
  const ctx = getContext();

  const fromHeader = ctx.headers.get(FLASH_HEADER);
  const raw = fromHeader ?? ctx.cookies[FLASH_COOKIE];
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as FlashPayload;
    if (parsed && Array.isArray(parsed.messages)) return parsed;
  } catch {
    /* fall through */
  }
  return null;
}

/** Set a one-time flash message (call before redirect()). */
export function setFlashdata(msg: string): void {
  const ctx = getContext();
  const existing = readFlashRaw()?.messages ?? [];
  const payload: FlashPayload = { messages: [...existing, msg] };

  ctx.flashBuffer.push(msg);

  if (ctx.canSetCookies) {
    ctx.responseCookies.push({
      name: FLASH_COOKIE,
      value: JSON.stringify(payload),
      options: { httpOnly: false, sameSite: "lax", path: "/", maxAge: 300 },
    });
  }
}

/**
 * Retrieve the flash message formatted with the PHP framework's wrapping
 * hierarchy (arguments → FLASHDATA_OPEN/CLOSE → default <p class="flashdata">).
 * Returns the HTML string (PHP parity helper) — React views use <Flashdata />.
 */
export function flashdata(
  openingHtml?: string | null,
  closingHtml?: string | null
): string | null {
  const payload = readFlashRaw();
  if (!payload || payload.messages.length === 0) return null;

  const open = openingHtml ?? (FLASHDATA_OPEN || '<p class="flashdata">');
  const close = closingHtml ?? (FLASHDATA_CLOSE || "</p>");

  return payload.messages.map((m) => `${open}${escapeHtml(m)}${close}`).join("");
}

/** Plain flash messages for React rendering. */
export function flashMessages(): string[] {
  const carried = readFlashRaw()?.messages ?? [];
  if (!hasContext()) return carried;
  return [...carried, ...getContext().flashBuffer];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
