"use client";

import { useState } from "react";
import type { UploaderModuleChoice } from "../types";

/**
 * Step 1 — port of image_uploader_builder/views/choose_mod.php.
 *
 * Only ready modules are offered; blocked modules keep their reasons on the
 * server payload but are not shown (the original chooser behaves the same).
 */
export function ChooseModStep({
  modules,
  onSelect,
  busy,
  error,
}: {
  modules: UploaderModuleChoice[];
  onSelect: (selected: string) => void;
  busy: boolean;
  error?: string;
}) {
  const [showingOptions, setShowingOptions] = useState(false);
  const ready = modules.filter((module) => module.ready);

  return (
    <div className="center-stage">
      <div className="mt-1">Choose a Module for Your Image Uploader</div>

      <div className="mt-1">
        <button
          type="button"
          className="selector-btn"
          onClick={() => setShowingOptions(true)}
          disabled={busy}
        >
          Select Module...
        </button>
      </div>

      {error ? <p style={{ color: "#b00020" }}>{error}</p> : null}

      {showingOptions ? (
        <div id="iu-mod-options-list">
          {ready.length === 0 ? (
            <p>
              No modules are ready for an image uploader. Generate a module with
              a controller, model, show view and delete flow first.
            </p>
          ) : (
            <ul className="options-selector">
              {ready.map((module) => (
                <li key={module.module} onClick={() => onSelect(module.module)}>
                  {module.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
