/**
 * Shared types for the Properties Builder.
 *
 * These mirror the JSON documents served by
 * modules/trongate_control/properties (fields_info.json + address_*.json).
 */

export interface PropertyValidationRule {
  rule_name: string;
  rule_label: string;
  rule_requires_value: string;
  rule_default_value?: string;
  selected: string;
}

export interface PropertyCheckbox {
  name: string;
  label: string;
  checked: string;
}

/** One property type definition from fields_info.json. */
export interface PropertyTypeDefinition {
  property_name: string;
  property_label: string;
  validation_rules: PropertyValidationRule[];
  default_col_size: string;
  checkboxes: PropertyCheckbox[];
  suggestions: string[];
}

export type FieldsInfo = Record<string, PropertyTypeDefinition>;

/**
 * A property being edited.
 *
 * New properties (built from fields_info.json) carry `availableCheckboxes`
 * and `availableValidationRules`; address rows from address_*.json carry
 * `checkboxes` instead of `availableCheckboxes`. Both shapes are accepted by
 * the builder, exactly like the original JavaScript.
 */
export interface BuilderProperty {
  propertyName: string;
  propertyType: string;
  availableCheckboxes?: PropertyCheckbox[];
  checkboxes?: PropertyCheckbox[];
  availableValidationRules: PropertyValidationRule[];
  validationRules: string[];
  onForm?: string;
  onSummaryTable?: string;
  isSearchable?: string;
  [key: string]: unknown;
}

/** The localStorage subset written by addToLocalStorage(). */
export interface StoredProperty {
  propertyName: string;
  propertyType: string;
  onForm?: string;
  isSearchable?: string;
  onSummaryTable?: string;
  validationRules?: string[];
}
