"use client";

import { useState } from "react";
import type { WizardProperty } from "../Module_builder";

/** PHP url_title() equivalent for property names (client-side). */
function urlTitle(value: string): string {
  return value
    .replace(/[^\p{L}\d]+/gu, "-")
    .replace(/^[-\s]+|[-\s]+$/g, "")
    .toLowerCase();
}

interface OrderByOption {
  /** Text shown in the list (original: propertyName). */
  propertyName: string;
  /** Value posted to submit_order_by (original: url_title column). */
  column: string;
}

/**
 * Step 6 — port of module_builder/views/choose_order_by.php.
 *
 * Options: id, id DESC, and for each property its raw name / raw name DESC
 * (display) mapped to the slug column / slug column DESC (posted value).
 */
export function ChooseOrderByStep({
  properties,
  onSelect,
  busy,
}: {
  properties: WizardProperty[];
  onSelect: (selected: string) => void;
  busy: boolean;
}) {
  const [showingOptions, setShowingOptions] = useState(false);

  const options: OrderByOption[] = [
    { propertyName: "id", column: "id" },
    { propertyName: "id DESC", column: "id DESC" },
  ];

  for (const prop of properties) {
    const propName = prop.propertyName ?? "";
    if (propName === "") continue;
    const column = urlTitle(propName).replace(/-/g, "_");
    options.push({ propertyName: propName, column });
    options.push({ propertyName: `${propName} DESC`, column: `${column} DESC` });
  }

  return (
    <div className="center-stage">
      <div className="mt-1">Choose Default Order By</div>
      <div className="mt-1">
        <button
          type="button"
          className="selector-btn"
          onClick={() => setShowingOptions(true)}
          disabled={busy}
        >
          Select Option...
        </button>
      </div>

      {showingOptions ? (
        <div id="ob-options-list">
          <ul className="options-selector">
            {options.map((opt, index) => (
              <li key={`${opt.column}-${index}`} onClick={() => onSelect(opt.column)}>
                {opt.propertyName}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
