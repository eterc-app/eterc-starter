import type {
  ISmsProvider,
  ProviderHealth,
  SmsMessage,
  SmsSendResult,
} from "../contracts/integrations";

export class DisabledSmsProvider implements ISmsProvider {
  readonly id = "none";

  isConfigured(): boolean {
    return false;
  }

  async send(_message: SmsMessage): Promise<SmsSendResult> {
    return { ok: false, error: "No SMS provider is configured." };
  }

  async healthCheck(): Promise<ProviderHealth> {
    return { ok: true, message: "SMS is not configured." };
  }
}

export const activeSmsProvider: ISmsProvider = new DisabledSmsProvider();
