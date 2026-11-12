/**
 * In-memory Directus-style filter evaluation used by the condition operation.
 * The CMS query filter supports a similar subset; this evaluator also supports
 * nested logical groups and common comparison operators.
 */

function is_empty(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

function number(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function equals(left: unknown, right: unknown): boolean {
  const a = number(left);
  const b = number(right);
  if (a !== null && b !== null) return a === b;
  return String(left) === String(right);
}

function compare(left: unknown, right: unknown): number | null {
  const a = number(left);
  const b = number(right);
  if (a !== null && b !== null) return a === b ? 0 : a < b ? -1 : 1;
  if (is_empty(left) || is_empty(right)) return null;
  const x = String(left);
  const y = String(right);
  return x === y ? 0 : x < y ? -1 : 1;
}

function get_path(value: unknown, path: string): unknown {
  if (!path) return value;
  let current: unknown = value;
  for (const part of path.split(".")) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function matches_operator(
  actual: unknown,
  operator: string,
  expected: unknown
): boolean {
  switch (operator) {
    case "_eq":
      return equals(actual, expected);
    case "_neq":
      return !equals(actual, expected);
    case "_gt": {
      const order = compare(actual, expected);
      return order !== null && order > 0;
    }
    case "_gte": {
      const order = compare(actual, expected);
      return order !== null && order >= 0;
    }
    case "_lt": {
      const order = compare(actual, expected);
      return order !== null && order < 0;
    }
    case "_lte": {
      const order = compare(actual, expected);
      return order !== null && order <= 0;
    }
    case "_contains":
      return !is_empty(actual) &&
        String(actual).toLowerCase().includes(String(expected ?? "").toLowerCase());
    case "_not_contains":
      return is_empty(actual) ||
        !String(actual).toLowerCase().includes(String(expected ?? "").toLowerCase());
    case "_starts_with":
      return !is_empty(actual) &&
        String(actual).toLowerCase().startsWith(String(expected ?? "").toLowerCase());
    case "_ends_with":
      return !is_empty(actual) &&
        String(actual).toLowerCase().endsWith(String(expected ?? "").toLowerCase());
    case "_null":
      return Boolean(expected) ? is_empty(actual) : !is_empty(actual);
    case "_nnull":
      return !is_empty(actual);
    case "_empty":
      return is_empty(actual);
    case "_nempty":
      return !is_empty(actual);
    case "_in":
      return (Array.isArray(expected) ? expected : [expected]).some((value) =>
        equals(actual, value)
      );
    case "_nin":
      return !(Array.isArray(expected) ? expected : [expected]).some((value) =>
        equals(actual, value)
      );
    case "_between": {
      if (!Array.isArray(expected) || expected.length !== 2) return false;
      const lower = compare(actual, expected[0]);
      const upper = compare(actual, expected[1]);
      return lower !== null && upper !== null && lower >= 0 && upper <= 0;
    }
    default:
      return false;
  }
}

function matches_group(value: unknown, group: Record<string, unknown>): boolean {
  const match = group.match === "any" ? "any" : "all";
  const conditions = group.conditions;
  if (!Array.isArray(conditions)) return true;
  const results = conditions.map((condition) => {
    if (!condition || typeof condition !== "object" || Array.isArray(condition)) {
      return false;
    }
    const row = condition as Record<string, unknown>;
    if (typeof row.field === "string" && typeof row.operator === "string") {
      return matches_operator(
        get_path(value, row.field),
        row.operator,
        row.value
      );
    }
    return matches_filter(value, row);
  });
  return match === "any" ? results.some(Boolean) : results.every(Boolean);
}

export function matches_filter(value: unknown, filter: unknown): boolean {
  if (!filter) return true;
  if (typeof filter !== "object" || Array.isArray(filter)) return true;
  const group = filter as Record<string, unknown>;

  if (Array.isArray(group._and) || Array.isArray(group._or)) {
    const entries = (group._and ?? group._or) as unknown[];
    const results = entries.map((entry) => matches_filter(value, entry));
    return Array.isArray(group._or)
      ? results.some(Boolean)
      : results.every(Boolean);
  }
  if (Array.isArray(group.conditions)) {
    return matches_group(value, group);
  }

  for (const [field, condition] of Object.entries(group)) {
    if (field === "match" || field === "conditions") continue;
    const actual = get_path(value, field);
    if (condition === null) {
      if (!is_empty(actual)) return false;
      continue;
    }
    if (Array.isArray(condition)) {
      if (!condition.some((entry) => equals(actual, entry))) return false;
      continue;
    }
    if (typeof condition === "object") {
      for (const [operator, expected] of Object.entries(
        condition as Record<string, unknown>
      )) {
        if (!matches_operator(actual, operator, expected)) return false;
      }
      continue;
    }
    if (!equals(actual, condition)) return false;
  }
  return true;
}
