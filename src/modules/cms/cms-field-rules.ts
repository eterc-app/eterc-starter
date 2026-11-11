import { EtHttpError } from "@/engine/signals";
import type {
  CmsField,
  CmsFieldCondition,
  CmsFieldRuleCondition,
  CmsFieldRuleGroup,
  CmsRuleOperator,
} from "./cms-types";
export { field_rule_matches, effective_field } from "./cms-field-rule-evaluation";

const FIELD_RULE_OPERATORS: CmsRuleOperator[] = [
  "_eq",
  "_neq",
  "_contains",
  "_not_contains",
  "_starts_with",
  "_ends_with",
  "_gt",
  "_gte",
  "_lt",
  "_lte",
  "_null",
  "_in",
];
const MAX_RULE_DEPTH = 6;
const MAX_RULES = 64;

function is_object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function is_rule_group(value: unknown): value is CmsFieldRuleGroup {
  return (
    is_object(value) &&
    (value.match === "all" || value.match === "any") &&
    Array.isArray(value.conditions)
  );
}

function contains_rule(rule: CmsFieldRuleGroup): boolean {
  return rule.conditions.some((condition) =>
    is_rule_group(condition)
      ? contains_rule(condition)
      : is_object(condition)
  );
}

export function empty_field_rule(): CmsFieldRuleGroup {
  return { match: "all", conditions: [] };
}

export function normalize_field_rule(
  value: unknown,
  fields: CmsField[],
  depth = 0,
  count = { value: 0 }
): CmsFieldRuleGroup {
  if (!is_rule_group(value)) {
    throw new EtHttpError(400, "A field rule must be an AND/OR rule group.");
  }
  if (depth > MAX_RULE_DEPTH) {
    throw new EtHttpError(400, `Field rules cannot exceed ${MAX_RULE_DEPTH} nested groups.`);
  }
  if (depth > 0 && value.conditions.length === 0) {
    throw new EtHttpError(400, "Nested field rule groups cannot be empty.");
  }
  const conditions = value.conditions.map((condition) => {
    count.value += 1;
    if (count.value > MAX_RULES) {
      throw new EtHttpError(400, `A field rule can contain at most ${MAX_RULES} rules.`);
    }
    if (is_rule_group(condition)) {
      return normalize_field_rule(condition, fields, depth + 1, count);
    }
    if (!is_object(condition)) {
      throw new EtHttpError(400, "Every field rule must be a condition or a group.");
    }
    const field = String(condition.field ?? "");
    if (!fields.some((candidate) => candidate.name === field)) {
      throw new EtHttpError(400, `Rule field '${field}' was not found in this collection.`);
    }
    const operator = String(condition.operator ?? "") as CmsRuleOperator;
    if (!FIELD_RULE_OPERATORS.includes(operator)) {
      throw new EtHttpError(400, `Unsupported field rule operator '${operator}'.`);
    }
    if (operator === "_in" && !Array.isArray(condition.value)) {
      throw new EtHttpError(400, `The '_in' operator for '${field}' requires a list of values.`);
    }
    if (operator === "_in" && (condition.value as unknown[]).length === 0) {
      throw new EtHttpError(400, `The '_in' operator for '${field}' needs at least one value.`);
    }
    if (operator === "_null" && typeof condition.value !== "boolean") {
      throw new EtHttpError(400, `The '_null' operator for '${field}' requires a true/false value.`);
    }
    return {
      field,
      operator,
      value: condition.value,
    } satisfies CmsFieldRuleCondition;
  });
  if (
    depth === 0 &&
    conditions.length > 0 &&
    !conditions.some((condition) =>
      "conditions" in condition ? contains_rule(condition) : true
    )
  ) {
    throw new EtHttpError(400, "A field rule needs at least one condition.");
  }
  return { match: value.match, conditions };
}

export function normalize_field_conditions(
  value: unknown,
  fields: CmsField[]
): CmsFieldCondition[] {
  if (!Array.isArray(value)) {
    throw new EtHttpError(400, "Field conditions must be a list.");
  }
  if (value.length > 32) {
    throw new EtHttpError(400, "A field can have at most 32 conditions.");
  }
  return value.map((entry, index) => {
    if (!is_object(entry)) {
      throw new EtHttpError(400, "Every field condition must be an object.");
    }
    const name = String(entry.name ?? "").trim();
    if (!name) throw new EtHttpError(400, `Condition ${index + 1} needs a name.`);
    if (!is_rule_group(entry.rule)) {
      throw new EtHttpError(400, `Condition '${name}' needs a rule group.`);
    }
    if (!contains_rule(entry.rule)) {
      throw new EtHttpError(400, `Condition '${name}' needs at least one rule.`);
    }
    const result: CmsFieldCondition = {
      name,
      rule: normalize_field_rule(entry.rule, fields),
    };
    for (const key of ["hidden", "required", "readonly", "clear_hidden_value_on_save"] as const) {
      if (entry[key] !== undefined) {
        if (typeof entry[key] !== "boolean") {
          throw new EtHttpError(400, `Condition '${name}' setting '${key}' must be true or false.`);
        }

        result[key] = entry[key];
      }
    }
    if (result.clear_hidden_value_on_save && result.hidden !== true) {
      throw new EtHttpError(400, `Condition '${name}' can clear its value only when hidden is enabled.`);
    }
    return result;
  });
}

export function remove_field_from_rule(
  rule: CmsFieldRuleGroup,
  fieldName: string
): CmsFieldRuleGroup {
  return {
    ...rule,
    conditions: rule.conditions
      .filter(
        (condition) =>
          "conditions" in condition || condition.field !== fieldName
      )
      .map((condition) =>
        "conditions" in condition
          ? remove_field_from_rule(condition, fieldName)
          : condition
      )
      .filter(
        (condition) =>
          !("conditions" in condition) || condition.conditions.length > 0
      ),
  };
}
