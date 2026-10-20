"use client";

import { useState } from "react";
import { RELATION_TYPES } from "../types";

/**
 * Step 1 — port of
 * module_relations_builder/views/choose_relation_type.php.
 *
 * The PHP view swapped a hidden options list into `main`; the React port
 * reveals the same list in place. Values stay literally spaced ("one to one")
 * because the controller validates them with an exact match.
 */

const LABELS: Record<string, string> = {
  "one to one": "One to One",
  "one to many": "One to Many",
  "many to many": "Many to Many",
};

export function ChooseRelationTypeStep({
  onSelect,
  busy,
  error,
}: {
  onSelect: (selected: string) => void;
  busy: boolean;
  error?: string;
}) {
  const [showingOptions, setShowingOptions] = useState(false);

  return (
    <div className="center-stage">
      <div className="mt-1">Choose Relation Type</div>
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

      {error ? <p style={{ color: "#b00020" }}>{error}</p> : null}

      {showingOptions ? (
        <div id="rt-options-list">
          <ul className="options-selector">
            {RELATION_TYPES.map((type) => (
              <li key={type} onClick={() => onSelect(type)}>
                {LABELS[type]}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
