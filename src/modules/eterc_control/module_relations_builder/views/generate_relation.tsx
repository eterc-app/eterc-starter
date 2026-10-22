"use client";

import { Button } from "@/components/ui/button";
export function GenerateRelationStep({
  error,
  headline,
  parentLabel,
  childLabel,
  moduleAManageUrl,
  moduleBManageUrl,
  onViewModule,
  onOkay,
}: {
  error?: string;
  headline?: string;
  parentLabel?: string;
  childLabel?: string;
  moduleAManageUrl?: string;
  moduleBManageUrl?: string;
  onViewModule: (url: string) => void;
  onOkay: () => void;
}) {
  if (error) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
        <h2>{headline ?? "Generation Error"}</h2>
        <p className="text-sm font-medium text-destructive">{error}</p>
        <Button type="button" variant="outline" onClick={onOkay}>
          Okay
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
      <h2>Module Relation Successfully Created</h2>

      <Button
        type="button"
        onClick={() => onViewModule(moduleAManageUrl ?? "")}
      >
        View {parentLabel} Module
      </Button>
      <div>
        <Button
          type="button"
          variant="outline"
          onClick={() => onViewModule(moduleBManageUrl ?? "")}
        >
          View {childLabel} Module
        </Button>
      </div>
    </div>
  );
}
