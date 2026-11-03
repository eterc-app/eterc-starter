export interface JobOptions {
  delaySeconds?: number;
  priority?: number;
  attempts?: number;
}

export type JobHandler<T = unknown> = (payload: T) => Promise<void>;

export interface IJobQueueProvider {
  readonly id: string;

  /** Enqueues a named job payload with options. Returns job ID. */
  enqueue<T = unknown>(jobName: string, payload: T, options?: JobOptions): Promise<string>;

  /** Registers a worker handler for a given job name. */
  registerHandler<T = unknown>(jobName: string, handler: JobHandler<T>): void;

  /** Optional runtime health probe used by /api/health. */
  healthCheck?(): Promise<{ ok: boolean; message: string }>;
}

