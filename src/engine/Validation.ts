import { post } from "./post";
import { get_context, type TgRequest } from "./request-context";
import { csrf_check, csrf_field_name } from "./csrf";
import { db } from "./db";
import { BASE_URL } from "./config";
import { session_set } from "./session";
import { TgHttpError, TgRedirectSignal } from "./signals";

export { TgHttpError, TgRedirectSignal } from "./signals";

/**
 * Validation — port of modules/validation (Validation.php + rules).
 *
 * Errors are collected on the instance and handed to React through
 * <ValidationErrorsProvider>; they are also mirrored into the session so a
 * redirected render can display them (same session keys as the PHP original).
 *
 * Image/file rules run asynchronously because dimensions are probed with sharp.
 */

export type ValidationErrors = Record<string, string[]>;

const MESSAGES: Record<string, string> = {
  required: "The [label] field is required.",
  integer: "The [label] field must be an integer.",
  numeric: "The [label] field must be numeric.",
  decimal: "The [label] field must be a decimal number.",
  valid_email: "The [label] field must contain a valid email address.",
  valid_url: "The [label] field must contain a valid URL.",
  valid_ip: "The [label] field must contain a valid IP address.",
  valid_date: "The [label] field must be a valid date in YYYY-MM-DD format.",
  valid_time: "The [label] field must be a valid time in HH:MM or HH:MM:SS format.",
  valid_datetime_local: "The [label] field must be a valid datetime in YYYY-MM-DDTHH:MM format.",
  valid_month: "The [label] field must be a valid month in YYYY-MM format.",
  valid_week: "The [label] field must be a valid week in YYYY-W## format.",
  min_length: "The [label] field must be at least [param] characters long.",
  max_length: "The [label] field cannot exceed [param] characters.",
  exact_length: "The [label] field must be exactly [param] characters long.",
  greater_than: "The [label] field must be greater than [param].",
  less_than: "The [label] field must be less than [param].",
  matches: "The [label] field must match the [param] field.",
  allowed_types: "The [label] must be one of the following file types: [param].",
  max_size: "The [label] file size must not exceed [param] KB.",
  min_size: "The [label] file size must be at least [param] KB.",
  is_image: "The [label] must be a valid image file.",
  max_width: "The [label] image width cannot exceed [param] pixels.",
  min_width: "The [label] image width must be at least [param] pixels.",
  max_height: "The [label] image height cannot exceed [param] pixels.",
  min_height: "The [label] image height must be at least [param] pixels.",
  exact_width: "The [label] image width must be exactly [param] pixels.",
  exact_height: "The [label] image height must be exactly [param] pixels.",
  square: "The [label] image must be square (equal width and height).",
  upload_failed: "The [label] failed to upload. Please try again.",
  not_an_image: "The [label] must be a valid image file (JPG, PNG, GIF, or WEBP).",
  invalid_file: "The [label] is invalid or has been corrupted.",
  security_threat: "A security threat was detected in the [label]. The upload has been blocked.",
};

export class Validation {
  readonly moduleName = "validation";
  errors: ValidationErrors = {};
  posted_fields: Record<string, string> = {};
  private caller: object | null = null;
  private language: Record<string, string> = MESSAGES;

  set_caller(caller: object): void {
    this.caller = caller;
  }

  set_language(lang: string): void {
    if (lang === "en") this.language = MESSAGES;
    // Additional languages can be layered in the same shape.
  }

  reset_language(): void {
    this.language = MESSAGES;
  }

  private message(rule: string, label: string, param: string | null): string {
    let template = this.language[rule] ?? MESSAGES[rule] ?? `The [label] field is invalid.`;
    template = template.replace(/\[label\]/g, label);
    if (param !== null) template = template.replace(/\[param\]/g, param);
    return template;
  }

  private addError(key: string, message: string): void {
    this.errors[key] = [...(this.errors[key] ?? []), message];
  }

  private isAjax(): boolean {
    const ctx = get_context();
    return ctx.isAjax;
  }

  /** CSRF gate identical in behavior to the PHP original. */
  private async csrf_protect(): Promise<void> {
    const posted = post(csrf_field_name);
    if (typeof posted !== "string" || posted === "" || !csrf_check(posted)) {
      if (this.isAjax()) {
        throw new TgHttpError(403, "CSRF token validation failed");
      }
      throw new TgRedirectSignal(BASE_URL);
    }
  }

  /** Configure and immediately execute the rules for a field. */
  async set_rules(key: string, label: string, rules: string): Promise<void> {
    const ctx = get_context();
    this.posted_fields[key] = label;

    const file = ctx.formData?.get(key) instanceof File ? (ctx.formData.get(key) as File) : null;
    const tests = rules.split("|").filter((r) => r.trim() !== "");

    for (const test of tests) {
      const parsed = this.parseRule(test);
      const failed = await this.executeRule(parsed.method, parsed.param, {
        key,
        label,
        file,
        ctx,
      });
      if (failed) break; // Early exit on first error for this field (PHP parity).
    }

    // Mirror into the session (parity with $_SESSION['form_submission_errors']).
    session_set("form_submission_errors", this.errors);
  }

  private parseRule(rule: string): { method: string; param: string | null } {
    const match = rule.match(/^([^\[]+)(?:\[(.*)\])?$/);
    if (!match) return { method: rule.trim(), param: null };
    return { method: match[1].trim(), param: match[2] ?? null };
  }

  private async executeRule(
    method: string,
    param: string | null,
    info: { key: string; label: string; file: File | null; ctx: TgRequest }
  ): Promise<boolean> {
    const { key, label, file, ctx } = info;

    if (file) {
      return this.runFileRule(method, param, key, label, file, ctx);
    }

    if (method.startsWith("callback_")) {
      const callbackName = method.replace("callback_", "");
      const target = this.caller as Record<string, unknown> | null;
      if (target) {
        const fn = Object.getOwnPropertyNames(
          Object.getPrototypeOf(target) as object
        ).includes(callbackName)
          ? ((target as Record<string, unknown>)[callbackName] as
              | ((value: unknown) => Promise<boolean | string> | boolean | string)
              | undefined)
          : undefined;
        if (typeof fn === "function") {
          const result = await (fn as (value: unknown) => unknown).call(target, this.postedValue(key));
          if (result !== true) {
            const message =
              typeof result === "string" && result.includes("[label]")
                ? result.replace(/\[label\]/g, label)
                : result === false
                  ? this.message("required", label, null)
                  : String(result);
            this.addError(key, message);
            return true;
          }
          return false;
        }
      }
      this.addError(key, `Validation failed: Callback method '${callbackName}' not found.`);
      return true;
    }

    return this.runSimpleRule(method, param, key, label);
  }

  private postedValue(key: string): string {
    const value = post(key, true);
    if (value === "" || value === null || value === undefined) return "";
    if (Array.isArray(value)) return value.map(String).join(",");
    return String(value);
  }

  private runSimpleRule(
    method: string,
    param: string | null,
    key: string,
    label: string
  ): boolean {
    const value = this.postedValue(key);
    const add = (rule: string) => {
      this.addError(key, this.message(rule, label, param));
      return true;
    };

    switch (method) {
      case "required":
        return value.trim() === "" ? add("required") : false;
      case "numeric":
        return value !== "" && !isNumericString(value) ? add("numeric") : false;
      case "integer":
        return value !== "" && !/^[-+]?\d+$/.test(value) ? add("integer") : false;
      case "decimal":
        return value !== "" && !isNumericString(value) ? add("decimal") : false;
      case "valid_email":
        return value !== "" && !isValidEmail(value) ? add("valid_email") : false;
      case "valid_url":
        return value !== "" && !isValidUrl(value) ? add("valid_url") : false;
      case "valid_ip":
        return value !== "" && !isValidIp(value) ? add("valid_ip") : false;
      case "min_length":
        return value !== "" && value.length < Number(param ?? 0) ? add("min_length") : false;
      case "max_length":
        return value !== "" && value.length > Number(param ?? 0) ? add("max_length") : false;
      case "exact_length":
        return value !== "" && value.length !== Number(param ?? 0) ? add("exact_length") : false;
      case "matches": {
        const other = param ? this.postedValue(param) : "";
        return value !== other ? add("matches") : false;
      }
      case "greater_than":
        return value !== "" && Number(value) <= Number(param) ? add("greater_than") : false;
      case "less_than":
        return value !== "" && Number(value) >= Number(param) ? add("less_than") : false;
      case "valid_date":
        return value !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(value) ? add("valid_date") : false;
      case "valid_time":
        return value !== "" && !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value)
          ? add("valid_time")
          : false;
      case "valid_datetime_local":
        return value !== "" && !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(value)
          ? add("valid_datetime_local")
          : false;
      case "valid_month":
        return value !== "" && !/^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? add("valid_month") : false;
      case "valid_week":
        return value !== "" && !/^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(value)
          ? add("valid_week")
          : false;
      default:
        return false;
    }
  }

  private async runFileRule(
    method: string,
    param: string | null,
    key: string,
    label: string,
    file: File,
    ctx: TgRequest
  ): Promise<boolean> {
    const extension = file.name.includes(".")
      ? file.name.split(".").pop()!.toLowerCase()
      : "";
    const add = (rule: string) => {
      this.addError(key, this.message(rule, label, param));
      return true;
    };

    if (method === "required") {
      return file.size === 0 ? add("required") : false;
    }
    if (file.size === 0) return false;

    switch (method) {
      case "allowed_types": {
        const allowed = (param ?? "").split(",").map((t) => t.trim().toLowerCase());
        return !allowed.includes(extension) ? add("allowed_types") : false;
      }
      case "max_size":
        return file.size > Number(param ?? 0) * 1024 ? add("max_size") : false;
      case "min_size":
        return file.size < Number(param ?? 0) * 1024 ? add("min_size") : false;
      case "is_image": {
        const dims = await probeImage(file);
        return dims === null ? add("is_image") : false;
      }
      case "max_width":
      case "min_width":
      case "exact_width":
      case "max_height":
      case "min_height":
      case "exact_height":
      case "square": {
        const dims = await probeImage(file);
        if (!dims) return add("is_image");
        const width = dims.width;
        const height = dims.height;
        switch (method) {
          case "max_width":
            return width > Number(param) ? add("max_width") : false;
          case "min_width":
            return width < Number(param) ? add("min_width") : false;
          case "exact_width":
            return width !== Number(param) ? add("exact_width") : false;
          case "max_height":
            return height > Number(param) ? add("max_height") : false;
          case "min_height":
            return height < Number(param) ? add("min_height") : false;
          case "exact_height":
            return height !== Number(param) ? add("exact_height") : false;
          case "square":
            return width !== height ? add("square") : false;
        }
        return false;
      }
      default:
        return false;
    }
  }

  /** Finalize validation. Returns true when the submission is error free. */
  async run(
    rules?: Record<string, Record<string, unknown>>
  ): Promise<boolean> {
    await this.csrf_protect();

    if (rules) {
      for (const [field, data] of Object.entries(rules)) {
        const label = typeof data.label === "string" ? data.label : field;
        const ruleList: string[] = [];
        for (const [rule, value] of Object.entries(data)) {
          if (rule === "label") continue;
          if (value === true) ruleList.push(rule);
          else ruleList.push(`${rule}[${String(value)}]`);
        }
        await this.set_rules(field, label, ruleList.join("|"));
      }
    }

    if (Object.keys(this.errors).length > 0) {
      session_set("form_submission_errors", this.errors);
      return false;
    }

    this.errors = {};
    session_set("form_submission_errors", undefined);
    return true;
  }

  /** JSON-serializable errors (for <ValidationErrorsProvider> / AJAX). */
  errorsJson(): ValidationErrors {
    return this.errors;
  }
}

async function probeImage(
  file: File
): Promise<{ width: number; height: number } | null> {
  try {
    const sharp = (await import("sharp")).default;
    const buffer = Buffer.from(await file.arrayBuffer());
    const metadata = await sharp(buffer).metadata();
    if (!metadata.width || !metadata.height) return null;
    return { width: metadata.width, height: metadata.height };
  } catch {
    return null;
  }
}

function isNumericString(value: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(value.trim()) && value.trim() !== "";
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidIp(value: string): boolean {
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(value) && value.split(".").every((p) => Number(p) <= 255);
  const ipv6 = /^[0-9a-fA-F:]{2,39}$/.test(value) && value.includes(":");
  return ipv4 || ipv6;
}
