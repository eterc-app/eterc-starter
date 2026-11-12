import { get_operation_definition } from "./operation-catalog";
import { validate_cron } from "./flow-cron";
import type {
  FlowOperationRecord,
  FlowStatus,
  FlowTrigger,
} from "./flow-types";

export interface FlowInput {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  status?: FlowStatus;
  trigger: FlowTrigger;
  options?: Record<string, unknown>;
  accountability?: "all" | "activity" | null;
}

const KEY_PATTERN = /^[a-z][a-z0-9_]*$/i;
const METHOD_PATTERN = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/;

export function normalize_trigger_options(
  trigger: FlowTrigger,
  input: Record<string, unknown> = {}
): Record<string, unknown> {
  switch (trigger) {
    case "event":
      return {
        type: input.type === "action" ? "action" : "filter",
        collections: Array.isArray(input.collections)
          ? input.collections.map(String).filter(Boolean)
          : [],
        actions: Array.isArray(input.actions)
          ? input.actions
              .map(String)
              .filter((action) =>
                ["create", "update", "delete"].includes(action)
              )
          : ["create", "update", "delete"],
      };
    case "webhook":
      return {
        method: METHOD_PATTERN.test(String(input.method ?? ""))
          ? String(input.method).toUpperCase()
          : "POST",
        async: input.async === true,
        error_on_reject: input.error_on_reject !== false,
        response_body: ["last", "all", "other"].includes(
          String(input.response_body)
        )
          ? String(input.response_body)
          : "last",
        response_body_other:
          typeof input.response_body_other === "string"
            ? input.response_body_other
            : "",
        cache: input.cache === true,
        public: input.public === true,
      };
    case "schedule":
      return {
        interval:
          typeof input.interval === "string" && input.interval.trim()
            ? input.interval.trim()
            : "0 * * * *",
        timezone: "UTC",
      };
    case "operation":
      return {
        response_body: ["last", "all", "other"].includes(
          String(input.response_body)
        )
          ? String(input.response_body)
          : "last",
        response_body_other:
          typeof input.response_body_other === "string"
            ? input.response_body_other
            : "",
      };
    case "manual":
      return {
        collections: Array.isArray(input.collections)
          ? input.collections.map(String).filter(Boolean)
          : [],
        async: input.async === true,
        error_on_reject: input.error_on_reject !== false,
        location: Array.isArray(input.location)
          ? input.location
              .map(String)
              .filter((entry) => entry === "collection" || entry === "item")
          : ["item"],
        collection_page_requires_selection:
          input.collection_page_requires_selection !== false,
        require_confirmation: input.require_confirmation === true,
      };
    default:
      return {};
  }
}

export function validate_flow_options(
  trigger: FlowTrigger,
  options: Record<string, unknown>
): string | null {
  if (trigger === "event") {
    if (!Array.isArray(options.collections) || options.collections.length === 0) {
      return "Choose at least one collection for this event hook.";
    }
    if (!Array.isArray(options.actions) || options.actions.length === 0) {
      return "Choose at least one event action.";
    }
  }
  if (trigger === "schedule") {
    const interval = String(options.interval ?? "");
    const error = validate_cron(interval);
    if (error) return `Schedule: ${error}`;
  }
  if (trigger === "manual") {
    if (!Array.isArray(options.collections) || options.collections.length === 0) {
      return "Choose at least one collection for this manual flow.";
    }
    if (!Array.isArray(options.location) || options.location.length === 0) {
      return "Choose where this manual flow can be started.";
    }
  }
  if (trigger === "webhook" && options.response_body === "other") {
    if (!String(options.response_body_other ?? "").trim()) {
      return "Describe the custom webhook response body.";
    }
  }
  if (trigger === "operation" && options.response_body === "other") {
    if (!String(options.response_body_other ?? "").trim()) {
      return "Describe the custom response body for this flow.";
    }
  }
  return null;
}

export function validate_operation_options(
  type: string,
  options: Record<string, unknown>
): string | null {
  const definition = get_operation_definition(type);
  if (!definition) return `Unknown operation type '${type}'.`;
  for (const field of definition.fields) {
    if (!field.required) continue;
    const value = options[field.name];
    if (value === null || value === undefined || String(value).trim() === "") {
      return `${definition.label}: '${field.label}' is required.`;
    }
  }
  if (
    ["item-read", "item-create", "item-update", "item-delete"].includes(type) &&
    !String(options.collection ?? "").trim()
  ) {
    return `${definition.label}: choose a collection.`;
  }
  if (type === "request") {
    const url = String(options.url ?? "");
    if (!/^https?:\/\//i.test(url) && !url.includes("{{")) {
      return "Web request: the URL must start with http:// or https://.";
    }
  }
  if (type === "trigger" && !String(options.flow_id ?? "").trim()) {
    return "Run another flow: choose a target flow.";
  }
  return null;
}

export interface FlowGraphInput {
  id?: string;
  name: string;
  key: string;
  type: string;
  options?: Record<string, unknown>;
  position_x?: number;
  position_y?: number;
  resolve?: string | null;
  reject?: string | null;
}

export function validate_graph(
  flowId: string,
  operations: FlowGraphInput[],
  rootId: string | null
): { error: string | null; root: string | null } {
  if (operations.length === 0) {
    return { error: null, root: null };
  }

  const ids = new Set<string>();
  const keys = new Set<string>();
  for (const operation of operations) {
    if (operation.id) {
      if (ids.has(operation.id)) {
        return { error: "Two operations share the same id.", root: null };
      }
      ids.add(operation.id);
    }
    const key = operation.key.trim();
    if (!KEY_PATTERN.test(key)) {
      return {
        error: `Operation key '${key}' must start with a letter and use letters, numbers or underscores.`,
        root: null,
      };
    }
    if (keys.has(key)) {
      return { error: `Operation key '${key}' is used twice.`, root: null };
    }
    keys.add(key);
    if (!operation.name.trim()) {
      return { error: "Every operation needs a name.", root: null };
    }
    const optionError = validate_operation_options(
      operation.type,
      operation.options ?? {}
    );
    if (optionError) return { error: optionError, root: null };
  }

  for (const operation of operations) {
    for (const target of [operation.resolve, operation.reject]) {
      if (!target) continue;
      if (!ids.has(target)) {
        return {
          error: `Operation '${operation.name}' links to a step that is not in this flow.`,
          root: null,
        };
      }
    }
  }

  if (rootId && !ids.has(rootId)) {
    return { error: "The selected trigger step is not in this flow.", root: null };
  }

  // A flow can contain several roots while editing, but only one is executed.
  // Prefer the explicit root, then the first operation that nobody points at.
  if (rootId) return { error: null, root: rootId };
  const targeted = new Set(
    operations.flatMap((operation) =>
      [operation.resolve, operation.reject].filter((value): value is string => Boolean(value))
    )
  );
  const firstRoot = operations.find(
    (operation) => operation.id && !targeted.has(operation.id)
  );
  return {
    error: null,
    root: firstRoot?.id ?? operations[0]?.id ?? null,
  };
}

export function validate_flow_input(input: FlowInput): string | null {
  const name = input.name.trim();
  if (!name) return "Give the flow a name.";
  if (name.length > 120) return "The flow name is too long.";
  if (!["event", "webhook", "schedule", "operation", "manual"].includes(input.trigger)) {
    return "Choose a valid trigger.";
  }
  if (input.status && !["active", "inactive"].includes(input.status)) {
    return "Choose a valid status.";
  }
  const options = normalize_trigger_options(input.trigger, input.options ?? {});
  return validate_flow_options(input.trigger, options);
}

/** Shape returned to the UI; secret hashes are never included. */
export function public_flow(flow: {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  status: FlowStatus;
  trigger: FlowTrigger;
  options: Record<string, unknown>;
  accountability: "all" | "activity" | null;
  operation: string | null;
  revision: number;
  secret_prefix: string | null;
  next_run_at: number | null;
  last_run_at: number | null;
  created_at: number;
  updated_at: number;
}): Record<string, unknown> {
  return {
    id: flow.id,
    name: flow.name,
    description: flow.description,
    icon: flow.icon,
    color: flow.color,
    status: flow.status,
    trigger: flow.trigger,
    options: flow.options,
    accountability: flow.accountability,
    operation: flow.operation,
    revision: flow.revision,
    secret_prefix: flow.secret_prefix,
    next_run_at: flow.next_run_at,
    last_run_at: flow.last_run_at,
    created_at: flow.created_at,
    updated_at: flow.updated_at,
  };
}
