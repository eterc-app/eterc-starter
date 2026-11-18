import { NextResponse } from "next/server";
import { EtHttpError } from "@/engine/signals";
import { receive_local_upload } from "@/modules/media/upload-service";


/**
 * Direct local upload endpoint. This route is intentionally excluded from the
 * Next proxy so the multipart body is never cloned or buffered by the proxy.
 * Authentication is the short-lived HMAC upload token from `asset_init`.
 */
export async function PUT(request: Request): Promise<Response> {
  const token =
    request.headers.get("x-upload-token") ?? "";
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "The upload token is missing." },
      { status: 401 }
    );
  }
  if (!request.body) {
    return NextResponse.json(
      { ok: false, error: "The upload body is missing." },
      { status: 400 }
    );
  }
  const declared = Number(request.headers.get("content-length") ?? 0);
  try {
    const result = await receive_local_upload({
      token,
      stream: request.body as ReadableStream<Uint8Array>,
      contentLength: Number.isFinite(declared) && declared > 0 ? declared : null,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof EtHttpError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status }
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "The upload failed.",
      },
      { status: 500 }
    );
  }
}
