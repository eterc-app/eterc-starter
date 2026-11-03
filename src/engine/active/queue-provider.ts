import type { IJobQueueProvider, JobHandler, JobOptions } from "../contracts/queue";

export class ImmediateJobQueueProvider implements IJobQueueProvider {
  readonly id = "immediate";
  private handlers = new Map<string, JobHandler>();

  registerHandler<T = unknown>(jobName: string, handler: JobHandler<T>): void {
    this.handlers.set(jobName, handler as JobHandler);
  }

  async enqueue<T = unknown>(jobName: string, payload: T, options?: JobOptions): Promise<string> {
    const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const handler = this.handlers.get(jobName);
    if (!handler) return jobId;

    const run = () => {
      void handler(payload).catch((error) => {
        console.error(`[Queue] Job ${jobName} (${jobId}) failed:`, error);
      });
    };

    if (options?.delaySeconds && options.delaySeconds > 0) {
      setTimeout(run, options.delaySeconds * 1000);
    } else {
      queueMicrotask(run);
    }
    return jobId;
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    return { ok: true, message: "Immediate job queue is available." };
  }
}

export const activeQueueProvider: IJobQueueProvider = new ImmediateJobQueueProvider();
