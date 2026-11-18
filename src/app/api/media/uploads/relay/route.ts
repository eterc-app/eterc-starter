import { NextResponse } from "next/server";
import { EtHttpError } from "@/engine/signals";
import { receive_relay_upload } from "@/modules/media/upload-service";


/**
 * Streaming relay for providers that do not expose presigned uploads. The
 * server never buffers more than the declared limit; adapters with
 * `uploadStream` receive the body as a stream.
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
    const result = await receive_relay_upload({
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
