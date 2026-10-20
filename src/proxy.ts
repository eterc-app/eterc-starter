import { NextRequest, NextResponse } from "next/server";

/**
 * Middleware â€” framework-level request duties:
 *  1. Ensure the signed CSRF cookie exists and expose it to server code via
 *     the `x-tg-csrf` request header (forms embed it; validation compares it).
 *  2. Flashdata one-shot semantics: forward `tg_flash` as a request header and
 *     delete the cookie on the response (PHP session "read once" behaviour).
 */

const CSRF_COOKIE = "tg_csrf";
const CSRF_HEADER = "x-tg-csrf";
const FLASH_COOKIE = "tg_flash";
const FLASH_HEADER = "x-tg-flash";

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Bytes(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return new Uint8Array(digest);
}

async function csrfSecretBytes(): Promise<Uint8Array> {
  const envSecret = process.env.TG_SECRET;
  if (envSecret && envSecret.length >= 16) {
    return new TextEncoder().encode(envSecret);
  }
  // Must match the fallback in src/engine/csrf.ts
  return sha256Bytes("trongate-next-dev-secret");
}

function randomHex(byteCount: number): string {
  const buffer = new Uint8Array(byteCount);
  crypto.getRandomValues(buffer);
  return Array.from(buffer)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacHex(keyBytes: Uint8Array, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value)
  );
  return toHex(signature);
}

export async function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);

  let csrfValue = request.cookies.get(CSRF_COOKIE)?.value ?? "";
  let setCsrfCookie = false;
  if (!csrfValue) {
    const nonce = randomHex(32);
    const secret = await csrfSecretBytes();
    csrfValue = `${nonce}.${await hmacHex(secret, nonce)}`;
    setCsrfCookie = true;
  }
  requestHeaders.set(CSRF_HEADER, csrfValue);

  let flashValue: string | undefined;
  if (request.method === "GET") {
    flashValue = request.cookies.get(FLASH_COOKIE)?.value || undefined;
    if (flashValue) {
      requestHeaders.set(FLASH_HEADER, flashValue);
    }
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  if (setCsrfCookie) {
    response.cookies.set(CSRF_COOKIE, csrfValue, {
      path: "/",
      sameSite: "lax",
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 7,
    });
  }

  if (flashValue) {
    // Consume the flash message (one-shot semantics).
    response.cookies.set(FLASH_COOKIE, "", { path: "/", maxAge: 0 });
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next|favicon.ico|css/|js/|trongate-icons/|[a-z0-9_]+_module/|uploads/).*)",
  ],
};

