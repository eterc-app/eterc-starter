import { NextRequest, NextResponse } from "next/server";
import { buildRequest, runInContext, flushResponseCookies } from "@/engine/dispatch";
import { runWithContext } from "@/engine/request-context";
import { TgHttpError, TgRedirectSignal } from "@/engine/signals";

/**
 * JSON API — POST /api/xhr/{module}/{method}/{params...}
 * The AJAX counterpart of the PHP framework's MX requests; controllers
 * addressed here should return JSON-serializable data.
 */
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
  const ctx = await buildRequest(options);

  try {
    const result = await runWithContext(ctx, () => runInContext(options));
    await flushResponseCookies(ctx);
    return NextResponse.json({
      status: "ok",
      data: safeJson(result.rawReturn),
      errors: result.errors,
      flash: result.flash,
      http: result.status,
    });
  } catch (error) {
    await flushResponseCookies(ctx);

    if (error instanceof TgRedirectSignal) {
      return NextResponse.json({ status: "redirect", redirect: error.url });
    }
    if (error instanceof TgHttpError) {
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
