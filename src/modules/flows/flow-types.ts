/**
 * Shared types for the Eterc flow engine.
 *
 * A flow is a trigger plus a graph of operations linked by `resolve` and
 * `reject` paths. The shape intentionally mirrors Directus Flows so the UI and
 * the execution model stay familiar, without copying Directus source code.
 */

export const FLOW_TRIGGERS = [
  "event",
  "webhook",
  "schedule",
  "operation",
  "manual",
] as const;

export type FlowTrigger = (typeof FLOW_TRIGGERS)[number];

export const FLOW_STATUSES = ["active", "inactive"] as const;
export type FlowStatus = (typeof FLOW_STATUSES)[number];

export const FLOW_RUN_STATUSES = [
  "running",
  "success",
  "rejected",
  "error",
  "timeout",
  "cancelled",
] as const;
export type FlowRunStatus = (typeof FLOW_RUN_STATUSES)[number];

export type FlowAccountability = "all" | "activity" | null;

export type FlowJobStatus = "pending" | "running" | "done" | "error";

export interface FlowRecord {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  status: FlowStatus;
  trigger: FlowTrigger;
  options: Record<string, unknown>;
  accountability: FlowAccountability;
  /** Root operation id. */
  operation: string | null;
  revision: number;
  secret_prefix: string | null;
  next_run_at: number | null;
  last_run_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface FlowOperationRecord {
  id: string;
  flow_id: string;
  name: string;
  key: string;
  type: string;
  options: Record<string, unknown>;
  position_x: number;
  position_y: number;
  resolve: string | null;
  reject: string | null;
  created_at: number;
  updated_at: number;
}

export interface FlowWithOperations extends FlowRecord {
  operations: FlowOperationRecord[];
}

export interface FlowRunRecord {
  id: string;
  flow_id: string;
  flow_name?: string;
  trigger: FlowTrigger;
  status: FlowRunStatus;
  started_at: number;
  finished_at: number | null;
  duration_ms: number | null;
  input: unknown;
  output: unknown;
  error: string | null;
  principal: FlowPrincipal;
  accountability: FlowAccountability;
  parent_run_id: string | null;
}

export interface FlowRunStepRecord {
  id: string;
  run_id: string;
  operation_id: string | null;
  key: string;
  type: string;
  path: "root" | "resolve" | "reject";
  status: "success" | "rejected" | "error";
  started_at: number;
  finished_at: number;
  duration_ms: number;
  input: unknown;
  output: unknown;
  error: string | null;
  sort: number;
}

export interface FlowJobRecord {
  id: string;
  flow_id: string;
  trigger: FlowTrigger;
  payload: unknown;
  status: FlowJobStatus;
  attempts: number;
  max_attempts: number;
  run_at: number;
  locked_at: number | null;
  locked_by: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
}

export interface FlowPrincipal {
  kind: "user" | "api_key" | "system";
  user_id: number | null;
  role_id: number | null;
  role_name: string;
  admin: boolean;
  email?: string | null;
}

export interface FlowTriggerPayload {
  type: FlowTrigger;
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  method?: string;
  collection?: string;
  event?: string;
  key?: string | number | null;
  payload?: unknown;
  previous?: unknown;
  flow_id?: string;
  parent_run_id?: string | null;
  depth?: number;
  [key: string]: unknown;
}

export type FlowRunError = {
  message: string;
  code?: string;
  operation?: string;
};

export interface FlowRunResult {
  run_id: string;
  flow_id: string;
  status: FlowRunStatus;
  result: unknown;
  outputs: Record<string, unknown>;
  error: FlowRunError | null;
  duration_ms: number;
  steps: FlowRunStepRecord[];
}

export type FlowOperationOutcome = {
  output: unknown;
  /** Force the graph down the reject path. */
  next?: "resolve" | "reject";
  reject_reason?: string;
};

export type FlowOperationHandler = (
  options: Record<string, unknown>,
  context: FlowExecutionContext,
  meta: FlowOperationMeta
) => Promise<FlowOperationOutcome>;

export interface FlowExecutionContext extends Record<string, unknown> {
  $trigger: FlowTriggerPayload;
  $last: unknown;
  $accountability: FlowPrincipal;
  $env: Record<string, string>;
}

export interface FlowOperationMeta {
  flow: FlowRecord;
  operation: FlowOperationRecord;
  run_id: string;
  depth: number;
  parent_run_id: string | null;
  principal: FlowPrincipal;
}

export interface FlowRuntimeMode {
  mode: "embedded" | "worker" | "serverless";
  enabled: boolean;
  scheduler: boolean;
  queue: boolean;
  base_url: string;
  retention_days: number;
  missing: string[];
}

/** Trigger option shapes accepted by the wizard. */
export interface EventTriggerOptions {
  type: "filter" | "action";
  collections: string[];
  actions: Array<"create" | "update" | "delete">;
}

export interface WebhookTriggerOptions {
  method: string;
  async: boolean;
  error_on_reject: boolean;
  response_body: "last" | "all" | "other";
  response_body_other?: string;
  cache: boolean;
  public?: boolean;
}

export interface ScheduleTriggerOptions {
  interval: string;
  timezone: string;
}

export interface OperationTriggerOptions {
  response_body: "last" | "all" | "other";
  response_body_other?: string;
}

export interface ManualTriggerOptions {
  collections: string[];
  async: boolean;
  error_on_reject: boolean;
  location: Array<"collection" | "item">;
  collection_page_requires_selection: boolean;
  require_confirmation: boolean;
}

export const TRIGGER_LABELS: Record<FlowTrigger, string> = {
  event: "Event Hook",
  webhook: "Webhook",
  schedule: "Schedule",
  operation: "Another Flow",
  manual: "Manual",
};

export const RUN_STATUS_LABELS: Record<FlowRunStatus, string> = {
  running: "Running",
  success: "Success",
  rejected: "Rejected",
  error: "Error",
  timeout: "Timed out",
  cancelled: "Cancelled",
};

export const ACCOUNTABILITY_LABELS: Record<
  Exclude<FlowAccountability, null>,
  string
> = {
  all: "Activity and logs",
  activity: "Activity only",
};

export function is_flow_trigger(value: unknown): value is FlowTrigger {
  return FLOW_TRIGGERS.includes(value as FlowTrigger);
}

export function is_flow_status(value: unknown): value is FlowStatus {
  return FLOW_STATUSES.includes(value as FlowStatus);
}
