export type FlowErrorCode =
  | "FLOW_CONFIG"
  | "FLOW_REJECT"
  | "FLOW_TIMEOUT"
  | "FLOW_ABORT"
  | "FLOW_TEMPLATE"
  | "FLOW_OPERATION";

export class FlowError extends Error {
  readonly code: FlowErrorCode;
  readonly operation: string | null;
  readonly details: unknown;

  constructor(
    code: FlowErrorCode,
    message: string,
    options: { operation?: string | null; details?: unknown } = {}
  ) {
    super(message);
    this.name = "FlowError";
    this.code = code;
    this.operation = options.operation ?? null;
    this.details = options.details;
  }
}

export class FlowConfigError extends FlowError {
  constructor(message: string, options: { operation?: string | null } = {}) {
    super("FLOW_CONFIG", message, options);
    this.name = "FlowConfigError";
  }
}

export class FlowRejectError extends FlowError {
  constructor(message: string, options: { operation?: string | null } = {}) {
    super("FLOW_REJECT", message, options);
    this.name = "FlowRejectError";
  }
}

export class FlowTimeoutError extends FlowError {
  constructor(message = "The flow exceeded its time limit.") {
    super("FLOW_TIMEOUT", message);
    this.name = "FlowTimeoutError";
  }
}

export class FlowAbortError extends FlowError {
  constructor(message = "The flow was cancelled.") {
    super("FLOW_ABORT", message);
    this.name = "FlowAbortError";
  }
}

export class FlowTemplateError extends FlowError {
  constructor(
    message: string,
    readonly path: string,
    options: { operation?: string | null } = {}
  ) {
    super("FLOW_TEMPLATE", message, options);
    this.name = "FlowTemplateError";
  }
}

export function flow_error_message(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

export function flow_error_code(error: unknown): string | undefined {
  return error instanceof FlowError ? error.code : undefined;
}
