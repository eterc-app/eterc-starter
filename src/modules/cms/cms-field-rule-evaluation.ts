import type { CmsField, CmsFieldRuleGroup } from "./cms-types";

function is_empty(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

function values_equal(left: unknown, right: unknown): boolean {
  if (left === null || left === undefined || right === null || right === undefined) {
    return left === right;
  }
  if (typeof left === "boolean" || typeof right === "boolean") {
    return String(left).toLowerCase() === String(right).toLowerCase();
  }
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (
    String(left).trim() !== "" &&
    String(right).trim() !== "" &&
    Number.isFinite(leftNumber) &&
    Number.isFinite(rightNumber)
  ) {
    return leftNumber === rightNumber;
  }
  return String(left) === String(right);
}

function compare(left: unknown, right: unknown): number | null {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (
    !is_empty(left) &&
    !is_empty(right) &&
    Number.isFinite(leftNumber) &&
    Number.isFinite(rightNumber)
  ) {
    return leftNumber === rightNumber ? 0 : leftNumber < rightNumber ? -1 : 1;
  }
  if (is_empty(left) || is_empty(right)) return null;
  const leftText = String(left);
  const rightText = String(right);
  return leftText === rightText ? 0 : leftText < rightText ? -1 : 1;
}

export function field_rule_matches(
  rule: CmsFieldRuleGroup,
  values: Record<string, unknown>
): boolean {
  if (rule.conditions.length === 0) return false;
  const results = rule.conditions.map((condition) => {
    if ("conditions" in condition) return field_rule_matches(condition, values);
    const actual = values[condition.field];
    const expected = condition.value;
    switch (condition.operator) {
      case "_eq":
        return values_equal(actual, expected);
      case "_neq":
        return !values_equal(actual, expected);
      case "_contains":
        return !is_empty(actual) && String(actual).toLowerCase().includes(String(expected ?? "").toLowerCase());
      case "_not_contains":
        return is_empty(actual) || !String(actual).toLowerCase().includes(String(expected ?? "").toLowerCase());
      case "_starts_with":
        return !is_empty(actual) && String(actual).toLowerCase().startsWith(String(expected ?? "").toLowerCase());
      case "_ends_with":
        return !is_empty(actual) && String(actual).toLowerCase().endsWith(String(expected ?? "").toLowerCase());
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
      case "_null":
        return expected ? is_empty(actual) : !is_empty(actual);
      case "_in":
        return (Array.isArray(expected) ? expected : [expected]).some((item) => values_equal(actual, item));
    }
  });
  return rule.match === "all" ? results.every(Boolean) : results.some(Boolean);
}

export function effective_field(
  field: CmsField,
  values: Record<string, unknown>
): CmsField {
  const matching = field.conditions.filter((condition) =>
    field_rule_matches(condition.rule, values)
  );
  const condition = matching[matching.length - 1];
  if (!condition) return field;
  return {
    ...field,
    hidden: condition.hidden ?? field.hidden,
    required: condition.required ?? field.required,
    readonly: condition.readonly ?? field.readonly,
    clear_hidden_value_on_save: condition.clear_hidden_value_on_save ?? false,
  };
}
