import { randomUUID } from "node:crypto";
import { activeDbAdapter } from "@/engine/active/db-adapter";
import type {
  DatabaseExecutionResult,
  IDatabaseAdapter,
} from "@/engine/contracts/database";
import { prepareQuery } from "@/engine/db/sql";
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

async function query_rows<T>(
  sql: string,
  params: unknown[] = [],
  adapter: IDatabaseAdapter = activeDbAdapter
): Promise<T[]> {
  const prepared = prepareQuery(sql, params, adapter.dialect);
  return adapter.query<T>(prepared.sql, prepared.params as unknown[]);
}

async function query_row<T>(
  sql: string,
  params: unknown[] = [],
  adapter: IDatabaseAdapter = activeDbAdapter
): Promise<T | undefined> {
  const rows = await query_rows<T>(sql, params, adapter);
  return rows[0];
}

async function exec(
  sql: string,
  params: unknown[] = [],
  adapter: IDatabaseAdapter = activeDbAdapter
): Promise<DatabaseExecutionResult> {
  const prepared = prepareQuery(sql, params, adapter.dialect);
  return adapter.execute(prepared.sql, prepared.params as unknown[]);
}

function row_to_flow(row: Row): FlowRecord {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    icon: String(row.icon ?? "zap"),
    color: String(row.color ?? "var(--foreground)"),
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

export async function list_flows(): Promise<FlowRecord[]> {
  await ensure_flow_schema();
  const rows = await query_rows<Row>(
    "SELECT * FROM cms_flows ORDER BY updated_at DESC, name ASC"
  );
  return rows.map(row_to_flow);
}

export async function get_flow(id: string): Promise<FlowRecord | null> {
  await ensure_flow_schema();
  const row = await query_row<Row>("SELECT * FROM cms_flows WHERE id = ? LIMIT 1", [
    id,
  ]);
  return row ? row_to_flow(row) : null;
}

export async function get_flow_with_operations(
  id: string
): Promise<FlowWithOperations | null> {
  const flow = await get_flow(id);
  if (!flow) return null;
  const rows = await query_rows<Row>(
    "SELECT * FROM cms_flow_operations WHERE flow_id = ? ORDER BY created_at ASC, name ASC",
    [id]
  );
  return { ...flow, operations: rows.map(row_to_operation) };
}

export async function list_active_flows(
  trigger?: FlowTrigger
): Promise<FlowRecord[]> {
  await ensure_flow_schema();
  const rows = trigger
    ? await query_rows<Row>(
        "SELECT * FROM cms_flows WHERE status = 'active' AND \"trigger\" = ? ORDER BY updated_at DESC",
        [trigger]
      )
    : await query_rows<Row>(
        "SELECT * FROM cms_flows WHERE status = 'active' ORDER BY updated_at DESC"
      );
  return rows.map(row_to_flow);
}

export async function create_flow(input: FlowInput): Promise<{
  flow: FlowRecord;
  secret: string | null;
}> {
  await ensure_flow_schema();
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

  await exec(
    `INSERT INTO cms_flows
      (id, name, description, icon, color, status, "trigger", options, accountability,
       operation, revision, secret_hash, secret_prefix, next_run_at, last_run_at,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?, ?, NULL, ?, ?)`,
    [
      id,
      input.name.trim(),
      text(input.description),
      text(input.icon, "zap") || "zap",
      text(input.color, "var(--foreground)") || "var(--foreground)",
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
      at,
    ]
  );

  const flow = await get_flow(id);
  if (!flow) throw new EtHttpError(500, "The flow was created but could not be read back.");
  return { flow, secret: secretData?.secret ?? null };
}

export async function update_flow_meta(
  id: string,
  patch: {
    name?: string;
    description?: string;
    icon?: string;
    color?: string;
    status?: FlowStatus;
    accountability?: FlowAccountability;
  }
): Promise<FlowRecord> {
  const flow = await get_flow(id);
  if (!flow) throw new EtHttpError(404, "Flow not found.");
  const status = patch.status ?? flow.status;
  if (patch.name !== undefined && !patch.name.trim()) {
    throw new EtHttpError(400, "Give the flow a name.");
  }

  if (status === "active") {
    const count = await query_row<{ total: number }>(
      "SELECT COUNT(*) AS total FROM cms_flow_operations WHERE flow_id = ?",
      [id]
    );
    if (Number(count?.total ?? 0) === 0) {
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

  await exec(
    `UPDATE cms_flows
     SET name = ?, description = ?, icon = ?, color = ?, status = ?,
         accountability = ?, next_run_at = ?, updated_at = ?
     WHERE id = ?`,
    [
      patch.name?.trim() ?? flow.name,
      patch.description ?? flow.description,
      patch.icon ?? flow.icon,
      patch.color ?? flow.color,
      status,
      patch.accountability === undefined ? flow.accountability : patch.accountability,
      nextRun,
      now(),
      id,
    ]
  );

  const updated = await get_flow(id);
  if (!updated) throw new EtHttpError(404, "Flow not found.");
  return updated;
}

export async function update_flow_trigger(
  id: string,
  trigger: FlowTrigger,
  inputOptions: Record<string, unknown>
): Promise<{ flow: FlowRecord; secret: string | null }> {
  const flow = await get_flow(id);
  if (!flow) throw new EtHttpError(404, "Flow not found.");
  const normalized = normalize_trigger_options(trigger, inputOptions);
  const error = validate_flow_options(trigger, normalized);
  if (error) throw new EtHttpError(400, error);

  let secret: string | null = null;
  let secretHash: string | null = null;
  let secretPrefix: string | null = null;
  if (trigger === "webhook") {
    const existing = await query_row<{
      secret_hash: string | null;
      secret_prefix: string | null;
    }>("SELECT secret_hash, secret_prefix FROM cms_flows WHERE id = ?", [id]);
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

  await exec(
    `UPDATE cms_flows
     SET "trigger" = ?, options = ?, secret_hash = ?, secret_prefix = ?,
         next_run_at = ?, updated_at = ?
     WHERE id = ?`,
    [trigger, JSON.stringify(normalized), secretHash, secretPrefix, nextRun, now(), id]
  );

  const updated = await get_flow(id);
  if (!updated) throw new EtHttpError(404, "Flow not found.");
  return { flow: updated, secret };
}

export async function duplicate_flow(id: string): Promise<FlowRecord> {
  const source = await get_flow_with_operations(id);
  if (!source) throw new EtHttpError(404, "Flow not found.");
  const created = await create_flow({
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
    await save_flow_graph(
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
  const duplicated = await get_flow(created.flow.id);
  if (!duplicated) throw new EtHttpError(500, "The flow could not be duplicated.");
  return duplicated;
}

/**
 * Replace the complete operation graph. Optimistic concurrency prevents two
 * builders from silently overwriting one another.
 */
export async function save_flow_graph(
  id: string,
  revision: number,
  operations: FlowGraphInput[],
  rootId: string | null
): Promise<FlowWithOperations> {
  const flow = await get_flow(id);
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
  await activeDbAdapter.transaction(async (trx) => {
    const current = await query_row<{ revision: number }>(
      "SELECT revision FROM cms_flows WHERE id = ?",
      [id],
      trx
    );
    if (!current) throw new EtHttpError(404, "Flow not found.");
    if (Number(current.revision) !== flow.revision) {
      throw new EtHttpError(
        409,
        "This flow was changed in another tab. Reload before saving again."
      );
    }

    await exec("DELETE FROM cms_flow_operations WHERE flow_id = ?", [id], trx);
    for (const operation of normalized) {
      await exec(
        `INSERT INTO cms_flow_operations
          (id, flow_id, name, "key", type, options, position_x, position_y,
           resolve, reject, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
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
          at,
        ],
        trx
      );
    }

    const nextRun =
      flow.trigger === "schedule" && flow.status === "active"
        ? flow.next_run_at ?? next_cron_seconds(String(flow.options.interval))
        : flow.next_run_at;

    await exec(
      "UPDATE cms_flows SET operation = ?, revision = revision + 1, next_run_at = ?, updated_at = ? WHERE id = ?",
      [validated.root, nextRun, at, id],
      trx
    );
  });

  const updated = await get_flow_with_operations(id);
  if (!updated) throw new EtHttpError(404, "Flow not found.");
  return updated;
}

export async function delete_flow(id: string): Promise<void> {
  await ensure_flow_schema();
  const result = await exec("DELETE FROM cms_flows WHERE id = ?", [id]);
  if (result.changes === 0) throw new EtHttpError(404, "Flow not found.");
}

export async function rotate_flow_secret(id: string): Promise<{
  flow: FlowRecord;
  secret: string;
}> {
  const flow = await get_flow(id);
  if (!flow) throw new EtHttpError(404, "Flow not found.");
  if (flow.trigger !== "webhook") {
    throw new EtHttpError(400, "Only webhook flows have a request secret.");
  }
  const generated = generate_flow_secret();
  await exec(
    "UPDATE cms_flows SET secret_hash = ?, secret_prefix = ?, updated_at = ? WHERE id = ?",
    [generated.hash, generated.prefix, now(), id]
  );
  const updated = await get_flow(id);
  if (!updated) throw new EtHttpError(404, "Flow not found.");
  return { flow: updated, secret: generated.secret };
}

export async function verify_webhook_secret(
  id: string,
  secret: string
): Promise<boolean> {
  await ensure_flow_schema();
  const row = await query_row<{ secret_hash: string | null }>(
    "SELECT secret_hash FROM cms_flows WHERE id = ? LIMIT 1",
    [id]
  );
  if (!row) return false;
  return verify_flow_secret(secret, row.secret_hash);
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

export async function create_flow_run(input: {
  flow: FlowRecord;
  trigger: FlowTrigger;
  principal: FlowPrincipal;
  payload: unknown;
  parent_run_id?: string | null;
}): Promise<string> {
  await ensure_flow_schema();
  const id = randomUUID();
  const at = now();
  await exec(
    `INSERT INTO cms_flow_runs
      (id, flow_id, "trigger", status, started_at, input, output, principal,
       accountability, parent_run_id, created_at)
     VALUES (?, ?, ?, 'running', ?, ?, 'null', ?, ?, ?, ?)`,
    [
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
      at,
    ]
  );
  return id;
}

export async function finish_flow_run(
  id: string,
  patch: {
    status: FlowRunStatus;
    output: unknown;
    error: string | null;
    duration_ms: number;
  }
): Promise<void> {
  const at = now();
  await exec(
    `UPDATE cms_flow_runs
     SET status = ?, output = ?, error = ?, finished_at = ?, duration_ms = ?
     WHERE id = ?`,
    [
      patch.status,
      safe_stringify(patch.output),
      patch.error,
      at,
      patch.duration_ms,
      id,
    ]
  );
}

export async function touch_flow_run(id: string): Promise<void> {
  const row = await query_row<{ flow_id: string }>(
    "SELECT flow_id FROM cms_flow_runs WHERE id = ? LIMIT 1",
    [id]
  );
  if (!row) return;
  await exec(
    "UPDATE cms_flows SET last_run_at = ?, updated_at = updated_at WHERE id = ?",
    [now(), row.flow_id]
  );
}

export async function add_flow_run_step(
  runId: string,
  step: Omit<FlowRunStepRecord, "id" | "run_id">
): Promise<FlowRunStepRecord> {
  const id = randomUUID();
  await exec(
    `INSERT INTO cms_flow_run_steps
      (id, run_id, operation_id, "key", type, path, status, started_at,
       finished_at, duration_ms, input, output, error, sort)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
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
      step.sort,
    ]
  );
  return { ...step, id, run_id: runId };
}

export async function list_flow_runs(options: {
  flow_id?: string;
  status?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ runs: FlowRunRecord[]; total: number }> {
  await ensure_flow_schema();
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
  const rows = await query_rows<Row>(
    `SELECT r.*, f.name AS flow_name
     FROM cms_flow_runs r
     LEFT JOIN cms_flows f ON f.id = r.flow_id
     ${clause}
     ORDER BY r.started_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const count = await query_row<{ total: number }>(
    `SELECT COUNT(*) AS total FROM cms_flow_runs r ${clause}`,
    params
  );
  return { runs: rows.map(row_to_run), total: Number(count?.total ?? 0) };
}

export async function get_flow_run(id: string): Promise<FlowRunRecord | null> {
  await ensure_flow_schema();
  const row = await query_row<Row>(
    `SELECT r.*, f.name AS flow_name
     FROM cms_flow_runs r
     LEFT JOIN cms_flows f ON f.id = r.flow_id
     WHERE r.id = ? LIMIT 1`,
    [id]
  );
  return row ? row_to_run(row) : null;
}

export async function list_flow_run_steps(
  runId: string
): Promise<FlowRunStepRecord[]> {
  const rows = await query_rows<Row>(
    "SELECT * FROM cms_flow_run_steps WHERE run_id = ? ORDER BY sort ASC",
    [runId]
  );
  return rows.map(row_to_step);
}

export async function delete_old_flow_runs(days: number): Promise<number> {
  await ensure_flow_schema();
  const cutoff = now() - Math.max(1, days) * 86400;
  const result = await exec("DELETE FROM cms_flow_runs WHERE started_at < ?", [
    cutoff,
  ]);
  return Number(result.changes);
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

export async function enqueue_flow_job(input: {
  flow_id: string;
  trigger: FlowTrigger;
  payload: unknown;
  run_at?: number;
  max_attempts?: number;
}): Promise<string> {
  await ensure_flow_schema();
  const id = randomUUID();
  const at = now();
  await exec(
    `INSERT INTO cms_flow_jobs
      (id, flow_id, "trigger", payload, status, attempts, max_attempts, run_at,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?)`,
    [
      id,
      input.flow_id,
      input.trigger,
      safe_stringify(input.payload ?? {}),
      Math.max(1, Math.min(10, input.max_attempts ?? 3)),
      input.run_at ?? at,
      at,
      at,
    ]
  );
  return id;
}

export async function claim_flow_job(
  workerId: string
): Promise<FlowJobRecord | null> {
  await ensure_flow_schema();
  const at = now();
  return await activeDbAdapter.transaction(async (trx) => {
    const row = await query_row<{ id: string }>(
      `SELECT id FROM cms_flow_jobs
       WHERE status = 'pending' AND run_at <= ?
       ORDER BY run_at ASC, created_at ASC
       LIMIT 1`,
      [at],
      trx
    );
    if (!row) return null;
    const result = await exec(
      `UPDATE cms_flow_jobs
       SET status = 'running', attempts = attempts + 1, locked_at = ?, locked_by = ?, updated_at = ?
       WHERE id = ? AND status = 'pending'`,
      [at, workerId, at, row.id],
      trx
    );
    if (result.changes === 0) return null;
    const claimed = await query_row<Row>(
      "SELECT * FROM cms_flow_jobs WHERE id = ? LIMIT 1",
      [row.id],
      trx
    );
    return claimed ? row_to_job(claimed) : null;
  });
}

export async function complete_flow_job(id: string): Promise<void> {
  await exec(
    "UPDATE cms_flow_jobs SET status = 'done', locked_at = NULL, locked_by = NULL, updated_at = ? WHERE id = ?",
    [now(), id]
  );
}

export async function fail_flow_job(
  job: FlowJobRecord,
  error: string
): Promise<void> {
  const retry = job.attempts < job.max_attempts;
  const delay = Math.min(300, Math.max(5, job.attempts * 15));
  await exec(
    `UPDATE cms_flow_jobs
     SET status = ?, run_at = ?, locked_at = NULL, locked_by = NULL, error = ?, updated_at = ?
     WHERE id = ?`,
    [
      retry ? "pending" : "error",
      retry ? now() + delay : job.run_at,
      error,
      now(),
      job.id,
    ]
  );
}

export async function recover_stale_flow_jobs(
  staleAfterSeconds = 900
): Promise<number> {
  await ensure_flow_schema();
  const cutoff = now() - staleAfterSeconds;
  const result = await exec(
    `UPDATE cms_flow_jobs
     SET status = 'pending', locked_at = NULL, locked_by = NULL, updated_at = ?
     WHERE status = 'running' AND locked_at IS NOT NULL AND locked_at < ?`,
    [now(), cutoff]
  );
  return Number(result.changes);
}

export async function flow_queue_depth(): Promise<{
  pending: number;
  running: number;
  failed: number;
}> {
  await ensure_flow_schema();
  const rows = await query_rows<{ status: string; total: number }>(
    "SELECT status, COUNT(*) AS total FROM cms_flow_jobs GROUP BY status"
  );
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

export async function due_schedule_flows(at = now()): Promise<FlowRecord[]> {
  await ensure_flow_schema();
  const rows = await query_rows<Row>(
    `SELECT * FROM cms_flows
     WHERE status = 'active' AND "trigger" = 'schedule'
       AND (next_run_at IS NULL OR next_run_at <= ?)
     ORDER BY next_run_at ASC`,
    [at]
  );
  return rows.map(row_to_flow);
}

export async function set_flow_next_run(
  id: string,
  nextRunAt: number | null
): Promise<void> {
  await exec("UPDATE cms_flows SET next_run_at = ?, updated_at = ? WHERE id = ?", [
    nextRunAt,
    now(),
    id,
  ]);
}

export async function last_flow_run_at(
  flowId?: string
): Promise<number | null> {
  const row = flowId
    ? await query_row<{ at: number | null }>(
        "SELECT MAX(started_at) AS at FROM cms_flow_runs WHERE flow_id = ?",
        [flowId]
      )
    : await query_row<{ at: number | null }>(
        "SELECT MAX(started_at) AS at FROM cms_flow_runs"
      );
  return row?.at ?? null;
}

export async function flow_health_snapshot(): Promise<{
  active: number;
  inactive: number;
  schedules: number;
  queue: { pending: number; running: number; failed: number };
  last_run_at: number | null;
}> {
  await ensure_flow_schema();
  const counts = await query_rows<{ status: string; total: number }>(
    "SELECT status, COUNT(*) AS total FROM cms_flows GROUP BY status"
  );
  let active = 0;
  let inactive = 0;
  for (const row of counts) {
    if (row.status === "active") active = Number(row.total);
    if (row.status === "inactive") inactive = Number(row.total);
  }
  const schedules = await query_row<{ total: number }>(
    `SELECT COUNT(*) AS total FROM cms_flows WHERE status = 'active' AND "trigger" = 'schedule'`
  );
  return {
    active,
    inactive,
    schedules: Number(schedules?.total ?? 0),
    queue: await flow_queue_depth(),
    last_run_at: await last_flow_run_at(),
  };
}

export { public_flow };

