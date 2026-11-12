import { NextRequest, NextResponse } from "next/server";
import { connection } from "next/server";
import { ensure_flow_schema } from "@/modules/flows/flow-schema";
import { handle_webhook } from "@/modules/flows/flow-webhook";

async function handle(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  await connection();
  ensure_flow_schema();
  const { id } = await context.params;
  const result = await handle_webhook(request, id);
  return NextResponse.json(result.body ?? null, {
    status: result.status,
    headers: result.headers,
  });
}

export function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handle(request, context);
}
export function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handle(request, context);
}
export function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handle(request, context);
}
export function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handle(request, context);
}
export function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handle(request, context);
}
