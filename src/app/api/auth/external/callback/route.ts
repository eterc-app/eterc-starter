import { NextRequest, NextResponse } from "next/server";
import { build_request } from "@/engine/dispatch";
import { admin_login_path } from "@/engine/config";
import { run_with_context, type EtRequest } from "@/engine/request-context";
import { site_url } from "@/engine/Url";
import { OAuthError } from "@/modules/login/oauth";
import {
  complete_external_auth,
} from "@/modules/login/external-auth";

function apply_cookies(response: NextResponse, context: EtRequest): void {
  for (const cookie of context.responseCookies) {
    response.cookies.set(
      cookie.name,
      cookie.value,
      (cookie.options ?? {}) as Parameters<typeof response.cookies.set>[2],
    );
  }
}

function redirect_url(request: NextRequest, target: string): URL {
  return new URL(site_url(target), request.url);
}

function login_error_url(request: NextRequest, code: string): URL {
  return new URL(
    site_url(`${admin_login_path()}?login_error=${encodeURIComponent(code)}`),
    request.url,
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const options = {
    segments: ["api", "auth", "external", "callback"],
    query: Object.fromEntries(request.nextUrl.searchParams.entries()),
    canSetCookies: true,
    method: "GET",
  };
  const ctx = await build_request(options);
  const state = request.nextUrl.searchParams.get("state") ?? "";
  const code = request.nextUrl.searchParams.get("code") ?? "";

  if (!code) {
    const response = NextResponse.redirect(login_error_url(request, "oauth_denied"));
    apply_cookies(response, ctx);
    return response;
  }

  try {
    const target = await run_with_context(ctx, () =>
      complete_external_auth(state, code),
    );
    const response = NextResponse.redirect(redirect_url(request, target));
    apply_cookies(response, ctx);
    return response;
  } catch (error) {
    const code_value =
      error instanceof OAuthError ? error.code : "oauth_failed";
    const response = NextResponse.redirect(
      login_error_url(request, code_value),
    );
    apply_cookies(response, ctx);
    return response;
  }
}
