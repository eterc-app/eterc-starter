import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { verify_cron_secret } from "@/modules/flows/flow-secrets";
import { drain_flow_queue } from "@/modules/flows/flow-queue";
import { recover_stale_flow_jobs } from "@/modules/flows/flow-store";

export const maxDuration = 60;

function supplied_secret(request: NextRequest): string | null {
  const direct = request.headers.get("x-et-cron-secret");
  if (direct) return direct;
  const authorization = request.headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }
  return null;
}

async function run(request: NextRequest): Promise<NextResponse> {
  await connection();
  if (!verify_cron_secret(supplied_secret(request))) {
    return NextResponse.json(
      { error: "A valid FLOW_CRON_SECRET is required." },
      { status: 503 }
    );
  }
  const recovered = recover_stale_flow_jobs();
  const queue = await drain_flow_queue(25);
  return NextResponse.json({ ok: true, recovered, queue });
}

export function GET(request: NextRequest) {
  return run(request);
}
export function POST(request: NextRequest) {
  return run(request);
}
