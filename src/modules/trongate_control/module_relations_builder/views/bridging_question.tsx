"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
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
    <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
      <h2>Bridging Table</h2>
      <p>Would you like to create a bridging table for this relationship?</p>
      {wizard.parent_module ? (
        <p className="text-sm text-muted-foreground">
          {wizard.parent_module} → {wizard.child_module}
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        onClick={() => setShowingOptions(true)}
        disabled={busy}
      >
        Select Option...
      </Button>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {showingOptions ? (
        <div id="br-options-list" className="space-y-2">
          {["Yes", "No"].map((option) => (
            <Button
              key={option}
              type="button"
              variant="outline"
              className="w-full justify-start"
              onClick={() => onSelect(option)}
            >
              {option}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
