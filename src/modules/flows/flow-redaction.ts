const SENSITIVE_KEY =
  /(secret|password|passwd|token|authorization|cookie|api[_-]?key|private[_-]?key)/i;

const MAX_STRING = 4_000;
const MAX_JSON = 24_000;

/** Keep logs useful without storing credentials or unbounded payloads. */
export function redact_value(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[depth limit]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (value.length <= MAX_STRING) return value;
    return `${value.slice(0, MAX_STRING)}… [truncated]`;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((entry) => redact_value(entry, depth + 1));
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : redact_value(entry, depth + 1);
    }
    return result;
  }
  return String(value);
}

export function safe_stringify(value: unknown, fallback = "null"): string {
  try {
    const text = JSON.stringify(redact_value(value));
    if (text === undefined) return fallback;
    if (text.length <= MAX_JSON) return text;
    return JSON.stringify({
      truncated: true,
      preview: text.slice(0, MAX_JSON),
    });
  } catch {
    return fallback;
  }
}

export function safe_parse(value: unknown, fallback: unknown = null): unknown {
  if (typeof value !== "string") return value ?? fallback;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return fallback;
  }
}

export function truncate_text(value: string, max = 1_000): string {
  return value.length <= max ? value : `${value.slice(0, max)}… [truncated]`;
}
