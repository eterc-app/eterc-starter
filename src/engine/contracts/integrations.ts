export interface ProviderHealth {
  ok: boolean;
  message: string;
}

/* -- Email ---------------------------------------------------------------- */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  fromName?: string;
  replyTo?: string;
}

export interface EmailSendResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export interface IEmailProvider {
  readonly id: string;
  isConfigured(): boolean;
  send(message: EmailMessage): Promise<EmailSendResult>;
  healthCheck?(): Promise<ProviderHealth>;
}

/* -- SMS ------------------------------------------------------------------ */

export interface SmsMessage {
  to: string;
  body: string;
}

export interface SmsSendResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export interface ISmsProvider {
  readonly id: string;
  isConfigured(): boolean;
  send(message: SmsMessage): Promise<SmsSendResult>;
  healthCheck?(): Promise<ProviderHealth>;
}

/* -- WhatsApp ------------------------------------------------------------- */

export interface WhatsAppMessage {
  to: string;
  body: string;
}

export interface WhatsAppSendResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export interface IWhatsAppProvider {
  readonly id: string;
  isConfigured(): boolean;
  send(message: WhatsAppMessage): Promise<WhatsAppSendResult>;
  healthCheck?(): Promise<ProviderHealth>;
}

/* -- Telegram ------------------------------------------------------------- */

export interface TelegramMessage {
  chatId: string;
  text: string;
}

export interface TelegramSendResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export interface ITelegramProvider {
  readonly id: string;
  isConfigured(): boolean;
  send(message: TelegramMessage): Promise<TelegramSendResult>;
  healthCheck?(): Promise<ProviderHealth>;
}

/* -- Payments ------------------------------------------------------------- */

export interface PaymentCheckoutInput {
  email: string;
  amount: number;
  currency: string;
  reference?: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentCheckoutResult {
  url: string;
  reference: string;
}

export interface PaymentVerifyResult {
  paid: boolean;
  reference: string;
  amount?: number;
  currency?: string;
  raw?: unknown;
}

export interface PaymentWebhookResult {
  ok: boolean;
  event?: unknown;
  message?: string;
}

export interface IPaymentProvider {
  readonly id: string;
  isConfigured(): boolean;
  createCheckout(input: PaymentCheckoutInput): Promise<PaymentCheckoutResult>;
  verify(reference: string): Promise<PaymentVerifyResult>;
  verifyWebhook(
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<PaymentWebhookResult>;
  healthCheck?(): Promise<ProviderHealth>;
}

/* -- AI ------------------------------------------------------------------- */

export interface AiGenerateInput {
  prompt: string;
  system?: string;
}

export interface AiGenerateResult {
  text: string;
  model: string;
}

export interface IAiProvider {
  readonly id: string;
  isConfigured(): boolean;
  generateText(input: AiGenerateInput): Promise<AiGenerateResult>;
  healthCheck?(): Promise<ProviderHealth>;
}
