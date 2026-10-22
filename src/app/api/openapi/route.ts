import { NextResponse, connection } from "next/server";
import { build_openapi_document } from "@/engine/api";

export async function GET() {
  // The document is assembled from module files so it follows project edits.
  await connection();

  return NextResponse.json(build_openapi_document(), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
