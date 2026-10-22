"use client";

import { Button } from "@/components/ui/button";
export function ConfGenerateUploaderStep({
  onGenerate,
  onViewDetails,
  busy,
  error,
}: {
  onGenerate: () => void;
  onViewDetails: () => void;
  busy: boolean;
  error?: string;
}) {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
      <h2>Generate Image Uploader</h2>
      <div id="form-area" className="space-y-3">
        <Button type="button" onClick={onGenerate} disabled={busy}>
          Generate Image Uploader
        </Button>
        <div>
          <Button type="button" variant="outline" onClick={onViewDetails}>
            View Uploader Details
          </Button>
        </div>
        {error ? (
          <p className="text-sm font-medium text-destructive">{error}</p>
        ) : null}
      </div>
    </div>
  );
}
