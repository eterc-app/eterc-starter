import fs from "node:fs";
import { NextResponse, type NextRequest } from "next/server";
import { build_request } from "@/engine/dispatch";
import { run_with_context } from "@/engine/request-context";
import { EtHttpError, EtRedirectSignal } from "@/engine/signals";
import { resolve_principal } from "@/modules/cms/cms-access";
import { download_upload } from "@/modules/media/upload-service";


interface RouteContext {
  params: Promise<{ key?: string[] }>;
}

function contentTypeFor(key: string): string {
  const extension = key.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
  const types: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
  };
  return types[extension] ?? "application/octet-stream";
}

/**
 * Authenticated download route for private assets. Public local assets are
 * still served by /uploads; private assets only pass through this route.
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext
): Promise<Response> {
  const { key = [] } = await context.params;
  const object_key = key.join("/");
  if (!object_key) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const request_context = await build_request({
      segments: [],
      isAjax: true,
      canSetCookies: true,
      method: "GET",
    });
    const principal = await run_with_context(request_context, () =>
      resolve_principal({ requireApiAccess: false })
    );
    const result = await download_upload({ principal, key: object_key });
    if ("redirect" in result) {
      return NextResponse.redirect(result.redirect, 302);
    }
    const bytes = fs.readFileSync(result.file.path);
    const is_image = result.file.mime.startsWith("image/");
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": is_image ? result.file.mime : contentTypeFor(object_key),
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `${
          is_image ? "inline" : "attachment"
        }; filename="${encodeURIComponent(result.file.name)}"`,
        "Cache-Control": "private, max-age=60",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch (error) {
    if (error instanceof EtRedirectSignal) {
      return new NextResponse("Authentication required", { status: 401 });
    }
    if (error instanceof EtHttpError) {
      return new NextResponse(error.message, { status: error.status });
    }
    return new NextResponse("Not found", { status: 404 });
  }
}
