import { EtHttpError } from "@/engine/signals";
import { activeAiProvider } from "@/engine/active/ai-provider";
import { activeEmailProvider } from "@/engine/active/email-provider";
import { activePaymentProvider } from "@/engine/active/payment-provider";
import { activeSmsProvider } from "@/engine/active/sms-provider";
import { activeTelegramProvider } from "@/engine/active/telegram-provider";
import { activeWhatsAppProvider } from "@/engine/active/whatsapp-provider";
import {
  create_record,
  delete_record,
  get_record,
  update_record,
} from "@/modules/cms/cms-store";
import { matches_filter } from "../flow-filters";
import {
  FlowConfigError,
  FlowRejectError,
  flow_error_message,
} from "../flow-errors";
import { resolve_templates } from "../flow-template";
import type {
  FlowExecutionContext,
  FlowOperationMeta,
  FlowOperationOutcome,
} from "../flow-types";

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function record_key(value: unknown): string | number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const textValue = String(value ?? "").trim();
  if (!textValue) {
    throw new FlowConfigError("An item key is required.");
  }
  return textValue;
}

async function item_read(
  options: Record<string, unknown>,
  context: FlowExecutionContext,
  meta: FlowOperationMeta
): Promise<FlowOperationOutcome> {
  const resolved = resolve_templates(options, context) as Record<string, unknown>;
  const collection = text(resolved.collection);
  if (!collection) throw new FlowConfigError("Choose a collection.", { operation: meta.operation.key });
  const key = record_key(resolved.key);
  try {
    return { output: await get_record(collection, key) };
  } catch (error) {
    if (error instanceof EtHttpError) {
      throw new FlowConfigError(error.message, { operation: meta.operation.key });
    }
    throw error;
  }
}

async function item_create(
  options: Record<string, unknown>,
  context: FlowExecutionContext,
  meta: FlowOperationMeta
): Promise<FlowOperationOutcome> {
  const resolved = resolve_templates(options, context) as Record<string, unknown>;
  const collection = text(resolved.collection);
  if (!collection) throw new FlowConfigError("Choose a collection.", { operation: meta.operation.key });
  const payload = object(resolved.payload);
  try {
    return {
      output: await create_record(collection, payload, meta.principal.user_id, {
        allowSortOverride: true,
      }),
    };
  } catch (error) {
    if (error instanceof EtHttpError) {
      throw new FlowConfigError(error.message, { operation: meta.operation.key });
    }
    throw error;
  }
}

async function item_update(
  options: Record<string, unknown>,
  context: FlowExecutionContext,
  meta: FlowOperationMeta
): Promise<FlowOperationOutcome> {
  const resolved = resolve_templates(options, context) as Record<string, unknown>;
  const collection = text(resolved.collection);
  if (!collection) throw new FlowConfigError("Choose a collection.", { operation: meta.operation.key });
  try {
    return {
      output: await update_record(
        collection,
        record_key(resolved.key),
        object(resolved.payload),
        meta.principal.user_id
      ),
    };
  } catch (error) {
    if (error instanceof EtHttpError) {
      throw new FlowConfigError(error.message, { operation: meta.operation.key });
    }
    throw error;
  }
}

async function item_delete(
  options: Record<string, unknown>,
  context: FlowExecutionContext,
  meta: FlowOperationMeta
): Promise<FlowOperationOutcome> {
  const resolved = resolve_templates(options, context) as Record<string, unknown>;
  const collection = text(resolved.collection);
  if (!collection) throw new FlowConfigError("Choose a collection.", { operation: meta.operation.key });
  const key = record_key(resolved.key);
  try {
    await delete_record(collection, key);
    return { output: { deleted: true, collection, key } };
  } catch (error) {
    if (error instanceof EtHttpError) {
      throw new FlowConfigError(error.message, { operation: meta.operation.key });
    }
    throw error;
  }
}

function assert_safe_url(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new FlowConfigError("The web request URL is not valid.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new FlowConfigError("Only HTTP and HTTPS requests are allowed.");
  }
  const blocked = new Set([
    "169.254.169.254",
    "metadata.google.internal",
    "0.0.0.0",
  ]);
  if (blocked.has(parsed.hostname.toLowerCase())) {
    throw new FlowConfigError("This host is blocked for security reasons.");
  }
  return parsed;
}

async function web_request(
  options: Record<string, unknown>,
  context: FlowExecutionContext,
  meta: FlowOperationMeta
): Promise<FlowOperationOutcome> {
  const resolved = resolve_templates(options, context) as Record<string, unknown>;
  const url = text(resolved.url);
  if (!url) throw new FlowConfigError("A request URL is required.", { operation: meta.operation.key });
  const parsed = assert_safe_url(url);
  const method = text(resolved.method, "GET").toUpperCase();
  const headers = object(resolved.headers) as Record<string, string>;
  const timeout = Math.max(
    500,
    Math.min(60_000, Number(resolved.timeout_ms) || 10_000)
  );
  let body: string | undefined;
  const rawBody = resolved.body;
  if (method !== "GET" && method !== "HEAD" && rawBody !== undefined) {
    if (typeof rawBody === "string") {
      body = rawBody;
    } else {
      body = JSON.stringify(rawBody);
      if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
        headers["content-type"] = "application/json";
      }
    }
  }

  let response: Response;
  try {
    response = await fetch(parsed, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(timeout),
      redirect: "follow",
    });
  } catch (error) {
    throw new FlowConfigError(
      `The request failed: ${flow_error_message(error)}`,
      { operation: meta.operation.key }
    );
  }

  const raw = await response.text();
  let data: unknown = raw;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("json") && raw.trim()) {
    try {
      data = JSON.parse(raw) as unknown;
    } catch {
      data = raw;
    }
  }
  return {
    output: {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      data,
    },
  };
}

async function condition(
  options: Record<string, unknown>,
  context: FlowExecutionContext,
  meta: FlowOperationMeta
): Promise<FlowOperationOutcome> {
  const resolved = resolve_templates(options, context) as Record<string, unknown>;
  const filter = resolved.filter ?? {};
  const target = context.$last;
  const passed = matches_filter(target, filter);
  if (!passed) {
    return {
      output: { passed: false, filter },
      next: "reject",
      reject_reason: "The condition did not match.",
    };
  }
  // Directus-style pass-through: a passing condition keeps the incoming data
  // so the next operation can continue with $last unchanged.
  return { output: target };
}

async function trigger_flow(
  options: Record<string, unknown>,
  context: FlowExecutionContext,
  meta: FlowOperationMeta
): Promise<FlowOperationOutcome> {
  const resolved = resolve_templates(options, context) as Record<string, unknown>;
  const flowId = text(resolved.flow_id);
  if (!flowId) throw new FlowConfigError("Choose a flow to trigger.");
  if (flowId === meta.flow.id) {
    throw new FlowConfigError("A flow cannot trigger itself.");
  }
  if (meta.depth >= 5) {
    throw new FlowConfigError("Flows can be nested at most five levels deep.");
  }
  const { get_flow } = await import("../flow-store");
  const target = await get_flow(flowId);
  if (!target) throw new FlowConfigError("The target flow no longer exists.");
  if (target.status !== "active") {
    throw new FlowConfigError("The target flow is not active.");
  }
  const { run_flow } = await import("../flow-runner");
  const run = await run_flow({
    flow: target,
    trigger: {
      type: "operation",
      body: resolved.payload ?? {},
      flow_id: meta.flow.id,
      parent_run_id: meta.run_id,
      depth: meta.depth + 1,
    },
    principal: meta.principal,
    parent_run_id: meta.run_id,
    depth: meta.depth + 1,
  });
  const mode = text(resolved.response_body, "last");
  const other = text(resolved.response_body_other);
  let output: unknown = run.result;
  if (mode === "all") output = run.outputs;
  if (mode === "other" && other) {
    output = other.includes("{{")
      ? resolve_templates(other, { ...context, $last: run.result, $all: run.outputs })
      : run.result;
  }
  return { output };
}

async function transform(
  options: Record<string, unknown>,
  context: FlowExecutionContext
): Promise<FlowOperationOutcome> {
  return { output: resolve_templates(options.json ?? null, context) };
}

async function log_message(
  options: Record<string, unknown>,
  context: FlowExecutionContext,
  meta: FlowOperationMeta
): Promise<FlowOperationOutcome> {
  const resolved = resolve_templates(options, context) as Record<string, unknown>;
  const message = text(resolved.message);
  const level = ["info", "warn", "error"].includes(text(resolved.level))
    ? text(resolved.level)
    : "info";
  const line = `[flow:${meta.flow.name}/${meta.operation.key}] ${message}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
  return { output: { level, message } };
}

async function sleep(
  options: Record<string, unknown>,
  _context: FlowExecutionContext
): Promise<FlowOperationOutcome> {
  const ms = Math.max(0, Math.min(60_000, Number(options.milliseconds) || 0));
  await new Promise((resolve) => setTimeout(resolve, ms));
  return { output: { slept_ms: ms } };
}

function throw_error(
  options: Record<string, unknown>,
  context: FlowExecutionContext
): FlowOperationOutcome {
  const resolved = resolve_templates(options, context) as Record<string, unknown>;
  const message = text(resolved.message, "The flow rejected this operation.");
  throw new FlowRejectError(message);
}

async function send_email(
  options: Record<string, unknown>,
  context: FlowExecutionContext,
  meta: FlowOperationMeta
): Promise<FlowOperationOutcome> {
  const resolved = resolve_templates(options, context) as Record<string, unknown>;
  const to = text(resolved.to).trim();
  const subject = text(resolved.subject).trim();
  const html = text(resolved.html);
  if (!to || !subject || !html) {
    throw new FlowConfigError("Email recipient, subject and HTML body are required.", {
      operation: meta.operation.key,
    });
  }
  if (!activeEmailProvider.isConfigured()) {
    throw new FlowConfigError("No email provider is configured.", {
      operation: meta.operation.key,
    });
  }
  const result = await activeEmailProvider.send({
    to,
    subject,
    html,
    text: text(resolved.text) || undefined,
  });
  if (!result.ok) {
    throw new Error(result.error ?? "Email delivery failed.");
  }
  return { output: { ok: true, id: result.id } };
}

async function send_sms(
  options: Record<string, unknown>,
  context: FlowExecutionContext,
  meta: FlowOperationMeta
): Promise<FlowOperationOutcome> {
  const resolved = resolve_templates(options, context) as Record<string, unknown>;
  const to = text(resolved.to).trim();
  const body = text(resolved.body).trim();
  if (!to || !body) {
    throw new FlowConfigError("SMS recipient and message are required.", {
      operation: meta.operation.key,
    });
  }
  if (!activeSmsProvider.isConfigured()) {
    throw new FlowConfigError("No SMS provider is configured.", {
      operation: meta.operation.key,
    });
  }
  const result = await activeSmsProvider.send({ to, body });
  if (!result.ok) {
    throw new Error(result.error ?? "SMS delivery failed.");
  }
  return { output: { ok: true, id: result.id } };
}

async function send_whatsapp(
  options: Record<string, unknown>,
  context: FlowExecutionContext,
  meta: FlowOperationMeta
): Promise<FlowOperationOutcome> {
  const resolved = resolve_templates(options, context) as Record<string, unknown>;
  const to = text(resolved.to).trim();
  const body = text(resolved.body).trim();
  if (!to || !body) {
    throw new FlowConfigError("WhatsApp recipient and message are required.", {
      operation: meta.operation.key,
    });
  }
  if (!activeWhatsAppProvider.isConfigured()) {
    throw new FlowConfigError("No WhatsApp provider is configured.", {
      operation: meta.operation.key,
    });
  }
  const result = await activeWhatsAppProvider.send({ to, body });
  if (!result.ok) {
    throw new Error(result.error ?? "WhatsApp delivery failed.");
  }
  return { output: { ok: true, id: result.id } };
}

async function send_telegram(
  options: Record<string, unknown>,
  context: FlowExecutionContext,
  meta: FlowOperationMeta
): Promise<FlowOperationOutcome> {
  const resolved = resolve_templates(options, context) as Record<string, unknown>;
  const chatId = text(resolved.chat_id).trim();
  const message = text(resolved.text).trim();
  if (!chatId || !message) {
    throw new FlowConfigError("Telegram chat ID and message are required.", {
      operation: meta.operation.key,
    });
  }
  if (!activeTelegramProvider.isConfigured()) {
    throw new FlowConfigError("No Telegram bot is configured.", {
      operation: meta.operation.key,
    });
  }
  const result = await activeTelegramProvider.send({ chatId, text: message });
  if (!result.ok) {
    throw new Error(result.error ?? "Telegram delivery failed.");
  }
  return { output: { ok: true, id: result.id } };
}

async function ai_generate(
  options: Record<string, unknown>,
  context: FlowExecutionContext,
  meta: FlowOperationMeta
): Promise<FlowOperationOutcome> {
  const resolved = resolve_templates(options, context) as Record<string, unknown>;
  const prompt = text(resolved.prompt).trim();
  if (!prompt) {
    throw new FlowConfigError("An AI prompt is required.", {
      operation: meta.operation.key,
    });
  }
  if (!activeAiProvider.isConfigured()) {
    throw new FlowConfigError("No AI provider is configured.", {
      operation: meta.operation.key,
    });
  }
  const result = await activeAiProvider.generateText({
    prompt,
    system: text(resolved.system) || undefined,
  });
  return { output: result };
}

async function payment_create_link(
  options: Record<string, unknown>,
  context: FlowExecutionContext,
  meta: FlowOperationMeta
): Promise<FlowOperationOutcome> {
  const resolved = resolve_templates(options, context) as Record<string, unknown>;
  const email = text(resolved.email).trim();
  const amount = Number(resolved.amount);
  const currency = text(resolved.currency).trim().toUpperCase();
  if (!email || !Number.isFinite(amount) || amount <= 0 || !currency) {
    throw new FlowConfigError("Email, a positive amount and currency are required.", {
      operation: meta.operation.key,
    });
  }
  if (!activePaymentProvider.isConfigured()) {
    throw new FlowConfigError("No payment provider is configured.", {
      operation: meta.operation.key,
    });
  }
  const result = await activePaymentProvider.createCheckout({
    email,
    amount,
    currency,
    reference: text(resolved.reference) || undefined,
    callbackUrl: text(resolved.callback_url) || undefined,
  });
  return { output: result };
}

async function payment_verify(
  options: Record<string, unknown>,
  context: FlowExecutionContext,
  meta: FlowOperationMeta
): Promise<FlowOperationOutcome> {
  const resolved = resolve_templates(options, context) as Record<string, unknown>;
  const reference = text(resolved.reference).trim();
  if (!reference) {
    throw new FlowConfigError("A payment reference is required.", {
      operation: meta.operation.key,
    });
  }
  if (!activePaymentProvider.isConfigured()) {
    throw new FlowConfigError("No payment provider is configured.", {
      operation: meta.operation.key,
    });
  }
  const result = await activePaymentProvider.verify(reference);
  return { output: result };
}

export async function run_operation(
  type: string,
  options: Record<string, unknown>,
  context: FlowExecutionContext,
  meta: FlowOperationMeta
): Promise<FlowOperationOutcome> {
  switch (type) {
    case "condition":
      return condition(options, context, meta);
    case "item-read":
      return item_read(options, context, meta);
    case "item-create":
      return item_create(options, context, meta);
    case "item-update":
      return item_update(options, context, meta);
    case "item-delete":
      return item_delete(options, context, meta);
    case "request":
      return web_request(options, context, meta);
    case "trigger":
      return trigger_flow(options, context, meta);
    case "transform":
      return transform(options, context);
    case "log":
      return log_message(options, context, meta);
    case "sleep":
      return sleep(options, context);
    case "throw-error":
      return throw_error(options, context);
    case "send-email":
      return send_email(options, context, meta);
    case "send-sms":
      return send_sms(options, context, meta);
    case "send-whatsapp":
      return send_whatsapp(options, context, meta);
    case "send-telegram":
      return send_telegram(options, context, meta);
    case "ai-generate":
      return ai_generate(options, context, meta);
    case "payment-create-link":
      return payment_create_link(options, context, meta);
    case "payment-verify":
      return payment_verify(options, context, meta);
    default:
      throw new FlowConfigError(`Unknown operation type '${type}'.`);
  }
}
