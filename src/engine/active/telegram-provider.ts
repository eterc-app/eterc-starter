import type {
  ITelegramProvider,
  ProviderHealth,
  TelegramMessage,
  TelegramSendResult,
} from "../contracts/integrations";

export class DisabledTelegramProvider implements ITelegramProvider {
  readonly id = "none";

  isConfigured(): boolean {
    return false;
  }

  async send(_message: TelegramMessage): Promise<TelegramSendResult> {
    return { ok: false, error: "No Telegram bot is configured." };
  }

  async healthCheck(): Promise<ProviderHealth> {
    return { ok: true, message: "Telegram is not configured." };
  }
}

export const activeTelegramProvider: ITelegramProvider =
  new DisabledTelegramProvider();
