import { Eterc_email } from "./Eterc_email";

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
  const mailer = new Eterc_email();
  return mailer.send({
    to_email: to,
    subject,
    body_html: body,
    from_email: opts.from,
    reply_to: opts.replyTo,
  });
}

export { Eterc_email };
export type { EtercEmailConfig, EtercEmailParams } from "./Eterc_email";
