import { NextRequest, NextResponse } from "next/server";
import { build_request, run_in_context, flush_response_cookies } from "@/engine/dispatch";
import { run_with_context } from "@/engine/request-context";
import { EtHttpError, EtRedirectSignal } from "@/engine/signals";
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ segments: string[] }> }
) {
  const { segments } = await context.params;

  let json: unknown = {};
  try {
    json = await request.json();
  } catch {
    json = {};
  }

  const options = {
    segments,
    json,
    isAjax: true,
    canSetCookies: true,
    method: "POST",
  };
  const ctx = await build_request(options);

  try {
    const result = await run_with_context(ctx, () => run_in_context(options));
    await flush_response_cookies(ctx);
    return NextResponse.json({
      status: "ok",
      data: safeJson(result.rawReturn),
      errors: result.errors,
      flash: result.flash,
      http: result.status,
    });
  } catch (error) {
    await flush_response_cookies(ctx);

    if (error instanceof EtRedirectSignal) {
      return NextResponse.json({ status: "redirect", redirect: error.url });
    }
    if (error instanceof EtHttpError) {
      return NextResponse.json(
        { status: "error", message: error.message },
        { status: error.status }
      );
    }
    throw error;
  }
}

function safeJson(value: unknown): unknown {
  try {
    JSON.stringify(value);
    return value ?? null;
  } catch {
    return null;
  }
}
