import { build_flow_context, response_body_for_run } from "./flow-context";
import { enqueue_flow_trigger } from "./flow-queue";
import { run_flow } from "./flow-runner";
import { verify_webhook_secret, get_flow } from "./flow-store";
import { FLOW_SECRET_HEADER } from "./flow-secrets";
import { SYSTEM_PRINCIPAL } from "./flow-principal";
import type { FlowRecord, FlowTriggerPayload } from "./flow-types";

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { expires: number; body: unknown; status: number }>();

export interface WebhookResult {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

function header_secret(request: Request): string | null {
  const direct = request.headers.get(FLOW_SECRET_HEADER);
  if (direct) return direct.trim();
  const authorization = request.headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }
  return null;
}

async function read_body(request: Request, method: string): Promise<unknown> {
  if (method === "GET" || method === "HEAD") return null;
  const text = await request.text();
  if (!text.trim()) return null;
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function query_object(url: URL): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) result[key] = value;
  return result;
}

export async function handle_webhook(
  request: Request,
  flowId: string
): Promise<WebhookResult> {
  const flow = get_flow(flowId);
  if (!flow) return { status: 404, body: { error: "Flow not found." } };
  if (flow.trigger !== "webhook") {
    return { status: 409, body: { error: "This flow is not a webhook flow." } };
  }
  if (flow.status !== "active") {
    return { status: 409, body: { error: "This flow is not active." } };
  }

  const expectedMethod = String(flow.options.method ?? "POST").toUpperCase();
  if (request.method !== expectedMethod) {
    return {
      status: 405,
      body: { error: `This webhook only accepts ${expectedMethod}.` },
      headers: { Allow: expectedMethod },
    };
  }

  if (flow.options.public !== true) {
    const secret = header_secret(request);
    if (!secret || !verify_webhook_secret(flow.id, secret)) {
      return {
        status: 401,
        body: {
          error: `Send the flow secret in the ${FLOW_SECRET_HEADER} header or as a Bearer token.`,
        },
      };
    }
  }

  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const body = await read_body(request, method);
  const trigger: FlowTriggerPayload = {
    type: "webhook",
    method,
    query: query_object(url),
    headers: Object.fromEntries(request.headers.entries()),
    body,
    flow_id: flow.id,
  };

  if (flow.options.async === true) {
    const jobId = enqueue_flow_trigger(flow.id, "webhook", trigger);
    return {
      status: 202,
      body: { status: "queued", job_id: jobId, flow_id: flow.id },
    };
  }

  const cached = flow.options.cache === true && method === "GET"
    ? cache.get(`${flow.id}:${url.toString()}`)
    : undefined;
  if (cached && cached.expires > Date.now()) {
    return { status: cached.status, body: cached.body };
  }

  const result = await run_flow({
    flow,
    trigger,
    principal: SYSTEM_PRINCIPAL,
  });

  if (result.status === "timeout") {
    return { status: 504, body: { error: result.error?.message ?? "The flow timed out." } };
  }
  if (result.status === "error") {
    return {
      status: 500,
      body: { error: result.error?.message ?? "The flow failed." },
    };
  }

  const context = build_flow_context({
    trigger,
    principal: SYSTEM_PRINCIPAL,
    flow,
    outputs: result.outputs,
  });
  context.$last = result.result;

  if (result.status === "rejected") {
    if (flow.options.error_on_reject !== false) {
      return {
        status: 403,
        body: {
          status: "rejected",
          error: result.error?.message ?? "The flow rejected this request.",
          run_id: result.run_id,
        },
      };
    }
    return {
      status: 200,
      body: {
        status: "rejected",
        error: result.error?.message ?? "The flow rejected this request.",
        run_id: result.run_id,
      },
    };
  }

  const responseBody = response_body_for_run(
    result,
    String(flow.options.response_body ?? "last"),
    typeof flow.options.response_body_other === "string"
      ? flow.options.response_body_other
      : undefined,
    context
  );
  if (flow.options.cache === true && method === "GET") {
    cache.set(`${flow.id}:${url.toString()}`, {
      expires: Date.now() + CACHE_TTL_MS,
      body: responseBody ?? null,
      status: 200,
    });
  }
  return { status: 200, body: responseBody ?? null };
}

export function clear_webhook_cache(flowId?: string): void {
  if (!flowId) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(`${flowId}:`)) cache.delete(key);
  }
}

export type { FlowRecord };
