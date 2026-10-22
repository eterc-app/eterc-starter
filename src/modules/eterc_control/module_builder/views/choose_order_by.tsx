"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { WizardProperty } from "../Module_builder";
function url_title(value: string): string {
  return value
    .replace(/[^\p{L}\d]+/gu, "-")
    .replace(/^[-\s]+|[-\s]+$/g, "")
    .toLowerCase();
}

interface OrderByOption {
  /** Text shown in the list (original: propertyName). */
  propertyName: string;
  /** Value posted to submit_order_by (original: url_title column). */
  column: string;
}
export function ChooseOrderByStep({
  properties,
  onSelect,
  busy,
}: {
  properties: WizardProperty[];
  onSelect: (selected: string) => void;
  busy: boolean;
}) {
  const [showingOptions, setShowingOptions] = useState(false);

  const options: OrderByOption[] = [
    { propertyName: "id", column: "id" },
    { propertyName: "id DESC", column: "id DESC" },
  ];

  for (const prop of properties) {
    const propName = prop.propertyName ?? "";
    if (propName === "") continue;
    const column = url_title(propName).replace(/-/g, "_");
    options.push({ propertyName: propName, column });
    options.push({ propertyName: `${propName} DESC`, column: `${column} DESC` });
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
      <h2>Choose Default Order By</h2>
      <Button
        type="button"
        variant="outline"
        onClick={() => setShowingOptions(true)}
        disabled={busy}
      >
        Select Option...
      </Button>

      {showingOptions ? (
        <div id="ob-options-list" className="space-y-2">
          {options.map((opt, index) => (
            <Button
              key={`${opt.column}-${index}`}
              type="button"
              variant="outline"
              className="w-full justify-start"
              onClick={() => onSelect(opt.column)}
            >
              {opt.propertyName}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
