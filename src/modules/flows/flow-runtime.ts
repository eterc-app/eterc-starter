import { activeDbAdapter } from "@/engine/active/db-adapter";
import { delete_old_flow_runs, flow_health_snapshot } from "./flow-store";
import { drain_flow_queue } from "./flow-queue";
import { tick_schedules } from "./flow-scheduler";
import type { FlowRuntimeMode } from "./flow-types";

function bool_env(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return !["0", "false", "off", "no"].includes(value.toLowerCase());
}

export function flows_enabled(): boolean {
  return bool_env(process.env.FLOWS_ENABLED, true);
}

export function flow_runtime_mode(): FlowRuntimeMode {
  const configured = (process.env.FLOW_RUNTIME ?? "").toLowerCase();
  const mode =
    configured === "worker" || configured === "serverless"
      ? configured
      : "embedded";
  const baseUrl =
    process.env.FLOW_PUBLIC_URL ??
    process.env.ETERC_PUBLIC_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000";
  const retention = Number(process.env.FLOW_LOGS_RETENTION_DAYS);
  return {
    mode,
    enabled: flows_enabled(),
    scheduler: mode === "embedded",
    queue: true,
    base_url: baseUrl.replace(/\/$/, ""),
    retention_days:
      Number.isFinite(retention) && retention > 0 ? Math.floor(retention) : 90,
    missing:
      process.env.VERCEL === "1" && mode !== "serverless"
        ? ["FLOW_RUNTIME=serverless on Vercel"]
        : [],
  };
}

export function flow_health(): {
  ok: boolean;
  runtime: FlowRuntimeMode;
  database: { ok: boolean; message: string };
  flows: ReturnType<typeof flow_health_snapshot>;
  scheduler: { running: boolean; last_tick_at: number | null };
  checks: Array<{ name: string; ok: boolean; message: string }>;
} {
  const runtime = flow_runtime_mode();
  const flows = flow_health_snapshot();
  const db = activeDbAdapter;
  const checks: Array<{ name: string; ok: boolean; message: string }> = [
    {
      name: "database",
      ok: db.dialect === "sqlite",
      message:
        db.dialect === "sqlite"
          ? "SQLite is available."
          : `The ${db.dialect} adapter is configured.`,
    },
    {
      name: "runtime",
      ok: runtime.enabled && runtime.missing.length === 0,
      message: !runtime.enabled
        ? "Flows are disabled by FLOWS_ENABLED."
        : runtime.missing.length > 0
          ? `Missing: ${runtime.missing.join(", ")}`
          : `${runtime.mode} runtime`,
    },
    {
      name: "queue",
      ok: flows.queue.failed === 0,
      message:
        flows.queue.failed === 0
          ? `${flows.queue.pending} pending, ${flows.queue.running} running`
          : `${flows.queue.failed} failed jobs need attention`,
    },
  ];
  return {
    ok: checks.every((check) => check.ok),
    runtime,
    database: { ok: db.dialect === "sqlite", message: "SQLite connection" },
    flows,
    scheduler: {
      running: Boolean(
        (globalThis as unknown as { __etFlowScheduler?: unknown }).__etFlowScheduler
      ),
      last_tick_at: scheduler_last_tick,
    },
    checks,
  };
}

let scheduler_last_tick: number | null = null;
let last_cleanup = 0;

async function tick(): Promise<void> {
  if (!flows_enabled()) return;
  scheduler_last_tick = Math.floor(Date.now() / 1000);
  try {
    tick_schedules();
    await drain_flow_queue(10);
    if (Date.now() - last_cleanup > 60 * 60 * 1000) {
      last_cleanup = Date.now();
      const retention = flow_runtime_mode().retention_days;
      delete_old_flow_runs(retention);
    }
  } catch (error) {
    console.error("[eterc] flow scheduler tick failed", error);
  }
}

/**
 * Start the in-process scheduler once per Node process. Disabled on Vercel and
 * when FLOW_RUNTIME is not `embedded`.
 */
export function start_flow_scheduler(): void {
  if (process.env.NEXT_RUNTIME === "edge") return;
  if (!flows_enabled()) return;
  if (flow_runtime_mode().mode !== "embedded") return;
  const global = globalThis as unknown as {
    __etFlowScheduler?: ReturnType<typeof setInterval>;
    __etFlowSchedulerStarted?: boolean;
  };
  if (global.__etFlowSchedulerStarted) return;
  global.__etFlowSchedulerStarted = true;
  global.__etFlowScheduler = setInterval(() => {
    void tick();
  }, 60_000);
  // Do not hold the process open just for the scheduler.
  (global.__etFlowScheduler as unknown as { unref?: () => void }).unref?.();
  setTimeout(() => {
    void tick();
  }, 4_000).unref?.();
}

/** Called by instrumentation.ts after the server starts. */
export async function boot_flow_runtime(): Promise<void> {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (!flows_enabled()) return;
  start_flow_scheduler();
}
