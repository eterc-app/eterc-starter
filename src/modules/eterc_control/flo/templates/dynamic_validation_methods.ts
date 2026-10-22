/**
 * Dynamic validation-method template.
 */
import type { TemplateContext } from "../FloTypes";
import { js } from "./helpers";

function needsRule(
  data: TemplateContext,
  property_type: string,
  rule: string
): boolean {
  return data.posted_properties.some(
    (property) =>
      property.property_type === property_type &&
      property.validation_rules.includes(rule)
  );
}

function buildDateValidationMethod(direction: "past" | "future"): string {
  const comparison = direction === "past" ? ">=" : "<=";
  const message =
    direction === "past"
      ? "The date must be in the past."
      : "The date must be in the future.";

  return [
    "  /**",
    `   * Validates that a date is in the ${direction} (strictly ${
      direction === "past" ? "before today" : "after today"
    }).`,
    "   *",
    "   * @param string $date The date value (YYYY-MM-DD).",
    "   * @return string | true Error message if validation fails, true if passes.",
    "   */",
    `  validate_date_in_${direction}(date: string): string | true {`,
    '    if (date === "") return true;',
    "",
    '    const input = new Date(date + "T00:00:00");',
    "    const today = new Date();",
    "    today.setHours(0, 0, 0, 0);",
    "",
    "    if (Number.isNaN(input.getTime())) {",
    '      return "The date must be a valid date.";',
    "    }",
    "",
    `    if (input ${comparison} today) {`,
    `      return ${js(message)};`,
    "    }",
    "",
    "    return true;",
    "  }",
  ].join("\n");
}

function buildDatetimeValidationMethod(direction: "past" | "future"): string {
  const comparison = direction === "past" ? ">=" : "<=";
  const message =
    direction === "past"
      ? "The datetime must be in the past."
      : "The datetime must be in the future.";

  return [
    "  /**",
    `   * Validates that a datetime is in the ${direction} (strictly ${
      direction === "past" ? "before now" : "after now"
    }).`,
    "   *",
    "   * @param string $datetime The datetime value (YYYY-MM-DDTHH:MM).",
    "   * @return string | true Error message if validation fails, true if passes.",
    "   */",
    `  validate_datetime_in_${direction}(datetime: string): string | true {`,
    '    if (datetime === "") return true;',
    "",
    "    const input = new Date(datetime);",
    "    const now = new Date();",
    "",
    "    if (Number.isNaN(input.getTime())) {",
    '      return "The datetime must be a valid datetime.";',
    "    }",
    "",
    `    if (input ${comparison} now) {`,
    `      return ${js(message)};`,
    "    }",
    "",
    "    return true;",
    "  }",
  ].join("\n");
}

function buildTimeValidationMethod(direction: "past" | "future"): string {
  const comparison = direction === "past" ? ">=" : "<=";
  const message =
    direction === "past"
      ? "The time must be in the past."
      : "The time must be in the future.";

  return [
    "  /**",
    `   * Validates that a time is in the ${direction} (strictly ${
      direction === "past" ? "before now" : "after now"
    }).`,
    "   *",
    "   * @param string $time The time value (HH:MM or HH:MM:SS).",
    "   * @return string | true Error message if validation fails, true if passes.",
    "   */",
    `  validate_time_in_${direction}(time: string): string | true {`,
    '    if (time === "") return true;',
    "",
    '    const match = time.match(/^(\\d{2}):(\\d{2})(?::(\\d{2}))?$/);',
    "    if (!match) {",
    '      return "The time must be a valid time.";',
    "    }",
    "",
    "    const input = new Date();",
    "    input.setHours(Number(match[1]), Number(match[2]), Number(match[3] ?? 0), 0);",
    "    const now = new Date();",
    "",
    `    if (input ${comparison} now) {`,
    `      return ${js(message)};`,
    "    }",
    "",
    "    return true;",
    "  }",
  ].join("\n");
}

/** Build the model validation methods required by the context. */
export function buildValidationMethods(data: TemplateContext): string {
  const methods: string[] = [];

  if (needsRule(data, "date", "in the past")) {
    methods.push(buildDateValidationMethod("past"));
  }
  if (needsRule(data, "date", "in the future")) {
    methods.push(buildDateValidationMethod("future"));
  }
  if (needsRule(data, "date and time", "in the past")) {
    methods.push(buildDatetimeValidationMethod("past"));
  }
  if (needsRule(data, "date and time", "in the future")) {
    methods.push(buildDatetimeValidationMethod("future"));
  }
  if (needsRule(data, "time", "in the past")) {
    methods.push(buildTimeValidationMethod("past"));
  }
  if (needsRule(data, "time", "in the future")) {
    methods.push(buildTimeValidationMethod("future"));
  }

  return methods.join("\n\n");
}
