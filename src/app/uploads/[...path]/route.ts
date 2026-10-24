import fs from "node:fs";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { UPLOADS_DIR } from "@/engine/paths";

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

interface RouteContext {
  params: Promise<{ path?: string[] }>;
}

/**
 * Serve runtime uploads.
 *
 * Files are written to `public/uploads` after the production build starts, so
 * the static public-file manifest cannot be relied on. This route resolves the
 * requested path inside the uploads directory and streams the file with a
 * long-lived cache header.
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext
): Promise<Response> {
  const { path: segments = [] } = await context.params;
  const clean = segments.filter(Boolean);

  if (clean.length === 0) {
    return new NextResponse("Not found", { status: 404 });
  }

  const root = path.resolve(UPLOADS_DIR);
  const resolved = path.resolve(root, ...clean);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    return new NextResponse("Not found", { status: 404 });
  }

  let file: Buffer;
  try {
    if (!fs.statSync(resolved).isFile()) {
      return new NextResponse("Not found", { status: 404 });
    }
    file = fs.readFileSync(resolved);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  const contentType =
    CONTENT_TYPES[path.extname(resolved).toLowerCase()] ??
    "application/octet-stream";
  const body = new Uint8Array(file.byteLength);
  body.set(file);

  return new NextResponse(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
