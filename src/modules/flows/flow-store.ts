import { randomUUID } from "node:crypto";
import { sqlite } from "@/engine/db";
import { EtHttpError } from "@/engine/signals";
import { next_cron_seconds } from "./flow-cron";
import { ensure_flow_schema } from "./flow-schema";
import { generate_flow_secret, verify_flow_secret } from "./flow-secrets";
import { safe_parse, safe_stringify } from "./flow-redaction";
import type {
  FlowAccountability,
  FlowJobRecord,
  FlowOperationRecord,
  FlowPrincipal,
  FlowRecord,
  FlowRunRecord,
  FlowRunStatus,
  FlowRunStepRecord,
  FlowStatus,
  FlowTrigger,
  FlowWithOperations,
} from "./flow-types";
import {
  normalize_trigger_options,
  public_flow,
  validate_flow_input,
  validate_flow_options,
  validate_graph,
  type FlowGraphInput,
  type FlowInput,
} from "./flow-validation";

type Row = Record<string, unknown>;

function now(): number {
  return Math.floor(Date.now() / 1000);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function number_or_null(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function options(value: unknown): Record<string, unknown> {
  const parsed = safe_parse(value, {});
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function accountability(value: unknown): FlowAccountability {
  return value === "all" || value === "activity" ? value : null;
}

function row_to_flow(row: Row): FlowRecord {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    icon: String(row.icon ?? "zap"),
    color: String(row.color ?? "#6366f1"),
    status: row.status === "active" ? "active" : "inactive",
    trigger: String(row.trigger ?? "manual") as FlowTrigger,
    options: options(row.options),
    accountability: accountability(row.accountability),
    operation: row.operation ? String(row.operation) : null,
    revision: Number(row.revision ?? 1),
    secret_prefix: row.secret_prefix ? String(row.secret_prefix) : null,
    next_run_at: number_or_null(row.next_run_at),
    last_run_at: number_or_null(row.last_run_at),
    created_at: Number(row.created_at ?? 0),
    updated_at: Number(row.updated_at ?? 0),
  };
}

function row_to_operation(row: Row): FlowOperationRecord {
  return {
    id: String(row.id),
    flow_id: String(row.flow_id),
    name: String(row.name ?? ""),
    key: String(row.key ?? ""),
    type: String(row.type ?? ""),
    options: options(row.options),
    position_x: Number(row.position_x ?? 0),
    position_y: Number(row.position_y ?? 0),
    resolve: row.resolve ? String(row.resolve) : null,
    reject: row.reject ? String(row.reject) : null,
    created_at: Number(row.created_at ?? 0),
    updated_at: Number(row.updated_at ?? 0),
  };
}

function row_to_run(row: Row): FlowRunRecord {
  const principal = safe_parse(row.principal, {}) as Record<string, unknown>;
  return {
    id: String(row.id),
    flow_id: String(row.flow_id),
    flow_name: row.flow_name ? String(row.flow_name) : undefined,
    trigger: String(row.trigger ?? "manual") as FlowTrigger,
    status: String(row.status ?? "running") as FlowRunStatus,
    started_at: Number(row.started_at ?? 0),
    finished_at: number_or_null(row.finished_at),
    duration_ms: number_or_null(row.duration_ms),
    input: safe_parse(row.input, null),
    output: safe_parse(row.output, null),
    error: row.error ? String(row.error) : null,
    principal: {
      kind:
        principal.kind === "user" || principal.kind === "api_key"
          ? principal.kind
          : "system",
      user_id: typeof principal.user_id === "number" ? principal.user_id : null,
      role_id: typeof principal.role_id === "number" ? principal.role_id : null,
      role_name: String(principal.role_name ?? "System"),
      admin: principal.admin === true,
      email: typeof principal.email === "string" ? principal.email : null,
    },
    accountability: accountability(row.accountability),
    parent_run_id: row.parent_run_id ? String(row.parent_run_id) : null,
  };
}

function row_to_step(row: Row): FlowRunStepRecord {
  return {
    id: String(row.id),
    run_id: String(row.run_id),
    operation_id: row.operation_id ? String(row.operation_id) : null,
    key: String(row.key ?? ""),
    type: String(row.type ?? ""),
    path: (row.path === "resolve" || row.path === "reject"
      ? row.path
      : "root") as FlowRunStepRecord["path"],
    status: (row.status === "rejected" || row.status === "error"
      ? row.status
      : "success") as FlowRunStepRecord["status"],
    started_at: Number(row.started_at ?? 0),
    finished_at: Number(row.finished_at ?? 0),
    duration_ms: Number(row.duration_ms ?? 0),
    input: safe_parse(row.input, null),
    output: safe_parse(row.output, null),
    error: row.error ? String(row.error) : null,
    sort: Number(row.sort ?? 0),
  };
}

function row_to_job(row: Row): FlowJobRecord {
  return {
    id: String(row.id),
    flow_id: String(row.flow_id),
    trigger: String(row.trigger ?? "manual") as FlowTrigger,
    payload: safe_parse(row.payload, {}),
    status: String(row.status ?? "pending") as FlowJobRecord["status"],
    attempts: Number(row.attempts ?? 0),
    max_attempts: Number(row.max_attempts ?? 3),
    run_at: Number(row.run_at ?? 0),
    locked_at: number_or_null(row.locked_at),
    locked_by: row.locked_by ? String(row.locked_by) : null,
    error: row.error ? String(row.error) : null,
    created_at: Number(row.created_at ?? 0),
    updated_at: Number(row.updated_at ?? 0),
  };
}

export function list_flows(): FlowRecord[] {
  ensure_flow_schema();
  const rows = sqlite()
    .prepare("SELECT * FROM cms_flows ORDER BY updated_at DESC, name ASC")
    .all() as Row[];
  return rows.map(row_to_flow);
}

export function get_flow(id: string): FlowRecord | null {
  ensure_flow_schema();
  const row = sqlite()
    .prepare("SELECT * FROM cms_flows WHERE id = ? LIMIT 1")
    .get(id) as Row | undefined;
  return row ? row_to_flow(row) : null;
}

export function get_flow_with_operations(id: string): FlowWithOperations | null {
  const flow = get_flow(id);
  if (!flow) return null;
  const rows = sqlite()
    .prepare(
      "SELECT * FROM cms_flow_operations WHERE flow_id = ? ORDER BY created_at ASC, name ASC"
    )
    .all(id) as Row[];
  return { ...flow, operations: rows.map(row_to_operation) };
}

export function list_active_flows(trigger?: FlowTrigger): FlowRecord[] {
  ensure_flow_schema();
  const rows = trigger
    ? (sqlite()
        .prepare(
          "SELECT * FROM cms_flows WHERE status = 'active' AND trigger = ? ORDER BY updated_at DESC"
        )
        .all(trigger) as Row[])
    : (sqlite()
        .prepare("SELECT * FROM cms_flows WHERE status = 'active' ORDER BY updated_at DESC")
        .all() as Row[]);
  return rows.map(row_to_flow);
}

export function create_flow(input: FlowInput): {
  flow: FlowRecord;
  secret: string | null;
} {
  ensure_flow_schema();
  const error = validate_flow_input(input);
  if (error) throw new EtHttpError(400, error);
  const id = randomUUID();
  const at = now();
  const trigger = input.trigger;
  const flowOptions = normalize_trigger_options(trigger, input.options ?? {});
  const optionError = validate_flow_options(trigger, flowOptions);
  if (optionError) throw new EtHttpError(400, optionError);

  const secretData = trigger === "webhook" ? generate_flow_secret() : null;
  const nextRun =
    trigger === "schedule"
      ? next_cron_seconds(String(flowOptions.interval))
      : null;

  sqlite()
    .prepare(
      `INSERT INTO cms_flows
        (id, name, description, icon, color, status, trigger, options, accountability,
         operation, revision, secret_hash, secret_prefix, next_run_at, last_run_at,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?, ?, NULL, ?, ?)`
    )
    .run(
      id,
      input.name.trim(),
      text(input.description),
      text(input.icon, "zap") || "zap",
      text(input.color, "#6366f1") || "#6366f1",
      input.status === "active" ? "active" : "inactive",
      trigger,
      JSON.stringify(flowOptions),
      input.accountability === "all" || input.accountability === "activity"
        ? input.accountability
        : null,
      secretData?.hash ?? null,
      secretData?.prefix ?? null,
      nextRun,
      at,
      at
    );

  const flow = get_flow(id);
  if (!flow) throw new EtHttpError(500, "The flow was created but could not be read back.");
  return { flow, secret: secretData?.secret ?? null };
}

export function update_flow_meta(
  id: string,
  patch: {
    name?: string;
    description?: string;
    icon?: string;
    color?: string;
    status?: FlowStatus;
    accountability?: FlowAccountability;
  }
): FlowRecord {
  const flow = get_flow(id);
  if (!flow) throw new EtHttpError(404, "Flow not found.");
  const status = patch.status ?? flow.status;
  if (patch.name !== undefined && !patch.name.trim()) {
    throw new EtHttpError(400, "Give the flow a name.");
  }

  if (status === "active") {
    const count = sqlite()
      .prepare("SELECT COUNT(*) AS total FROM cms_flow_operations WHERE flow_id = ?")
      .get(id) as { total: number };
    if (Number(count.total) === 0) {
      throw new EtHttpError(400, "Add at least one operation before activating the flow.");
    }
    if (!flow.operation) {
      throw new EtHttpError(400, "Choose the trigger step before activating the flow.");
    }
  }

  const nextRun =
    flow.trigger === "schedule" && status === "active"
      ? flow.next_run_at ?? next_cron_seconds(String(flow.options.interval))
      : null;

  sqlite()
    .prepare(
      `UPDATE cms_flows
       SET name = ?, description = ?, icon = ?, color = ?, status = ?,
           accountability = ?, next_run_at = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(
      patch.name?.trim() ?? flow.name,
      patch.description ?? flow.description,
      patch.icon ?? flow.icon,
      patch.color ?? flow.color,
      status,
      patch.accountability === undefined ? flow.accountability : patch.accountability,
      nextRun,
      now(),
      id
    );

  const updated = get_flow(id);
  if (!updated) throw new EtHttpError(404, "Flow not found.");
  return updated;
}

export function update_flow_trigger(
  id: string,
  trigger: FlowTrigger,
  inputOptions: Record<string, unknown>
): { flow: FlowRecord; secret: string | null } {
  const flow = get_flow(id);
  if (!flow) throw new EtHttpError(404, "Flow not found.");
  const normalized = normalize_trigger_options(trigger, inputOptions);
  const error = validate_flow_options(trigger, normalized);
  if (error) throw new EtHttpError(400, error);

  let secret: string | null = null;
  let secretHash: string | null = null;
  let secretPrefix: string | null = null;
  if (trigger === "webhook") {
    const existing = sqlite()
      .prepare("SELECT secret_hash, secret_prefix FROM cms_flows WHERE id = ?")
      .get(id) as { secret_hash: string | null; secret_prefix: string | null } | undefined;
    if (existing?.secret_hash) {
      secretHash = existing.secret_hash;
      secretPrefix = existing.secret_prefix;
    } else {
      const generated = generate_flow_secret();
      secret = generated.secret;
      secretHash = generated.hash;
      secretPrefix = generated.prefix;
    }
  }

  const nextRun =
    trigger === "schedule" ? next_cron_seconds(String(normalized.interval)) : null;

  sqlite()
    .prepare(
      `UPDATE cms_flows
       SET trigger = ?, options = ?, secret_hash = ?, secret_prefix = ?,
           next_run_at = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(trigger, JSON.stringify(normalized), secretHash, secretPrefix, nextRun, now(), id);

  const updated = get_flow(id);
  if (!updated) throw new EtHttpError(404, "Flow not found.");
  return { flow: updated, secret };
}

export function duplicate_flow(id: string): FlowRecord {
  const source = get_flow_with_operations(id);
  if (!source) throw new EtHttpError(404, "Flow not found.");
  const created = create_flow({
    name: `${source.name} copy`,
    description: source.description,
    icon: source.icon,
    color: source.color,
    status: "inactive",
    trigger: source.trigger,
    options: source.options,
    accountability: source.accountability,
  });
  if (source.operations.length > 0) {
    const idMap = new Map<string, string>();
    for (const operation of source.operations) {
      idMap.set(operation.id, randomUUID());
    }
    const root = source.operation ? idMap.get(source.operation) ?? null : null;
    save_flow_graph(
      created.flow.id,
      1,
      source.operations.map((operation) => ({
        id: idMap.get(operation.id),
        name: operation.name,
        key: operation.key,
        type: operation.type,
        options: operation.options,
        position_x: operation.position_x,
        position_y: operation.position_y,
        resolve: operation.resolve ? idMap.get(operation.resolve) ?? null : null,
        reject: operation.reject ? idMap.get(operation.reject) ?? null : null,
      })),
      root
    );
  }
  const duplicated = get_flow(created.flow.id);
  if (!duplicated) throw new EtHttpError(500, "The flow could not be duplicated.");
  return duplicated;
}

/**
 * Replace the complete operation graph. Optimistic concurrency prevents two
 * builders from silently overwriting one another.
 */
export function save_flow_graph(
  id: string,
  revision: number,
  operations: FlowGraphInput[],
  rootId: string | null
): FlowWithOperations {
  const flow = get_flow(id);
  if (!flow) throw new EtHttpError(404, "Flow not found.");
  if (Number.isFinite(revision) && revision !== flow.revision) {
    throw new EtHttpError(
      409,
      "This flow was changed in another tab. Reload before saving again."
    );
  }

  const normalized = operations.map((operation) => ({
    ...operation,
    id: operation.id && operation.id.trim() ? operation.id : randomUUID(),
    key: operation.key.trim(),
    name: operation.name.trim(),
    options: operation.options ?? {},
    position_x: Number.isFinite(operation.position_x) ? operation.position_x : 0,
    position_y: Number.isFinite(operation.position_y) ? operation.position_y : 0,
  }));

  const validated = validate_graph(id, normalized, rootId);
  if (validated.error) throw new EtHttpError(400, validated.error);

  const at = now();
  const write = sqlite().transaction(() => {
    const current = sqlite()
      .prepare("SELECT revision FROM cms_flows WHERE id = ?")
      .get(id) as { revision: number } | undefined;
    if (!current) throw new EtHttpError(404, "Flow not found.");
    if (Number(current.revision) !== flow.revision) {
      throw new EtHttpError(
        409,
        "This flow was changed in another tab. Reload before saving again."
      );
    }

    sqlite().prepare("DELETE FROM cms_flow_operations WHERE flow_id = ?").run(id);
    const insert = sqlite().prepare(
      `INSERT INTO cms_flow_operations
        (id, flow_id, name, key, type, options, position_x, position_y,
         resolve, reject, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const operation of normalized) {
      insert.run(
        operation.id,
        id,
        operation.name,
        operation.key,
        operation.type,
        JSON.stringify(operation.options),
        operation.position_x,
        operation.position_y,
        operation.resolve ?? null,
        operation.reject ?? null,
        at,
        at
      );
    }

    const nextRun =
      flow.trigger === "schedule" && flow.status === "active"
        ? flow.next_run_at ?? next_cron_seconds(String(flow.options.interval))
        : flow.next_run_at;

    sqlite()
      .prepare(
        "UPDATE cms_flows SET operation = ?, revision = revision + 1, next_run_at = ?, updated_at = ? WHERE id = ?"
      )
      .run(validated.root, nextRun, at, id);
  });

  write.immediate();
  const updated = get_flow_with_operations(id);
  if (!updated) throw new EtHttpError(404, "Flow not found.");
  return updated;
}

export function delete_flow(id: string): void {
  ensure_flow_schema();
  const result = sqlite().prepare("DELETE FROM cms_flows WHERE id = ?").run(id);
  if (result.changes === 0) throw new EtHttpError(404, "Flow not found.");
}

export function rotate_flow_secret(id: string): {
  flow: FlowRecord;
  secret: string;
} {
  const flow = get_flow(id);
  if (!flow) throw new EtHttpError(404, "Flow not found.");
  if (flow.trigger !== "webhook") {
    throw new EtHttpError(400, "Only webhook flows have a request secret.");
  }
  const generated = generate_flow_secret();
  sqlite()
    .prepare(
      "UPDATE cms_flows SET secret_hash = ?, secret_prefix = ?, updated_at = ? WHERE id = ?"
    )
    .run(generated.hash, generated.prefix, now(), id);
  const updated = get_flow(id);
  if (!updated) throw new EtHttpError(404, "Flow not found.");
  return { flow: updated, secret: generated.secret };
}

export function verify_webhook_secret(id: string, secret: string): boolean {
  ensure_flow_schema();
  const row = sqlite()
    .prepare("SELECT secret_hash FROM cms_flows WHERE id = ? LIMIT 1")
    .get(id) as { secret_hash: string | null } | undefined;
  if (!row) return false;
  return verify_flow_secret(secret, row.secret_hash);
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

export function create_flow_run(input: {
  flow: FlowRecord;
  trigger: FlowTrigger;
  principal: FlowPrincipal;
  payload: unknown;
  parent_run_id?: string | null;
}): string {
  ensure_flow_schema();
  const id = randomUUID();
  const at = now();
  sqlite()
    .prepare(
      `INSERT INTO cms_flow_runs
        (id, flow_id, trigger, status, started_at, input, output, principal,
         accountability, parent_run_id, created_at)
       VALUES (?, ?, ?, 'running', ?, ?, 'null', ?, ?, ?, ?)`
    )
    .run(
      id,
      input.flow.id,
      input.trigger,
      at,
      safe_stringify(input.payload),
      safe_stringify({
        kind: input.principal.kind,
        user_id: input.principal.user_id,
        role_id: input.principal.role_id,
        role_name: input.principal.role_name,
        admin: input.principal.admin,
        email: input.principal.email ?? null,
      }),
      input.flow.accountability,
      input.parent_run_id ?? null,
      at
    );
  return id;
}

export function finish_flow_run(
  id: string,
  patch: {
    status: FlowRunStatus;
    output: unknown;
    error: string | null;
    duration_ms: number;
  }
): void {
  const at = now();
  sqlite()
    .prepare(
      `UPDATE cms_flow_runs
       SET status = ?, output = ?, error = ?, finished_at = ?, duration_ms = ?
       WHERE id = ?`
    )
    .run(
      patch.status,
      safe_stringify(patch.output),
      patch.error,
      at,
      patch.duration_ms,
      id
    );
}

export function touch_flow_run(id: string): void {
  const row = sqlite()
    .prepare("SELECT flow_id FROM cms_flow_runs WHERE id = ? LIMIT 1")
    .get(id) as { flow_id: string } | undefined;
  if (!row) return;
  sqlite()
    .prepare("UPDATE cms_flows SET last_run_at = ?, updated_at = updated_at WHERE id = ?")
    .run(now(), row.flow_id);
}

export function add_flow_run_step(
  runId: string,
  step: Omit<FlowRunStepRecord, "id" | "run_id">
): FlowRunStepRecord {
  const id = randomUUID();
  sqlite()
    .prepare(
      `INSERT INTO cms_flow_run_steps
        (id, run_id, operation_id, key, type, path, status, started_at,
         finished_at, duration_ms, input, output, error, sort)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      runId,
      step.operation_id,
      step.key,
      step.type,
      step.path,
      step.status,
      step.started_at,
      step.finished_at,
      step.duration_ms,
      safe_stringify(step.input),
      safe_stringify(step.output),
      step.error,
      step.sort
    );
  return { ...step, id, run_id: runId };
}

export function list_flow_runs(options: {
  flow_id?: string;
  status?: string;
  limit?: number;
  offset?: number;
} = {}): { runs: FlowRunRecord[]; total: number } {
  ensure_flow_schema();
  const where: string[] = [];
  const params: unknown[] = [];
  if (options.flow_id) {
    where.push("r.flow_id = ?");
    params.push(options.flow_id);
  }
  if (options.status && options.status !== "all") {
    where.push("r.status = ?");
    params.push(options.status);
  }
  const clause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Math.min(100, Math.max(1, options.limit ?? 25));
  const offset = Math.max(0, options.offset ?? 0);
  const rows = sqlite()
    .prepare(
      `SELECT r.*, f.name AS flow_name
       FROM cms_flow_runs r
       LEFT JOIN cms_flows f ON f.id = r.flow_id
       ${clause}
       ORDER BY r.started_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as Row[];
  const count = sqlite()
    .prepare(`SELECT COUNT(*) AS total FROM cms_flow_runs r ${clause}`)
    .get(...params) as { total: number };
  return { runs: rows.map(row_to_run), total: Number(count.total) };
}

export function get_flow_run(id: string): FlowRunRecord | null {
  ensure_flow_schema();
  const row = sqlite()
    .prepare(
      `SELECT r.*, f.name AS flow_name
       FROM cms_flow_runs r
       LEFT JOIN cms_flows f ON f.id = r.flow_id
       WHERE r.id = ? LIMIT 1`
    )
    .get(id) as Row | undefined;
  return row ? row_to_run(row) : null;
}

export function list_flow_run_steps(runId: string): FlowRunStepRecord[] {
  const rows = sqlite()
    .prepare("SELECT * FROM cms_flow_run_steps WHERE run_id = ? ORDER BY sort ASC")
    .all(runId) as Row[];
  return rows.map(row_to_step);
}

export function delete_old_flow_runs(days: number): number {
  ensure_flow_schema();
  const cutoff = now() - Math.max(1, days) * 86400;
  const result = sqlite()
    .prepare("DELETE FROM cms_flow_runs WHERE started_at < ?")
    .run(cutoff);
  return Number(result.changes);
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

export function enqueue_flow_job(input: {
  flow_id: string;
  trigger: FlowTrigger;
  payload: unknown;
  run_at?: number;
  max_attempts?: number;
}): string {
  ensure_flow_schema();
  const id = randomUUID();
  const at = now();
  sqlite()
    .prepare(
      `INSERT INTO cms_flow_jobs
        (id, flow_id, trigger, payload, status, attempts, max_attempts, run_at,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.flow_id,
      input.trigger,
      safe_stringify(input.payload ?? {}),
      Math.max(1, Math.min(10, input.max_attempts ?? 3)),
      input.run_at ?? at,
      at,
      at
    );
  return id;
}

export function claim_flow_job(workerId: string): FlowJobRecord | null {
  ensure_flow_schema();
  const at = now();
  const claim = sqlite().transaction(() => {
    const row = sqlite()
      .prepare(
        `SELECT id FROM cms_flow_jobs
         WHERE status = 'pending' AND run_at <= ?
         ORDER BY run_at ASC, created_at ASC
         LIMIT 1`
      )
      .get(at) as { id: string } | undefined;
    if (!row) return null;
    const result = sqlite()
      .prepare(
        `UPDATE cms_flow_jobs
         SET status = 'running', attempts = attempts + 1, locked_at = ?, locked_by = ?, updated_at = ?
         WHERE id = ? AND status = 'pending'`
      )
      .run(at, workerId, at, row.id);
    if (result.changes === 0) return null;
    const claimed = sqlite()
      .prepare("SELECT * FROM cms_flow_jobs WHERE id = ? LIMIT 1")
      .get(row.id) as Row | undefined;
    return claimed ? row_to_job(claimed) : null;
  });
  return claim.immediate();
}

export function complete_flow_job(id: string): void {
  sqlite()
    .prepare(
      "UPDATE cms_flow_jobs SET status = 'done', locked_at = NULL, locked_by = NULL, updated_at = ? WHERE id = ?"
    )
    .run(now(), id);
}

export function fail_flow_job(job: FlowJobRecord, error: string): void {
  const retry = job.attempts < job.max_attempts;
  const delay = Math.min(300, Math.max(5, job.attempts * 15));
  sqlite()
    .prepare(
      `UPDATE cms_flow_jobs
       SET status = ?, run_at = ?, locked_at = NULL, locked_by = NULL, error = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(retry ? "pending" : "error", retry ? now() + delay : job.run_at, error, now(), job.id);
}

export function recover_stale_flow_jobs(staleAfterSeconds = 900): number {
  ensure_flow_schema();
  const cutoff = now() - staleAfterSeconds;
  const result = sqlite()
    .prepare(
      `UPDATE cms_flow_jobs
       SET status = 'pending', locked_at = NULL, locked_by = NULL, updated_at = ?
       WHERE status = 'running' AND locked_at IS NOT NULL AND locked_at < ?`
    )
    .run(now(), cutoff);
  return Number(result.changes);
}

export function flow_queue_depth(): {
  pending: number;
  running: number;
  failed: number;
} {
  ensure_flow_schema();
  const rows = sqlite()
    .prepare("SELECT status, COUNT(*) AS total FROM cms_flow_jobs GROUP BY status")
    .all() as Array<{ status: string; total: number }>;
  const counts = { pending: 0, running: 0, failed: 0 };
  for (const row of rows) {
    if (row.status === "pending") counts.pending = Number(row.total);
    if (row.status === "running") counts.running = Number(row.total);
    if (row.status === "error") counts.failed = Number(row.total);
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------

export function due_schedule_flows(at = now()): FlowRecord[] {
  ensure_flow_schema();
  const rows = sqlite()
    .prepare(
      `SELECT * FROM cms_flows
       WHERE status = 'active' AND trigger = 'schedule'
         AND (next_run_at IS NULL OR next_run_at <= ?)
       ORDER BY next_run_at ASC`
    )
    .all(at) as Row[];
  return rows.map(row_to_flow);
}

export function set_flow_next_run(id: string, nextRunAt: number | null): void {
  sqlite()
    .prepare("UPDATE cms_flows SET next_run_at = ?, updated_at = ? WHERE id = ?")
    .run(nextRunAt, now(), id);
}

export function last_flow_run_at(flowId?: string): number | null {
  const row = flowId
    ? (sqlite()
        .prepare("SELECT MAX(started_at) AS at FROM cms_flow_runs WHERE flow_id = ?")
        .get(flowId) as { at: number | null } | undefined)
    : (sqlite()
        .prepare("SELECT MAX(started_at) AS at FROM cms_flow_runs")
        .get() as { at: number | null } | undefined);
  return row?.at ?? null;
}

export function flow_health_snapshot(): {
  active: number;
  inactive: number;
  schedules: number;
  queue: { pending: number; running: number; failed: number };
  last_run_at: number | null;
} {
  ensure_flow_schema();
  const counts = sqlite()
    .prepare("SELECT status, COUNT(*) AS total FROM cms_flows GROUP BY status")
    .all() as Array<{ status: string; total: number }>;
  let active = 0;
  let inactive = 0;
  for (const row of counts) {
    if (row.status === "active") active = Number(row.total);
    if (row.status === "inactive") inactive = Number(row.total);
  }
  const schedules = sqlite()
    .prepare(
      "SELECT COUNT(*) AS total FROM cms_flows WHERE status = 'active' AND trigger = 'schedule'"
    )
    .get() as { total: number };
  return {
    active,
    inactive,
    schedules: Number(schedules.total),
    queue: flow_queue_depth(),
    last_run_at: last_flow_run_at(),
  };
}

export { public_flow };
