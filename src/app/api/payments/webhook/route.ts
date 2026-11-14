import { NextRequest, NextResponse } from "next/server";
import { activePaymentProvider } from "@/engine/active/payment-provider";
import { ensure_flow_schema } from "@/modules/flows/flow-schema";
import { get_flow } from "@/modules/flows/flow-store";
import { run_flow } from "@/modules/flows/flow-runner";
import { SYSTEM_PRINCIPAL } from "@/modules/flows/flow-principal";
import type { FlowTriggerPayload } from "@/modules/flows/flow-types";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  const result = await activePaymentProvider.verifyWebhook(rawBody, headers);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, message: result.message ?? "Invalid webhook signature." },
      { status: 400 },
    );
  }

  // Optional: run a specific flow with the verified event.
  const flowId = process.env.PAYMENT_WEBHOOK_FLOW_ID?.trim();
  if (flowId) {
    try {
      ensure_flow_schema();
      const flow = get_flow(flowId);
      if (flow) {
        const trigger: FlowTriggerPayload = {
          type: "webhook",
          method: "POST",
          query: {},
          headers,
          body: result.event,
          flow_id: flow.id,
        };
        await run_flow({ flow, trigger, principal: SYSTEM_PRINCIPAL });
      }
    } catch (error) {
      console.error(
        "[payments] Payment webhook flow failed:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  return NextResponse.json({ ok: true, event: result.event });
}
