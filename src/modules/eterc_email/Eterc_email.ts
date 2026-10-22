import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { EMAIL_CONFIG } from "@/engine/config";

/**
 * Eterc_email — port of modules/eterc_email/Eterc_email.php.
 *
 * The PHP original hand-rolls the SMTP conversation (raw socket, AUTH LOGIN,
 * multipart/alternative MIME, quoted-printable bodies). The port keeps the
 * module contract — `load_config()` and `send()` — but delegates delivery to
 * nodemailer, which produces the same wire format (text/HTML alternative
 * parts, header encoding, implicit TLS vs STARTTLS) with far less code.
 *
 * Configuration comes from EMAIL_CONFIG (env: ET_SMTP_*). Deviation from the
 * PHP version, which throws when the config file/keys are missing: an
 * incomplete setup is tolerated — `send()` logs one warning and returns false,
 * so dev environments without an SMTP server keep working.
 *
 * The PHP `block_url('eterc_email')` guard has no direct port equivalent;
 * the module is safe by construction because it is not registered as a
 * routable controller (the router only serves modules listed in
 * engine/registrations.ts).
 */

export interface EtercEmailConfig {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  smtp_secure: "ssl" | "tls" | "";
  smtp_from_name: string;
}

/** Parameters for send() — PHP parity plus a few port-only extras. */
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

/** PHP: stream_set_timeout($socket, 30) — 30s for connect, greeting and I/O. */
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

/**
 * Minimal stand-in for PHP's html_entity_decode(): decodes numeric entities
 * plus the common named ones used in email copy.
 */
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

  /**
   * Port of load_config(). PHP `require`s config/eterc_email.php and throws
   * when required keys are missing; the port returns a normalized snapshot of
   * EMAIL_CONFIG instead — `is_configured()` reports any gaps.
   */
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

  /**
   * True when every key the PHP load_config() requires is present:
   * smtp_host, smtp_port, smtp_user and smtp_pass.
   */
  is_configured(config: EtercEmailConfig = this.load_config()): boolean {
    return (
      config.smtp_host !== "" &&
      config.smtp_port > 0 &&
      config.smtp_user !== "" &&
      config.smtp_pass !== ""
    );
  }

  /**
   * Send an email (port of send()). Required keys: `to_email`, `subject` and
   * `body_html`; the plain-text alternative is generated from the HTML when
   * `body_plain` is omitted (PHP: html_to_plain()).
   *
   * Returns true when the SMTP server accepted the message, false otherwise
   * (invalid params, incomplete SMTP configuration, or a delivery error).
   */
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

  /**
   * Build the nodemailer transport — PHP: smtp_connect() + smtp_authenticate().
   * `ssl` maps to an implicit-TLS connection, `tls` to a STARTTLS upgrade and
   * an empty value to plain SMTP, exactly like the PHP socket setup.
   */
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

  /** Port of html_to_plain(): crude HTML → plain-text conversion. */
  private html_to_plain(html: string): string {
    const plain = html
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, "");
    return decodeEntities(plain).trim();
  }
}
