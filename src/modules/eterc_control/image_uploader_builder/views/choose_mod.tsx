"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { UploaderModuleChoice } from "../types";
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
    <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
      <h2>Choose a Module for Your Image Uploader</h2>

      <Button
        type="button"
        variant="outline"
        onClick={() => setShowingOptions(true)}
        disabled={busy}
      >
        Select Module...
      </Button>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {showingOptions ? (
        <div id="iu-mod-options-list" className="space-y-2">
          {ready.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No modules are ready for an image uploader. Generate a module with
              a controller, model, show view and delete flow first.
            </p>
          ) : (
            ready.map((module) => (
              <Button
                key={module.module}
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() => onSelect(module.module)}
              >
                {module.label}
              </Button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
