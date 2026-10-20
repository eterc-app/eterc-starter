import type {
  BuilderProperty,
  PropertyCheckbox,
  PropertyValidationRule,
  StoredProperty,
} from "./types";

/**
 * Pure helpers for the Properties Builder — direct ports of the JavaScript
 * helpers in modules/trongate_control/properties_builder/js/properties_builder.js.
 */

/** Deep-ish clone used when instantiating a new property from a type. */
export function cloneValidationRules(
  rules: PropertyValidationRule[]
): PropertyValidationRule[] {
  return rules.map((rule) => ({ ...rule }));
}

export function cloneCheckboxes(
  checkboxes: PropertyCheckbox[]
): PropertyCheckbox[] {
  return checkboxes.map((checkbox) => ({ ...checkbox }));
}

/**
 * PHP/JS: buildValidationRuleFromAvailableRule()
 * Appends `[default]` when the rule requires a value.
 */
export function buildValidationRule(rule: PropertyValidationRule): string {
  let value = rule.rule_label;

  if (rule.rule_requires_value === "yes") {
    value += `[${rule.rule_default_value ?? ""}]`;
  }

  return value;
}

/** PHP/JS: buildValidationRulesFromApiResponse() — only rules marked yes. */
export function buildInitialValidationRules(
  rules: PropertyValidationRule[]
): string[] {
  return rules
    .filter((rule) => rule.selected === "yes")
    .map((rule) => buildValidationRule(rule));
}

/**
 * PHP/JS: addToLocalStorage() — keep only the fields the parent uses.
 *
 * The order matches the original object literal: propertyName, propertyType,
 * onForm, isSearchable, onSummaryTable, validationRules.
 */
export function toStoredProperties(properties: BuilderProperty[]): StoredProperty[] {
  return properties.map((property) => {
    const stored: StoredProperty = {
      propertyName: property.propertyName,
      propertyType: property.propertyType,
    };

    if (property.onForm) stored.onForm = property.onForm;
    if (property.isSearchable) stored.isSearchable = property.isSearchable;
    if (property.onSummaryTable) stored.onSummaryTable = property.onSummaryTable;
    if (property.validationRules) stored.validationRules = property.validationRules;

    return stored;
  });
}

/** PHP/JS: addNewProperty() title validation. */
export function validatePropertyTitle(
  title: string,
  propertyType: string
): string {
  if (propertyType === "date range" || propertyType === "time range") {
    const hasAnd = title.includes(" and ") || title.includes(" And ");
    if (!hasAnd) {
      return "This kind of property must contain 'and' or 'And'.";
    }
    return "";
  }

  if (title.length < 2) {
    return "Property title must be at least two characters.";
  }

  return "";
}

/**
 * Split a validation rule such as `max length[255]` into its label and value.
 * Rules without brackets return value = null.
 */
export function parseValidationRule(rule: string): {
  label: string;
  value: string | null;
} {
  const open = rule.indexOf("[");
  const close = rule.lastIndexOf("]");

  if (open === -1 || close === -1 || close < open) {
    return { label: rule, value: null };
  }

  return {
    label: rule.slice(0, open),
    value: rule.slice(open + 1, close),
  };
}

/** The `(255)` indicator shown next to an accordion's type. */
export function maxLengthIndicator(rules: string[]): string {
  for (const rule of rules) {
    if (rule.indexOf("max length") === 0) {
      const parsed = parseValidationRule(rule);
      if (parsed.value !== null) return `(${parsed.value})`;
    }
  }
  return "";
}

/**
 * PHP/JS: removeValitionRule() —
 * `targetRule.replace(/\d+/g, '').replace('[]', '').replace('[,]', '')`.
 */
export function normalizeRuleLabel(rule: string): string {
  return rule
    .replace(/\d+/g, "")
    .replace("[]", "")
    .replace("[,]", "");
}

/** JS `/^[0-9]*$/` (note: the original only accepts non-negative digits). */
export function isDigits(value: string): boolean {
  return /^[0-9]*$/.test(value);
}

/**
 * Decode the handful of HTML entities that appear inside fields_info.json
 * (e.g. "Postage &amp; Packaging"). The original rendered suggestions with
 * innerHTML, so the browser decoded them.
 */
export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#x0*27;/gi, "'");
}

/** Collapse runs of two or more spaces (PHP/JS: replace(/  +/g, ' ')). */
export function collapseSpaces(value: string): string {
  return value.replace(/  +/g, " ");
}
