import type {
  IWhatsAppProvider,
  ProviderHealth,
  WhatsAppMessage,
  WhatsAppSendResult,
} from "../contracts/integrations";

export class DisabledWhatsAppProvider implements IWhatsAppProvider {
  readonly id = "none";

  isConfigured(): boolean {
    return false;
  }

  async send(_message: WhatsAppMessage): Promise<WhatsAppSendResult> {
    return { ok: false, error: "No WhatsApp provider is configured." };
  }

  async healthCheck(): Promise<ProviderHealth> {
    return { ok: true, message: "WhatsApp is not configured." };
  }
}

export const activeWhatsAppProvider: IWhatsAppProvider =
  new DisabledWhatsAppProvider();
