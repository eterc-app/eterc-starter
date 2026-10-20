"use client";

import { useState } from "react";
import type { BuilderProperty, PropertyValidationRule } from "./types";
import {
  decodeHtmlEntities,
  maxLengthIndicator,
  parseValidationRule,
} from "./properties-logic";

/**
 * One property accordion — port of drawProperties() plus
 * buildPropertiesEditorLeft/Center/Right() from properties_builder.js.
 *
 * Markup and Trongate CSS classes are kept identical to the original:
 * `button.accordion`, `.accordion-content`, `.w3-quarter`, `.wrapper`,
 * `.control.control-checkbox`, `.remove-remove-rule`, ...
 */

const CHECKBOXES: Array<{ code: string; label: string }> = [
  { code: "onForm", label: "On (Create) Form" },
  { code: "onSummaryTable", label: "On Summary Table" },
  { code: "isSearchable", label: "Searchable" },
];

export interface PropertyAccordionProps {
  property: BuilderProperty;
  index: number;
  expanded: boolean;
  overrides: Record<number, string>;
  onToggle: () => void;
  onDelete: () => void;
  onAddRule: (ruleLabel: string) => void;
  onRemoveRule: (ruleIndex: number) => void;
  onCheckValue: (ruleIndex: number, value: string) => void;
  onToggleCheckbox: (code: string) => void;
}

export function PropertyAccordion({
  property,
  index,
  expanded,
  overrides,
  onToggle,
  onDelete,
  onAddRule,
  onRemoveRule,
  onCheckValue,
  onToggleCheckbox,
}: PropertyAccordionProps) {
  const availableOptions = property.availableValidationRules.filter(
    (rule) => rule.selected === "no"
  );

  const checkboxHtml = CHECKBOXES.filter((checkbox) =>
    Boolean(property[checkbox.code])
  ).map((checkbox) => {
    const checked = property[checkbox.code] === "yes";

    return (
      <label className="control control-checkbox" key={checkbox.code}>
        {checkbox.label}
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onToggleCheckbox(checkbox.code)}
        />
        <div className="control_indicator"></div>
      </label>
    );
  });

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        className="accordion w3-blue-grey"
        id={`upper-${index}`}
      >
        {decodeHtmlEntities(property.propertyName)}
        <span className="type-def">{property.propertyType}</span>
        <span className="col-size-def" id={`col-size-${index}`}>
          {maxLengthIndicator(property.validationRules)}
        </span>
        <span className="accordion-top-rhs-icon">
          {expanded ? "\u2296" : "\u2295"}
        </span>
      </button>

      <div
        className="accordion-content w3-light-grey"
        style={{ maxHeight: expanded ? "999px" : "0px" }}
        id={`lower-${index}`}
      >
        <div className="w3-row" style={{ fontSize: "1.2em" }}>
          <div className="w3-quarter">
            <ValidationRuleControls
              index={index}
              options={availableOptions}
              onAdd={onAddRule}
            />
            <button
              type="button"
              className="w3-btn w3-small w3-red"
              onClick={onDelete}
            >
              Delete This Property
            </button>
          </div>

          <div
            className="w3-half wrapper"
            id={`selected-validation-rules-${index}`}
            style={{ fontSize: "1.05em" }}
          >
            {property.validationRules.map((rule, ruleIndex) => {
              const parsed = parseValidationRule(rule);
              const display =
                parsed.value === null
                  ? null
                  : overrides[ruleIndex] ?? parsed.value;

              return (
                <div key={ruleIndex}>
                  {parsed.value === null ? (
                    <span>{parsed.label}</span>
                  ) : (
                    <>
                      <span>{parsed.label}[</span>
                      <span
                        contentEditable
                        suppressContentEditableWarning
                        id={`validation-value-${index}-${ruleIndex}`}
                        onBlur={(event) =>
                          onCheckValue(
                            ruleIndex,
                            event.currentTarget.textContent ?? ""
                          )
                        }
                      >
                        {display}
                      </span>
                      <span>]</span>
                    </>
                  )}{" "}
                  <span
                    onClick={() => onRemoveRule(ruleIndex)}
                    className="remove-remove-rule"
                  >
                    {"\u2718"}
                  </span>
                </div>
              );
            })}
          </div>

          <div
            className="w3-quarter control-group"
            id={`checkboxes-${index}`}
          >
            {checkboxHtml}
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * The validation-rule dropdown + "Add New Rule" button.
 *
 * Original markup:
 *   <div id="validation-rules-dropdown-i"></div>
 *   <button ... id="add-new-rule-btn-i">Add New Rule</button>
 * The select owns its selected value and calls back when the button is
 * pressed; when no rules are available the original rendered `&nbsp;` and
 * hid the button.
 */
function ValidationRuleControls({
  index,
  options,
  onAdd,
}: {
  index: number;
  options: PropertyValidationRule[];
  onAdd: (ruleLabel: string) => void;
}) {
  const [selected, setSelected] = useState("");

  // Derive the effective selection instead of clearing state in an effect:
  // adding/removing a rule can remove the previously selected option.
  const selectedValue = options.some((rule) => rule.rule_label === selected)
    ? selected
    : "";

  const addRule = () => {
    onAdd(selectedValue);
    setSelected("");
  };

  return (
    <>
      <div id={`validation-rules-dropdown-${index}`}>
        {options.length === 0 ? (
          <>{String.fromCharCode(160)}</>
        ) : (
          <select
            className="w3-select w3-border"
            id={`new-option-dropdown-${index}`}
            value={selectedValue}
            onChange={(event) => setSelected(event.target.value)}
          >
            <option value="" disabled>
              Select Validation Rule...
            </option>
            {options.map((rule) => (
              <option key={rule.rule_name} value={rule.rule_label}>
                {rule.rule_label}
              </option>
            ))}
          </select>
        )}
      </div>
      {options.length > 0 ? (
        <button
          type="button"
          id={`add-new-rule-btn-${index}`}
          className="w3-btn w3-small w3-blue-grey"
          onClick={addRule}
        >
          Add New Rule
        </button>
      ) : null}
    </>
  );
}
