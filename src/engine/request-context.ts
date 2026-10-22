import { AsyncLocalStorage } from "node:async_hooks";

export interface EtUploadedFile {
  fieldName: string;
  originalName: string;
  mimeType: string;
  size: number;
  /** Absolute path of the saved temp file, if persisted by the platform. */
  bytes: Buffer | null;
}

export interface EtRequest {
  /** URL segments. segment(1) === segments[0] (module), segment(2) === segments[1] (method). */
  segments: string[];
  httpMethod: "GET" | "POST" | string;
  /** Raw form data for POST requests (server actions / API route). */
  formData?: FormData;
  /** Parsed JSON body, when the client posted JSON. */
  json?: unknown;
  /** Full request URL. */
  url: string;
  pathname: string;
  /** Query string parameters. */
  query: Record<string, string | string[]>;
  /** Incoming headers. */
  headers: Headers;
  /** Cookie values captured at dispatch time. */
  cookies: Record<string, string>;
  /** True when the request originated from fetch()/XHR (mirrors JS detection). */
  isAjax: boolean;
  /** True when the context runs inside a server action or route handler (can set cookies). */
  canSetCookies: boolean;
  /** Response cookies collected during the request (set by handlers). */
  responseCookies: Array<{
    name: string;
    value: string;
    options?: Record<string, unknown>;
  }>;
  /** Flash messages set during this request (for immediate action replies). */
  flashBuffer: string[];
}

const store = new AsyncLocalStorage<EtRequest>();

export function run_with_context<T>(request: EtRequest, fn: () => T): T {
  return store.run(request, fn);
}

export function get_context(): EtRequest {
  const ctx = store.getStore();
  if (!ctx) {
    throw new Error(
      "Eterc request context is not available. This helper can only be used while handling a request (controllers, models, actions)."
    );
  }
  return ctx;
}

export function has_context(): boolean {
  return store.getStore() !== undefined;
}

/** segment(n) — 1-based URL segment with optional type cast. */
export function segment(n: number, varType?: string): string | number | boolean | null {
  const ctx = get_context();
  let value: string | undefined = ctx.segments[n - 1];

  // Strip query strings that may have been glued onto a segment.
  if (value !== undefined) {
    value = value.split("?")[0];
  } else {
    value = "";
  }

  if (varType === undefined || varType === null) return value;

  switch (varType) {
    case "int":
    case "integer": {
      const parsed = parseInt(value, 10);
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    case "float":
    case "double": {
      const parsed = parseFloat(value);
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    case "bool":
    case "boolean":
      return value !== "" && value !== "0" && value.toLowerCase() !== "false";
    case "string":
      return String(value);
    case "null":
      return null;
    default:
      return value;
  }
}

export function current_url(): string {
  return get_context().url;
}

export function previous_url(): string {
  return get_context().headers.get("referer") ?? "";
}

export function remove_query_string(url: string): string {
  return url.split("?")[0];
}

export function get_num_segments(): number {
  return get_context().segments.length;
}

export function get_last_segment(): string {
  const ctx = get_context();
  if (ctx.segments.length === 0) return "";
  return ctx.segments[ctx.segments.length - 1].split("?")[0];
}

/** True when the request was made by fetch()/XHR rather than navigation. */
export function from_eterc_mx(): boolean {
  const ctx = get_context();
  return (
    ctx.isAjax ||
    ctx.headers.get("Eterc-MX-Request") === "true"
  );
}
