/**
 * Framework signals — loosely-coupled error/redirect carriers thrown by
 * controller code and translated by the dispatcher (HTTP status pages and
 * Next.js redirects).
 */

export class TgHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Thrown by redirect(); the dispatcher converts it into a real redirect. */
export class TgRedirectSignal {
  url: string;
  constructor(url: string) {
    this.url = url;
  }
}
