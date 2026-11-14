import nodemailer from "nodemailer";
import type {
  EmailMessage,
  EmailSendResult,
  IEmailProvider,
  ProviderHealth,
} from "../contracts/integrations";
import { EMAIL_CONFIG } from "../config";

const SMTP_TIMEOUT_MS = 30_000;

function createTransport() {
  return nodemailer.createTransport({
    host: EMAIL_CONFIG.smtp_host,
    port: EMAIL_CONFIG.smtp_port,
    secure: EMAIL_CONFIG.smtp_secure === "ssl",
    requireTLS: EMAIL_CONFIG.smtp_secure === "tls",
    auth: {
      user: EMAIL_CONFIG.smtp_user,
      pass: EMAIL_CONFIG.smtp_pass,
    },
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  });
}

export class SmtpEmailProvider implements IEmailProvider {
  readonly id = "smtp";

  isConfigured(): boolean {
    return (
      EMAIL_CONFIG.smtp_host.trim() !== "" &&
      EMAIL_CONFIG.smtp_port > 0 &&
      EMAIL_CONFIG.smtp_user.trim() !== "" &&
      EMAIL_CONFIG.smtp_pass !== ""
    );
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    if (!this.isConfigured()) {
      return { ok: false, error: "SMTP is not configured." };
    }
    try {
      const fromName = message.fromName?.trim() || EMAIL_CONFIG.smtp_from_name.trim();
      const fromAddress = message.from?.trim() || EMAIL_CONFIG.smtp_user;
      const result = await createTransport().sendMail({
        from: fromName ? { name: fromName, address: fromAddress } : fromAddress,
        to: message.to,
        replyTo: message.replyTo,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      return { ok: true, id: result.messageId };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (!this.isConfigured()) {
      return { ok: true, message: "SMTP is not configured." };
    }
    try {
      await createTransport().verify();
      return { ok: true, message: "SMTP connection succeeded." };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export const activeEmailProvider: IEmailProvider = new SmtpEmailProvider();
