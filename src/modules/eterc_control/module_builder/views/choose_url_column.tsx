"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
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
    <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
      <h2>Choose URL Column</h2>
      <p className="text-sm text-muted-foreground">
        The URL column is used when linking to a record. Submit an empty option
        if a URL column is not required.
      </p>

      <Button
        type="button"
        variant="outline"
        onClick={() => setShowingOptions(true)}
        disabled={busy}
      >
        Select Option...
      </Button>

      {showingOptions ? (
        <div id="uc-options-list" className="space-y-2">
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start"
            onClick={() => onSelect("")}
          >
            No URL column
          </Button>
          {properties.map((prop, index) => {
            const propName = prop.propertyName ?? "";
            return (
              <Button
                key={`${propName}-${index}`}
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() => onSelect(propName)}
              >
                {propName}
              </Button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
