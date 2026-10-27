import { NextRequest, NextResponse } from "next/server";
import { build_request } from "@/engine/dispatch";
import { admin_login_path } from "@/engine/config";
import { run_with_context, type EtRequest } from "@/engine/request-context";
import { site_url } from "@/engine/Url";
import { OAuthError, start_oauth } from "@/modules/login/oauth";

function apply_cookies(response: NextResponse, context: EtRequest): void {
  for (const cookie of context.responseCookies) {
    response.cookies.set(
      cookie.name,
      cookie.value,
      (cookie.options ?? {}) as Parameters<typeof response.cookies.set>[2]
    );
  }
}

function login_error_url(request: NextRequest, code: string): URL {
  return new URL(
    site_url(`${admin_login_path()}?login_error=${encodeURIComponent(code)}`),
    request.url
  );
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> }
): Promise<NextResponse> {
  const { provider } = await context.params;
  const level = request.nextUrl.searchParams.get("level") ?? "";
  const options = {
    segments: ["api", "auth", "oauth", provider],
    query: { level },
    canSetCookies: true,
    method: "GET",
  };
  const ctx = await build_request(options);

  try {
    const authorize_url = run_with_context(ctx, () => start_oauth(provider, level));
    const response = NextResponse.redirect(authorize_url);
    apply_cookies(response, ctx);
    return response;
  } catch (error) {
    const code = error instanceof OAuthError ? error.code : "oauth_failed";
    const response = NextResponse.redirect(login_error_url(request, code));
    apply_cookies(response, ctx);
    return response;
  }
}
