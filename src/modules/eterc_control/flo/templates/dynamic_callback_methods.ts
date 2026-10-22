/**
 * Dynamic date/time callback methods — port of
 * site_builder/views/dynamic_callback_methods.php.
 *
 * The generated controller delegates to the generated model's
 * `validate_*_in_*` methods; direct URL access is rejected with the same 403
 * signal the rest of the port uses.
 */

import type { TemplateContext } from "../FloTypes";

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

function buildCallbackMethod(
  method_name: string,
  parameter_name: string,
  model_method_suffix: string,
  direction: "past" | "future"
): string {
  const description =
    parameter_name === "date"
      ? direction === "past"
        ? "a date is in the past (strictly before today)"
        : "a date is in the future (strictly after today)"
      : parameter_name === "datetime"
        ? direction === "past"
          ? "a datetime is in the past (strictly before now)"
          : "a datetime is in the future (strictly after now)"
        : direction === "past"
          ? "a time is in the past (strictly before now)"
          : "a time is in the future (strictly after now)";

  const format_hint =
    parameter_name === "date"
      ? "YYYY-MM-DD"
      : parameter_name === "datetime"
        ? "YYYY-MM-DDTHH:MM"
        : "HH:MM or HH:MM:SS";

  const lines: string[] = [];
  lines.push("  /**");
  lines.push(`   * Validates that ${description}.`);
  lines.push("   *");
  lines.push(
    `   * @param string $${parameter_name} The ${parameter_name} value (${format_hint}).`
  );
  lines.push(
    "   * @return string|true Error message if validation fails, true if passes."
  );
  lines.push("   */");
  lines.push(`  ${method_name}(${parameter_name}: string): string | true {`);
  lines.push("    if (!from_eterc_mx()) {");
  lines.push(
    '      throw new EtHttpError(403, "403 Forbidden - Direct URL access not permitted");'
  );
  lines.push("    }");
  lines.push(
    `    return this.module_model().validate_${model_method_suffix}_in_${direction}(${parameter_name});`
  );
  lines.push("  }");
  return lines.join("\n");
}

/** Build the callback methods required by the context. */
export function buildCallbackMethods(data: TemplateContext): string {
  const methods: string[] = [];

  if (needsRule(data, "date", "in the past")) {
    methods.push(
      buildCallbackMethod("date_in_past", "date", "date", "past")
    );
  }
  if (needsRule(data, "date", "in the future")) {
    methods.push(
      buildCallbackMethod("date_in_future", "date", "date", "future")
    );
  }
  if (needsRule(data, "date and time", "in the past")) {
    methods.push(
      buildCallbackMethod(
        "datetime_in_past",
        "datetime",
        "datetime",
        "past"
      )
    );
  }
  if (needsRule(data, "date and time", "in the future")) {
    methods.push(
      buildCallbackMethod(
        "datetime_in_future",
        "datetime",
        "datetime",
        "future"
      )
    );
  }
  if (needsRule(data, "time", "in the past")) {
    methods.push(
      buildCallbackMethod("time_in_past", "time", "time", "past")
    );
  }
  if (needsRule(data, "time", "in the future")) {
    methods.push(
      buildCallbackMethod("time_in_future", "time", "time", "future")
    );
  }

  return methods.join("\n\n");
}
