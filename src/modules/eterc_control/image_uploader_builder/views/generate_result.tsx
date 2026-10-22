"use client";

import { Button } from "@/components/ui/button";

/**
 * Generation result — port of
 * image_uploader_builder/views/generate_result.php.
 */
export function GenerateResultStep({
  error,
  headline,
  moduleLabel,
  moduleUrl,
  onViewModule,
  onOkay,
}: {
  error?: string;
  headline?: string;
  moduleLabel?: string;
  moduleUrl?: string;
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
      <h2>Image Uploader Successfully Created</h2>
      <Button
        type="button"
        onClick={() => onViewModule(moduleUrl ?? "")}
      >
        View {moduleLabel} Module
      </Button>
      <div>
        <Button type="button" variant="outline" onClick={onOkay}>
          Okay
        </Button>
      </div>
    </div>
  );
}
