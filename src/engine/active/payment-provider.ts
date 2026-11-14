import type {
  IPaymentProvider,
  PaymentCheckoutInput,
  PaymentCheckoutResult,
  PaymentVerifyResult,
  PaymentWebhookResult,
  ProviderHealth,
} from "../contracts/integrations";

export class DisabledPaymentProvider implements IPaymentProvider {
  readonly id = "none";

  isConfigured(): boolean {
    return false;
  }

  async createCheckout(_input: PaymentCheckoutInput): Promise<PaymentCheckoutResult> {
    throw new Error("No payment provider is configured.");
  }

  async verify(_reference: string): Promise<PaymentVerifyResult> {
    throw new Error("No payment provider is configured.");
  }

  async verifyWebhook(
    _rawBody: string,
    _headers: Record<string, string>,
  ): Promise<PaymentWebhookResult> {
    return { ok: false, message: "No payment provider is configured." };
  }

  async healthCheck(): Promise<ProviderHealth> {
    return { ok: true, message: "Payments are not configured." };
  }
}

export const activePaymentProvider: IPaymentProvider =
  new DisabledPaymentProvider();
