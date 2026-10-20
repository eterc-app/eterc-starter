"use client";

import { useState } from "react";
import { Minus, Plus, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { BuilderProperty, PropertyValidationRule } from "./types";
import {
  decode_html_entities,
  maxLengthIndicator,
  parseValidationRule,
} from "./properties-logic";

/**
 * One property accordion — port of drawProperties() plus
 * buildPropertiesEditorLeft/Center/Right() from properties_builder.js.
 *
 * The original emitted Trongate/W3 CSS class names. This port keeps the same
 * state and callbacks but renders the panel with shadcn primitives and
 * Tailwind utilities.
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

  const checkboxes = CHECKBOXES.filter((checkbox) =>
    Boolean(property[checkbox.code])
  );

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 bg-slate-700 px-4 py-3 text-left text-sm font-medium text-white transition-colors hover:bg-slate-600"
        id={`upper-${index}`}
        aria-expanded={expanded}
        aria-controls={`lower-${index}`}
      >
        <span className="truncate">
          {decode_html_entities(property.propertyName)}
        </span>
        <Badge variant="secondary" className="ml-1 shrink-0">
          {property.propertyType}
        </Badge>
        <span className="shrink-0 text-xs text-white/70" id={`col-size-${index}`}>
          {maxLengthIndicator(property.validationRules)}
        </span>
        <span className="ml-auto shrink-0">
          {expanded ? <Minus className="size-4" /> : <Plus className="size-4" />}
        </span>
      </button>

      {expanded ? (
        <div
          className="space-y-4 border-t bg-muted/30 p-4"
          id={`lower-${index}`}
        >
          <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_190px]">
            <div className="space-y-3">
              <ValidationRuleControls
                index={index}
                options={availableOptions}
                onAdd={onAddRule}
              />
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={onDelete}
              >
                <Trash2 className="size-3.5" /> Delete This Property
              </Button>
            </div>

            <div
              className="min-w-0 space-y-2"
              id={`selected-validation-rules-${index}`}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Validation rules
              </p>
              {property.validationRules.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No validation rules selected.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {property.validationRules.map((rule, ruleIndex) => {
                    const parsed = parseValidationRule(rule);
                    const display =
                      parsed.value === null
                        ? null
                        : overrides[ruleIndex] ?? parsed.value;

                    return (
                      <span
                        key={ruleIndex}
                        className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs"
                      >
                        {parsed.value === null ? (
                          <span>{parsed.label}</span>
                        ) : (
                          <>
                            <span>{parsed.label}[</span>
                            <span
                              contentEditable
                              suppressContentEditableWarning
                              id={`validation-value-${index}-${ruleIndex}`}
                              className="min-w-4 rounded-sm bg-muted px-1 outline-none focus:bg-background focus:ring-1 focus:ring-ring"
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
                        )}
                        <button
                          type="button"
                          onClick={() => onRemoveRule(ruleIndex)}
                          className="rounded-sm p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`Remove ${parsed.label}`}
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-2" id={`checkboxes-${index}`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Display
              </p>
              {checkboxes.map((checkbox) => (
                <Label
                  key={checkbox.code}
                  className="flex items-start gap-2 text-sm font-normal"
                >
                  <Checkbox
                    checked={property[checkbox.code] === "yes"}
                    onCheckedChange={() => onToggleCheckbox(checkbox.code)}
                    className="mt-0.5"
                  />
                  {checkbox.label}
                </Label>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
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
    <div className="space-y-2" id={`validation-rules-dropdown-${index}`}>
      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground">All rules applied.</p>
      ) : (
        <select
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
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
      {options.length > 0 ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          id={`add-new-rule-btn-${index}`}
          onClick={addRule}
          disabled={selectedValue === ""}
        >
          Add New Rule
        </Button>
      ) : null}
    </div>
  );
}
