import { NextRequest, NextResponse } from "next/server";
import { activeAiProvider } from "@/engine/active/ai-provider";
import { activeAuthProvider } from "@/engine/active/auth-provider";

export async function POST(request: NextRequest) {
  try {
    await activeAuthProvider.protectRoute();
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { prompt?: unknown; system?: unknown }
    | null;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return NextResponse.json({ error: "A prompt is required." }, { status: 400 });
  }
  if (!activeAiProvider.isConfigured()) {
    return NextResponse.json(
      { error: "No AI provider is configured." },
      { status: 503 },
    );
  }

  try {
    const result = await activeAiProvider.generateText({
      prompt,
      system: typeof body?.system === "string" ? body.system : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}
