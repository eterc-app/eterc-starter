"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RELATION_TYPES } from "../types";

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
    <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
      <h2>Choose Relation Type</h2>
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
        <div id="rt-options-list" className="space-y-2">
          {RELATION_TYPES.map((type) => (
            <Button
              key={type}
              type="button"
              variant="outline"
              className="w-full justify-start"
              onClick={() => onSelect(type)}
            >
              {LABELS[type]}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
