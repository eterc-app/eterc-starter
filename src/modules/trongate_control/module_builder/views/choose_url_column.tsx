"use client";

import { useState } from "react";
import type { WizardProperty } from "../Module_builder";

/**
 * Step 5 — port of module_builder/views/choose_url_column.php.
 *
 * The PHP view swapped its hidden options list into `main` when the selector
 * button was clicked; the React equivalent reveals the same list in place.
 */
export function ChooseUrlColumnStep({
  properties,
  onSelect,
  busy,
}: {
  properties: WizardProperty[];
  onSelect: (selected: string) => void;
  busy: boolean;
}) {
  const [showingOptions, setShowingOptions] = useState(false);

  return (
    <div className="center-stage">
      <div className="mt-1">Choose URL Column</div>
      <div className="mt-1">
        <button
          type="button"
          className="selector-btn"
          onClick={() => setShowingOptions(true)}
          disabled={busy}
        >
          Select Option...
        </button>
        <p>Submit empty option if not required</p>
      </div>

      {showingOptions ? (
        <div id="uc-options-list">
          <ul className="options-selector">
            <li onClick={() => onSelect("")}>&nbsp;</li>
            {properties.map((prop, index) => {
              const propName = prop.propertyName ?? "";
              return (
                <li key={`${propName}-${index}`} onClick={() => onSelect(propName)}>
                  {propName}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
