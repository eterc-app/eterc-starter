import { FlowTemplateError } from "./flow-errors";

const EXPRESSION = /\{\{\s*([^{}]+?)\s*\}\}/g;
const SINGLE_EXPRESSION = /^\s*\{\{\s*([^{}]+?)\s*\}\}\s*$/;

interface PathToken {
  value: string;
  index: boolean;
}

function tokenize(path: string): PathToken[] {
  const tokens: PathToken[] = [];
  const pattern = /([^.[\]]+)|\[(\d+)\]|\["([^"]*)"\]|\['([^']*)'\]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(path)) !== null) {
    if (match[1] !== undefined) {
      const value = match[1].trim();
      if (value) tokens.push({ value, index: false });
    } else {
      tokens.push({
        value: match[2] ?? match[3] ?? match[4] ?? "",
        index: match[2] !== undefined,
      });
    }
  }
  return tokens;
}

export function read_path(
  context: Record<string, unknown>,
  rawPath: string
): unknown {
  const path = rawPath.trim();
  if (!path) return undefined;
  const tokens = tokenize(path);
  if (tokens.length === 0) return undefined;

  let current: unknown = context;
  for (const token of tokens) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(token.value);
      if (!Number.isSafeInteger(index)) return undefined;
      current = current[index];
      continue;
    }
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[token.value];
  }
  return current;
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function resolve_string(
  value: string,
  context: Record<string, unknown>,
  path = ""
): unknown {
  const single = value.match(SINGLE_EXPRESSION);
  if (single) {
    const resolved = read_path(context, single[1]);
    if (resolved === undefined) return undefined;
    return resolved;
  }

  return value.replace(EXPRESSION, (_match, expression: string) => {
    const resolved = read_path(context, expression);
    if (resolved === undefined) {
      throw new FlowTemplateError(
        `Template '${expression}' does not resolve to a value.`,
        path || expression
      );
    }
    return stringify(resolved);
  });
}

/**
 * Recursively resolve templates in JSON-like values.
 *
 * A string that is exactly one template keeps the resolved value's type, so
 * numbers and objects survive. Mixed strings are interpolated as text.
 */
export function resolve_templates(
  value: unknown,
  context: Record<string, unknown>,
  path = "",
  depth = 0
): unknown {
  if (depth > 20) {
    throw new FlowTemplateError("Template nesting is too deep.", path);
  }
  if (typeof value === "string") {
    if (!value.includes("{{")) return value;
    return resolve_string(value, context, path);
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      resolve_templates(entry, context, `${path}[${index}]`, depth + 1)
    );
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      result[key] = resolve_templates(
        entry,
        context,
        path ? `${path}.${key}` : key,
        depth + 1
      );
    }
    return result;
  }
  return value;
}

export function has_template(value: unknown): boolean {
  if (typeof value === "string") return value.includes("{{");
  if (Array.isArray(value)) return value.some(has_template);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(has_template);
  }
  return false;
}
