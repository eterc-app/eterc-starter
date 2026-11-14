import { EMAIL_CONFIG } from "@/engine/config";
import { activeEmailProvider } from "@/engine/active/email-provider";

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
  /** Sender address override (default: provider configuration). */
  from_email?: string;
  /** Sender display-name override (default: provider configuration). */
  from_name?: string;
  /** Optional Reply-To address. */
  reply_to?: string;
}

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
    "[eterc_email] No email provider is configured. Choose Resend or SMTP in " +
      "Eterc Desktop and write the project .env before sending email.",
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
    },
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

  is_configured(_config: EtercEmailConfig = this.load_config()): boolean {
    return activeEmailProvider.isConfigured();
  }

  async send(params: EtercEmailParams): Promise<boolean> {
    const toEmail = (params.to_email ?? "").trim();
    const subject = params.subject ?? "";
    const bodyHtml = params.body_html ?? "";

    if (toEmail === "" || subject === "" || bodyHtml === "") {
      return false;
    }

    if (!activeEmailProvider.isConfigured()) {
      warnMissingConfigOnce();
      return false;
    }

    const result = await activeEmailProvider.send({
      to: toEmail,
      subject,
      html: bodyHtml,
      text: params.body_plain ?? this.html_to_plain(bodyHtml),
      from: params.from_email,
      fromName: params.from_name,
      replyTo: params.reply_to,
    });

    if (!result.ok) {
      console.error(
        `[eterc_email] Failed to send email to ${toEmail}: ${result.error ?? "unknown error"}`,
      );
      return false;
    }
    return true;
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
