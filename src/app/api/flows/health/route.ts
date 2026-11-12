import { NextRequest, NextResponse, connection } from "next/server";
import { flow_health } from "@/modules/flows/flow-runtime";
import { verify_cron_secret } from "@/modules/flows/flow-secrets";

export async function GET(request: NextRequest) {
  await connection();
  const details = request.nextUrl.searchParams.get("details") === "1";
  const authorized =
    details &&
    verify_cron_secret(
      request.headers.get("x-et-cron-secret") ??
        (request.headers.get("authorization")?.toLowerCase().startsWith("bearer ")
          ? request.headers.get("authorization")?.slice(7).trim() ?? null
          : null)
    );
  const health = flow_health();
  if (!authorized) {
    return NextResponse.json(
      {
        ok: health.ok,
        service: "eterc-flows",
        enabled: health.runtime.enabled,
        mode: health.runtime.mode,
        scheduler: health.scheduler.running,
        checked_at: new Date().toISOString(),
      },
      { status: health.ok ? 200 : 503 }
    );
  }
  return NextResponse.json(
    { ...health, checked_at: new Date().toISOString() },
    { status: health.ok ? 200 : 503 }
  );
}
