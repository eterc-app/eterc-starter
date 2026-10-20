/**
 * Dynamic JSX form controls — port of
 * site_builder/views/dynamic_form_fields.php and model_helper.php.
 */

import type { PostedProperty, TemplateContext } from "../FloTypes";
import {
  extractRuleName,
  extractRuleValue,
  js,
  jsxText,
} from "./helpers";

function formFieldTag(property: PostedProperty): "input" | "textarea" {
  return property.property_type === "textarea" ? "textarea" : "input";
}

function formFieldInputType(property: PostedProperty): string {
  switch (property.property_type) {
    case "int":
    case "decimal":
      return "number";
    case "email":
      return "email";
    case "date":
      return "date";
    case "time":
      return "time";
    case "date and time":
      return "datetime-local";
    default:
      return "text";
  }
}

/** Build JSX attributes from the property's validation rules. */
function buildFormFieldAttributes(property: PostedProperty): string {
  const attributes: string[] = [];

  for (const rule of property.validation_rules) {
    const rule_name = extractRuleName(rule);
    const rule_value = extractRuleValue(rule);

    switch (rule_name) {
      case "required":
        attributes.push("            required");
        break;
      case "min length": {
        const value = Number(rule_value);
        if (rule_value !== "" && Number.isFinite(value)) {
          attributes.push(`            minLength={${value}}`);
        }
        break;
      }
      case "max length": {
        const value = Number(rule_value);
        if (rule_value !== "" && Number.isFinite(value)) {
          attributes.push(`            maxLength={${value}}`);
        }
        break;
      }
      case "greater than": {
        if (rule_value !== "") {
          const numeric = Number(rule_value);
          attributes.push(
            `            min={${
              Number.isFinite(numeric) ? numeric : js(rule_value)
            }}`
          );
        }
        break;
      }
      case "less than": {
        if (rule_value !== "") {
          const numeric = Number(rule_value);
          attributes.push(
            `            max={${
              Number.isFinite(numeric) ? numeric : js(rule_value)
            }}`
          );
        }
        break;
      }
      case "in the past":
        attributes.push('            data-date-constraint="past"');
        break;
      case "in the future":
        attributes.push('            data-date-constraint="future"');
        break;
      default:
        break;
    }
  }

  if (property.property_type === "decimal") {
    attributes.push('            step="any"');
  }

  return attributes.join("\n");
}

function buildFormFieldRow(property: PostedProperty): string {
  const field = property.form_field_name;
  const label = property.property_name;
  const validation = `          <ValidationErrors field=${js(field)} />`;

  if (property.property_type === "boolean") {
    return [
      "          <label>",
      `            <input`,
      '              type="checkbox"',
      `              name=${js(field)}`,
      '              value="1"',
      `              defaultChecked={Number(data.${field} ?? 0) === 1 || data.${field} === "yes"}`,
      "            />",
      `            {" "}${jsxText(label)}`,
      "          </label>",
    ].join("\n");
  }

  const attributes = buildFormFieldAttributes(property);
  const tag = formFieldTag(property);

  if (tag === "textarea") {
    return [
      `          <label>${jsxText(label)}</label>`,
      validation,
      `          <textarea`,
      `            name=${js(field)}`,
      `            defaultValue={String(data.${field} ?? "")}`,
      `            placeholder=${js(`Enter ${label}`)}`,
      "            rows={5}",
      attributes,
      "          />",
    ]
      .filter((line) => line !== "")
      .join("\n");
  }

  const input_type = formFieldInputType(property);
  return [
    `          <label>${jsxText(label)}</label>`,
    validation,
    `          <input`,
    `            type=${js(input_type)}`,
    `            name=${js(field)}`,
    `            defaultValue={String(data.${field} ?? "")}`,
    `            placeholder=${js(`Enter ${label}`)}`,
    attributes,
    "          />",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/** Build every form control for the generated create view. */
export function buildFormFields(data: TemplateContext): string {
  const rows: string[] = [];
  for (const property of data.posted_properties) {
    rows.push(buildFormFieldRow(property));
  }
  return rows.join("\n\n");
}
