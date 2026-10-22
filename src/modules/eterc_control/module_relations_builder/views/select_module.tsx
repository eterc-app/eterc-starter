"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
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
    <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
      <h2>{heading}</h2>
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
        <div id="mod-options-list" className="space-y-2">
          {modules.map((choice) => (
            <Button
              key={choice.module}
              type="button"
              variant="outline"
              className="w-full justify-start"
              onClick={() => onSelect(choice.module)}
            >
              {choice.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
