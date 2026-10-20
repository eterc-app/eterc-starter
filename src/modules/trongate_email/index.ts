import { Trongate_email } from "./Trongate_email";

/**
 * trongate_email module entry.
 *
 * `send_email()` is the module-level convenience sender used by other modules:
 * HTML body, subject and sender identity taken from EMAIL_CONFIG (TG_SMTP_*)
 * — the same behavior as the PHP `Trongate_email::send()`.
 *
 * Returns true when the SMTP server accepted the message; false when params
 * are incomplete, the SMTP configuration is missing (one console warning is
 * emitted per process) or delivery fails.
 */

export interface SendEmailOptions {
  /** Sender address override (default: EMAIL_CONFIG.smtp_user). */
  from?: string;
  /** Optional Reply-To address. */
  replyTo?: string;
}

export async function send_email(
  to: string,
  subject: string,
  body: string,
  opts: SendEmailOptions = {}
): Promise<boolean> {
  const mailer = new Trongate_email();
  return mailer.send({
    to_email: to,
    subject,
    body_html: body,
    from_email: opts.from,
    reply_to: opts.replyTo,
  });
}

export { Trongate_email };
export type { TrongateEmailConfig, TrongateEmailParams } from "./Trongate_email";
