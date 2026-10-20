"use client";

import { useState } from "react";
import type { RelationsWizard } from "../types";

/**
 * Step 5 (one-to-one only) — port of
 * module_relations_builder/views/bridging_question.php.
 */
export function BridgingQuestionStep({
  wizard,
  onSelect,
  busy,
  error,
}: {
  wizard: RelationsWizard;
  onSelect: (selected: string) => void;
  busy: boolean;
  error?: string;
}) {
  const [showingOptions, setShowingOptions] = useState(false);

  return (
    <div className="center-stage">
      <div className="mt-1">
        Would you like to create a bridging table for this relationship?
      </div>
      {wizard.parent_module ? (
        <p className="hint-text">
          {wizard.parent_module} &rarr; {wizard.child_module}
        </p>
      ) : null}
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
        <div id="br-options-list">
          <ul className="options-selector">
            {["Yes", "No"].map((option) => (
              <li key={option} onClick={() => onSelect(option)}>
                {option}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
