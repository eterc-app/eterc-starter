import {
  add_flow_run_step,
  create_flow_run,
  finish_flow_run,
  get_flow_with_operations,
  touch_flow_run,
} from "./flow-store";
import {
  build_flow_context,
  sync_context_outputs,
} from "./flow-context";
import {
  FlowError,
  FlowRejectError,
  flow_error_message,
} from "./flow-errors";
import { run_operation } from "./operations";
import type {
  FlowOperationRecord,
  FlowPrincipal,
  FlowRecord,
  FlowRunResult,
  FlowRunStatus,
  FlowRunStepRecord,
  FlowTriggerPayload,
} from "./flow-types";

const MAX_STEPS = 100;

export interface RunFlowOptions {
  flow: FlowRecord;
  trigger: FlowTriggerPayload;
  principal: FlowPrincipal;
  parent_run_id?: string | null;
  depth?: number;
  allow_inactive?: boolean;
  timeout_ms?: number;
}

function find_root(operations: FlowOperationRecord[], explicit: string | null): string | null {
  if (explicit) return explicit;
  const targeted = new Set(
    operations.flatMap((operation) =>
      [operation.resolve, operation.reject].filter((value): value is string => Boolean(value))
    )
  );
  return (
    operations.find((operation) => !targeted.has(operation.id))?.id ??
    operations[0]?.id ??
    null
  );
}

function timeout_from_env(): number {
  const parsed = Number(process.env.FLOW_RUN_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed >= 1_000 ? parsed : 30_000;
}

/**
 * Execute one flow graph and persist a readable run log.
 *
 * Errors are recorded instead of thrown so callers (webhook, manual, scheduler)
 * can decide how to respond. Configuration errors before a run starts still
 * throw.
 */
export async function run_flow(options: RunFlowOptions): Promise<FlowRunResult> {
  const loaded = get_flow_with_operations(options.flow.id);
  if (!loaded) throw new Error("Flow not found.");
  if (loaded.status !== "active" && !options.allow_inactive) {
    throw new Error(`The flow '${loaded.name}' is not active.`);
  }

  const depth = options.depth ?? 0;
  if (depth > 5) throw new Error("Flows can be nested at most five levels deep.");

  const timeout = options.timeout_ms ?? timeout_from_env();
  const startedAt = Date.now();
  const runId = create_flow_run({
    flow: loaded,
    trigger: options.trigger.type,
    principal: options.principal,
    payload: options.trigger,
    parent_run_id: options.parent_run_id ?? null,
  });

  const outputs: Record<string, unknown> = {};
  const steps: FlowRunStepRecord[] = [];
  const context = build_flow_context({
    trigger: options.trigger,
    principal: options.principal,
    flow: loaded,
    outputs,
  });
  context.$last =
    options.trigger.payload ?? options.trigger.body ?? options.trigger ?? null;

  let status: FlowRunStatus = "success";
  let errorMessage: string | null = null;
  let current = find_root(loaded.operations, loaded.operation);
  let path: FlowRunStepRecord["path"] = "root";
  let sort = 0;
  let sawReject = false;

  if (!current) {
    status = "error";
    errorMessage = "This flow has no operations to run.";
  }

  try {
    while (current && sort < MAX_STEPS) {
      if (Date.now() - startedAt > timeout) {
        status = "timeout";
        errorMessage = "The flow exceeded its time limit.";
        break;
      }
      const operation = loaded.operations.find((entry) => entry.id === current);
      if (!operation) {
        status = "error";
        errorMessage = "The flow references an operation that no longer exists.";
        break;
      }

      const stepStarted = Date.now();
      let stepStatus: FlowRunStepRecord["status"] = "success";
      let stepOutput: unknown = null;
      let stepError: string | null = null;
      let next: "resolve" | "reject" = "resolve";
      let step_failed = false;

      try {
        const result = await run_operation(operation.type, operation.options, context, {
          flow: loaded,
          operation,
          run_id: runId,
          depth,
          parent_run_id: options.parent_run_id ?? null,
          principal: options.principal,
        });
        stepOutput = result.output ?? null;
        if (result.next === "reject") {
          next = "reject";
          stepStatus = "rejected";
          sawReject = true;
        }
        outputs[operation.key] = stepOutput;
        context[operation.key] = stepOutput;
        sync_context_outputs(context, outputs);
      } catch (error) {
        stepError = flow_error_message(error);
        stepOutput = {
          error: stepError,
          code: error instanceof FlowError ? error.code : undefined,
        };
        stepStatus = error instanceof FlowRejectError ? "rejected" : "error";
        sawReject = true;
        if (error instanceof FlowRejectError) {
          next = "reject";
        } else if (operation.reject) {
          next = "reject";
        } else {
          status = "error";
          errorMessage = `${operation.name}: ${stepError}`;
          step_failed = true;
        }
      }

      const stepFinished = Date.now();
      const step = add_flow_run_step(runId, {
        operation_id: operation.id,
        key: operation.key,
        type: operation.type,
        path,
        status: stepStatus,
        started_at: stepStarted,
        finished_at: stepFinished,
        duration_ms: stepFinished - stepStarted,
        input: operation.options,
        output: stepOutput,
        error: stepError,
        sort,
      });
      steps.push(step);
      sort += 1;

      if (step_failed) break;

      const nextId =
        next === "reject" ? operation.reject : operation.resolve;
      if (!nextId) {
        if (next === "reject") {
          status = "rejected";
          if (!errorMessage) {
            errorMessage =
              stepError ??
              (stepStatus === "rejected"
                ? `${operation.name} rejected the flow.`
                : null);
          }
        }
        current = null;
        break;
      }
      path = next;
      current = nextId;
    }

    if (sort >= MAX_STEPS && current) {
      status = "error";
      errorMessage = "The flow exceeded the maximum number of steps.";
    }
    if (status === "success" && sawReject) status = "rejected";
  } catch (error) {
    status = "error";
    errorMessage = flow_error_message(error);
  }

  const duration = Date.now() - startedAt;
  const result: FlowRunResult = {
    run_id: runId,
    flow_id: loaded.id,
    status,
    result: context.$last ?? null,
    outputs,
    error: errorMessage
      ? { message: errorMessage, code: status === "rejected" ? "FLOW_REJECT" : undefined }
      : null,
    duration_ms: duration,
    steps,
  };

  finish_flow_run(runId, {
    status,
    output: {
      result: result.result,
      outputs,
      error: errorMessage,
    },
    error: errorMessage,
    duration_ms: duration,
  });
  touch_flow_run(runId);
  return result;
}
