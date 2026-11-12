import { next_cron_seconds } from "./flow-cron";
import { due_schedule_flows, set_flow_next_run } from "./flow-store";
import { enqueue_flow_trigger } from "./flow-queue";

export interface ScheduleTickResult {
  due: number;
  enqueued: number;
  errors: string[];
}

/**
 * Enqueue every due schedule and advance its next run before draining.
 * Advancing first keeps a slow flow from being enqueued twice on the next tick.
 */
export function tick_schedules(at = Math.floor(Date.now() / 1000)): ScheduleTickResult {
  const flows = due_schedule_flows(at);
  const errors: string[] = [];
  let enqueued = 0;

  for (const flow of flows) {
    const expression = String(flow.options.interval ?? "");
    const next = next_cron_seconds(expression, new Date(at * 1000));
    try {
      enqueue_flow_trigger(flow.id, "schedule", {
        type: "schedule",
        body: { scheduled_at: at },
      });
      enqueued += 1;
    } catch (error) {
      errors.push(
        `${flow.name}: ${error instanceof Error ? error.message : "could not enqueue"}`
      );
    }
    set_flow_next_run(flow.id, next);
  }

  return { due: flows.length, enqueued, errors };
}
