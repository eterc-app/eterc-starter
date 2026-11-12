import type {
  FlowExecutionContext,
  FlowPrincipal,
  FlowRecord,
  FlowRunResult,
  FlowTriggerPayload,
} from "./flow-types";
import { resolve_string } from "./flow-template";

/** Environment values that templates are allowed to read. */
export function public_env(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (
      key.startsWith("FLOW_PUBLIC_") ||
      key.startsWith("PUBLIC_") ||
      key === "NODE_ENV" ||
      key === "ETERC_PUBLIC_URL"
    ) {
      result[key] = value;
    }
  }
  return result;
}

export function principal_summary(principal: FlowPrincipal): Record<string, unknown> {
  return {
    kind: principal.kind,
    user_id: principal.user_id,
    role_id: principal.role_id,
    role_name: principal.role_name,
    admin: principal.admin,
    email: principal.email ?? null,
  };
}

export function build_flow_context(options: {
  trigger: FlowTriggerPayload;
  principal: FlowPrincipal;
  flow: FlowRecord;
  outputs?: Record<string, unknown>;
}): FlowExecutionContext {
  const outputs = options.outputs ?? {};
  const last =
    Object.keys(outputs).length > 0
      ? outputs[Object.keys(outputs)[Object.keys(outputs).length - 1]]
      : null;
  return {
    $trigger: options.trigger,
    $last: last,
    $accountability: options.principal,
    $env: public_env(),
    $flow: {
      id: options.flow.id,
      name: options.flow.name,
      trigger: options.flow.trigger,
    },
    $all: { ...outputs },
    ...outputs,
  } as FlowExecutionContext;
}

export function sync_context_outputs(
  context: FlowExecutionContext,
  outputs: Record<string, unknown>
): void {
  for (const [key, value] of Object.entries(outputs)) {
    context[key] = value;
  }
  context.$all = { ...outputs };
  const keys = Object.keys(outputs);
  context.$last = keys.length > 0 ? outputs[keys[keys.length - 1]] : null;
}

/**
 * Resolve the webhook / parent-flow response body.
 * `other` accepts a template such as `{{ $last.data }}` or a plain path.
 */
export function response_body_for_run(
  run: FlowRunResult,
  mode: string,
  other: string | undefined,
  context: Record<string, unknown>
): unknown {
  if (mode === "all") return run.outputs;
  if (mode === "other" && other) {
    if (other.includes("{{")) return resolve_string(other, context);
    const direct = context[other];
    if (direct !== undefined) return direct;
    return run.result;
  }
  return run.result;
}
