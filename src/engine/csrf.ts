import { get_context } from "./request-context";
import { CSRF_COOKIE, CSRF_FIELD, CSRF_HEADER } from "./config";
import { sqlite } from "./db";
import * as crypto from "node:crypto";

export const csrf_field_name = CSRF_FIELD;

function secret(): Buffer {
  const env = process.env.ET_SECRET;
  if (env && env.length >= 16) return Buffer.from(env, "utf8");
  // Fallback: derive a stable secret for dev so tokens survive restarts.
  // (ET_SECRET should always be configured in production.)
  const g = globalThis as unknown as { __etCsrfSecret?: Buffer };
  if (!g.__etCsrfSecret) {
    g.__etCsrfSecret = crypto.createHash("sha256").update("eterc-dev-secret").digest();
  }
  return g.__etCsrfSecret;
}

/** Create a fresh signed token (nonce.signature). */
export function create_csrf_token(): string {
  const nonce = crypto.randomBytes(32).toString("hex");
  const sig = crypto.createHmac("sha256", secret()).update(nonce).digest("hex");
  return `${nonce}.${sig}`;
}

export function is_valid_csrf_token(token: string): boolean {
  if (typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [nonce, sig] = parts;
  const expected = crypto.createHmac("sha256", secret()).update(nonce).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

/** Token for this request — middleware-issued header, cookie, or fresh token. */
export function csrf_token(): string {
  const ctx = get_context();
  const fromHeader = ctx.headers.get(CSRF_HEADER);
  if (fromHeader && is_valid_csrf_token(fromHeader)) return fromHeader;
  const existing = ctx.cookies[CSRF_COOKIE];
  if (existing && is_valid_csrf_token(existing)) return existing;
  return create_csrf_token();
}

/** Compare posted token with the request's expected value (constant time). */
export function csrf_check(posted: string): boolean {
  const ctx = get_context();
  const expected = ctx.headers.get(CSRF_HEADER) ?? ctx.cookies[CSRF_COOKIE];
  if (!expected || !posted) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(posted));
  } catch {
    return false;
  }
}
