import type {
  AiGenerateInput,
  AiGenerateResult,
  IAiProvider,
  ProviderHealth,
} from "../contracts/integrations";

export class DisabledAiProvider implements IAiProvider {
  readonly id = "none";

  isConfigured(): boolean {
    return false;
  }

  async generateText(_input: AiGenerateInput): Promise<AiGenerateResult> {
    throw new Error("No AI provider is configured.");
  }

  async healthCheck(): Promise<ProviderHealth> {
    return { ok: true, message: "AI is not configured." };
  }
}

export const activeAiProvider: IAiProvider = new DisabledAiProvider();
