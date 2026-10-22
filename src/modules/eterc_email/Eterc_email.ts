import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { EMAIL_CONFIG } from "@/engine/config";

export interface EtercEmailConfig {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  smtp_secure: "ssl" | "tls" | "";
  smtp_from_name: string;
}
export interface EtercEmailParams {
  to_email: string;
  to_name?: string;
  subject: string;
  body_html: string;
  body_plain?: string;
  /** Sender address override (default: EMAIL_CONFIG.smtp_user). */
  from_email?: string;
  /** Sender display-name override (default: EMAIL_CONFIG.smtp_from_name). */
  from_name?: string;
  /** Optional Reply-To address. */
  reply_to?: string;
}
const SMTP_TIMEOUT_MS = 30_000;

/** Named entities handled by the plain-text fallback (see decodeEntities). */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

let warnedAboutMissingConfig = false;

function warnMissingConfigOnce(): void {
  if (warnedAboutMissingConfig) return;
  warnedAboutMissingConfig = true;
  console.warn(
    "[eterc_email] SMTP configuration is incomplete — set ET_SMTP_HOST, " +
      "ET_SMTP_PORT, ET_SMTP_USER and ET_SMTP_PASS (see EMAIL_CONFIG in " +
      "src/engine/config.ts). Outgoing email will be skipped in this environment."
  );
}
function decodeEntities(value: string): string {
  return value.replace(
    /&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g,
    (match, entity: string) => {
      if (entity.startsWith("#")) {
        const isHex = entity[1] === "x" || entity[1] === "X";
        const code = isHex
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
        if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return match;
        return String.fromCodePoint(code);
      }
      return NAMED_ENTITIES[entity] ?? match;
    }
  );
}

export class Eterc_email {
  readonly moduleName = "eterc_email";
  load_config(): EtercEmailConfig {
    return {
      smtp_host: EMAIL_CONFIG.smtp_host.trim(),
      smtp_port: Number(EMAIL_CONFIG.smtp_port) || 0,
      smtp_user: EMAIL_CONFIG.smtp_user.trim(),
      smtp_pass: EMAIL_CONFIG.smtp_pass,
      smtp_secure: EMAIL_CONFIG.smtp_secure,
      smtp_from_name: EMAIL_CONFIG.smtp_from_name.trim(),
    };
  }
  is_configured(config: EtercEmailConfig = this.load_config()): boolean {
    return (
      config.smtp_host !== "" &&
      config.smtp_port > 0 &&
      config.smtp_user !== "" &&
      config.smtp_pass !== ""
    );
  }
  async send(params: EtercEmailParams): Promise<boolean> {
    const toEmail = (params.to_email ?? "").trim();
    const subject = params.subject ?? "";
    const bodyHtml = params.body_html ?? "";

    if (toEmail === "" || subject === "" || bodyHtml === "") {
      return false;
    }

    const config = this.load_config();
    if (!this.is_configured(config)) {
      warnMissingConfigOnce();
      return false;
    }

    const bodyPlain = params.body_plain ?? this.html_to_plain(bodyHtml);
    const fromEmail = params.from_email?.trim() || config.smtp_user;
    const fromName = params.from_name?.trim() || config.smtp_from_name;
    const toName = params.to_name?.trim() ?? "";

    try {
      await this.create_transport(config).sendMail({
        from: fromName === "" ? fromEmail : { name: fromName, address: fromEmail },
        to: toName === "" ? toEmail : { name: toName, address: toEmail },
        replyTo: params.reply_to?.trim() || undefined,
        subject,
        text: bodyPlain,
        html: bodyHtml,
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[eterc_email] Failed to send email to ${toEmail}: ${message}`);
      return false;
    }
  }
  protected create_transport(config: EtercEmailConfig): Transporter {
    return nodemailer.createTransport({
      host: config.smtp_host,
      port: config.smtp_port,
      secure: config.smtp_secure === "ssl",
      requireTLS: config.smtp_secure === "tls",
      auth: { user: config.smtp_user, pass: config.smtp_pass },
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
    });
  }

  /** Convert HTML to plain text. */
  private html_to_plain(html: string): string {
    const plain = html
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, "");
    return decodeEntities(plain).trim();
  }
}
