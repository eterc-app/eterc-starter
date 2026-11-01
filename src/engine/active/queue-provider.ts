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

    if (handler) {
      if (options?.delaySeconds && options.delaySeconds > 0) {
        setTimeout(() => {
          void handler(payload).catch((err) => {
            console.error(`[Queue] Job ${jobName} (${jobId}) failed:`, err);
          });
        }, options.delaySeconds * 1000);
      } else {
        queueMicrotask(() => {
          void handler(payload).catch((err) => {
            console.error(`[Queue] Job ${jobName} (${jobId}) failed:`, err);
          });
        });
      }
    } else {
      console.warn(`[Queue] No handler registered for job "${jobName}" (${jobId})`);
    }

    return jobId;
  }
}

export const activeQueueProvider: IJobQueueProvider = new ImmediateJobQueueProvider();

