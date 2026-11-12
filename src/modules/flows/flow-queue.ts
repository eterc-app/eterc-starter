import {
  claim_flow_job,
  complete_flow_job,
  enqueue_flow_job,
  fail_flow_job,
  get_flow,
  recover_stale_flow_jobs,
} from "./flow-store";
import { run_flow } from "./flow-runner";
import { SYSTEM_PRINCIPAL } from "./flow-principal";
import type { FlowTrigger, FlowTriggerPayload } from "./flow-types";

const WORKER_ID = `embedded-${process.pid}`;

export function enqueue_flow_trigger(
  flowId: string,
  trigger: FlowTrigger,
  payload: FlowTriggerPayload,
  runAt?: number
): string {
  return enqueue_flow_job({
    flow_id: flowId,
    trigger,
    payload,
    run_at: runAt,
  });
}

/**
 * Execute pending jobs. Safe to call from cron, after an action event, or the
 * embedded timer. A single SQLite claim prevents two workers taking one job.
 */
export async function drain_flow_queue(limit = 15): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  recover_stale_flow_jobs();
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (let index = 0; index < limit; index += 1) {
    const job = claim_flow_job(WORKER_ID);
    if (!job) break;
    processed += 1;

    const flow = get_flow(job.flow_id);
    if (!flow || flow.status !== "active") {
      fail_flow_job(job, "The flow is missing or inactive.");
      failed += 1;
      continue;
    }

    const payload =
      job.payload && typeof job.payload === "object"
        ? (job.payload as FlowTriggerPayload)
        : ({ type: job.trigger } as FlowTriggerPayload);
    payload.type = job.trigger;

    try {
      const result = await run_flow({
        flow,
        trigger: payload,
        principal: SYSTEM_PRINCIPAL,
      });
      if (result.status === "success" || result.status === "rejected") {
        complete_flow_job(job.id);
        succeeded += 1;
      } else {
        fail_flow_job(job, result.error?.message ?? `Run ended as ${result.status}.`);
        failed += 1;
      }
    } catch (error) {
      fail_flow_job(
        job,
        error instanceof Error ? error.message : "The queued run failed."
      );
      failed += 1;
    }
  }

  return { processed, succeeded, failed };
}
