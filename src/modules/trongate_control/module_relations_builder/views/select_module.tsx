"use client";

import { useState } from "react";
import type { RelationModuleChoice } from "../types";

/**
 * Steps 3/4 — port of
 * module_relations_builder/views/select_module.php.
 *
 * One component serves both module pickers: the heading and the controller
 * method posted for the chosen module come from the server step payload.
 */
export function SelectModuleStep({
  heading,
  modules,
  onSelect,
  busy,
  error,
}: {
  heading: string;
  modules: RelationModuleChoice[];
  onSelect: (selected: string) => void;
  busy: boolean;
  error?: string;
}) {
  const [showingOptions, setShowingOptions] = useState(false);

  return (
    <div className="center-stage">
      <div className="mt-1">{heading}</div>
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
        <div id="mod-options-list">
          <ul className="options-selector">
            {modules.map((choice) => (
              <li key={choice.module} onClick={() => onSelect(choice.module)}>
                {choice.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
