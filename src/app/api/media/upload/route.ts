import { NextResponse, type NextRequest } from "next/server";
import {
  build_request,
  flush_response_cookies,
} from "@/engine/dispatch";
import { run_with_context } from "@/engine/request-context";
import { dispatch } from "@/engine/router";
import { EtHttpError, EtRedirectSignal } from "@/engine/signals";

/**
 * Multipart upload endpoint for the standalone media library.
 *
 * The framework router only accepts JSON on /api/xhr, so this route builds a
 * normal Eterc request context from the form body and dispatches the upload
 * through the media controller. Authentication, CSRF and image validation
 * therefore stay in one place.
 */
export async function POST(request: NextRequest) {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "The upload body could not be read." },
      { status: 400 }
    );
  }

  const options = {
    segments: ["media", "upload_media"],
    formData,
    isAjax: true,
    canSetCookies: true,
    method: "POST",
  };

  const context = await build_request(options);

  try {
    const result = await run_with_context(context, () => dispatch(options.segments));
    await flush_response_cookies(context);

    const payload = result.rawReturn;
    if (payload === null || typeof payload !== "object") {
      return NextResponse.json(
        { ok: false, error: "The upload did not return a result." },
        { status: 500 }
      );
    }

    return NextResponse.json(payload);
  } catch (error) {
    await flush_response_cookies(context);

    if (error instanceof EtRedirectSignal) {
      return NextResponse.json(
        {
          ok: false,
          error: "Your session has expired. Sign in and try again.",
          redirect: error.url,
        },
        { status: 401 }
      );
    }

    if (error instanceof EtHttpError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status }
      );
    }

    return NextResponse.json(
      { ok: false, error: "The image could not be uploaded." },
      { status: 500 }
    );
  }
}
