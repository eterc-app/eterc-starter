import { NextRequest, NextResponse } from "next/server";
import { build_request } from "@/engine/dispatch";
import { admin_login_path } from "@/engine/config";
import { run_with_context, type EtRequest } from "@/engine/request-context";
import { site_url } from "@/engine/Url";
import {
  OAuthError,
  complete_oauth,
  consume_oauth_transaction,
} from "@/modules/login/oauth";

function apply_cookies(response: NextResponse, context: EtRequest): void {
  for (const cookie of context.responseCookies) {
    response.cookies.set(
      cookie.name,
      cookie.value,
      (cookie.options ?? {}) as Parameters<typeof response.cookies.set>[2]
    );
  }
}

function redirect_url(request: NextRequest, target: string): URL {
  return new URL(site_url(target), request.url);
}

function login_error_url(request: NextRequest, code: string, level_slug?: string): URL {
  const target = level_slug
    ? `login/login/${encodeURIComponent(level_slug)}?login_error=${encodeURIComponent(code)}`
    : `${admin_login_path()}?login_error=${encodeURIComponent(code)}`;

  return redirect_url(request, target);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> }
): Promise<NextResponse> {
  const { provider } = await context.params;
  const params = request.nextUrl.searchParams;
  const options = {
    segments: ["api", "auth", "oauth", provider, "callback"],
    query: Object.fromEntries(params.entries()),
    canSetCookies: true,
    method: "GET",
  };
  const ctx = await build_request(options);
  const state = params.get("state") ?? "";
  const transaction = run_with_context(ctx, () =>
    consume_oauth_transaction(provider, state)
  );

  if (!transaction) {
    const response = NextResponse.redirect(login_error_url(request, "oauth_state"));
    apply_cookies(response, ctx);
    return response;
  }

  if (params.get("error")) {
    const response = NextResponse.redirect(
      login_error_url(request, "oauth_denied", transaction.level_slug)
    );
    apply_cookies(response, ctx);
    return response;
  }

  try {
    const target = await run_with_context(ctx, () =>
      complete_oauth(transaction, params.get("code") ?? "")
    );
    const response = NextResponse.redirect(redirect_url(request, target));
    apply_cookies(response, ctx);
    return response;
  } catch (error) {
    const code = error instanceof OAuthError ? error.code : "oauth_failed";
    const response = NextResponse.redirect(
      login_error_url(request, code, transaction.level_slug)
    );
    apply_cookies(response, ctx);
    return response;
  }
}
