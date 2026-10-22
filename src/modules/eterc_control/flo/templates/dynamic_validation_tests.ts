/**
 * Dynamic validation-test template.
 */
import type { PostedProperty, TemplateContext } from "../FloTypes";
import { js } from "./helpers";

function buildValidationTestRow(property: PostedProperty): string {
  const form_field_name = property.form_field_name;
  const validation_label = property.property_name.trim().toLowerCase();
  let rules = [...property.validation_rules];

  switch (property.property_type) {
    case "varchar":
    case "textarea":
      break;
    case "int":
      rules = ["integer", ...rules];
      break;
    case "decimal":
      rules = ["decimal", ...rules];
      break;
    case "boolean":
      return "";
    case "email":
      rules = ["valid_email", ...rules];
      break;
    case "date":
      rules = ["valid_date", ...rules];
      break;
    case "time":
      rules = ["valid_time", ...rules];
      break;
    case "date and time":
      rules = ["valid_datetime_local", ...rules];
      break;
    default:
      return "";
  }

  if (rules.length < 1) return "";

  let validation_tests_str = rules.join("|");
  validation_tests_str = validation_tests_str
    .replace(/min length\[/g, "min_length[")
    .replace(/max length\[/g, "max_length[")
    .replace(/greater than\[/g, "greater_than[")
    .replace(/less than\[/g, "less_than[");

  if (property.property_type === "date and time") {
    validation_tests_str = validation_tests_str
      .replace(/in the past/g, "callback_datetime_in_past")
      .replace(/in the future/g, "callback_datetime_in_future");
  } else if (property.property_type === "time") {
    validation_tests_str = validation_tests_str
      .replace(/in the past/g, "callback_time_in_past")
      .replace(/in the future/g, "callback_time_in_future");
  } else {
    validation_tests_str = validation_tests_str
      .replace(/in the past/g, "callback_date_in_past")
      .replace(/in the future/g, "callback_date_in_future");
  }

  return `    await this.validation.set_rules(${js(form_field_name)}, ${js(
    validation_label
  )}, ${js(validation_tests_str)});`;
}

/** Build all `set_rules()` calls for the supplied context. */
export function buildValidationTests(data: TemplateContext): string {
  const tests: string[] = [];

  for (const property of data.posted_properties) {
    const row = buildValidationTestRow(property);
    if (row !== "") tests.push(row);
  }

  return tests.join("\n");
}
