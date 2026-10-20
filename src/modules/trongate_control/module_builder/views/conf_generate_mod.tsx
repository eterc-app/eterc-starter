"use client";

import { Button } from "@/components/ui/button";

/**
 * Pre-generation confirmation — port of
 * module_builder/views/conf_generate_mod.php.
 */
export function ConfGenerateModStep({
  onGenerate,
  onViewDetails,
  busy,
  error,
  moreInfoUrl,
}: {
  onGenerate: () => void;
  onViewDetails: () => void;
  busy: boolean;
  error?: string;
  moreInfoUrl?: string;
}) {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
      <h2>Generate Module</h2>
      <div id="form-area" className="space-y-3">
        <Button type="button" onClick={onGenerate} disabled={busy}>
          Generate New Module
        </Button>
        <div>
          <Button type="button" variant="outline" onClick={onViewDetails}>
            View Module Details
          </Button>
        </div>
        {error ? (
          <div className="space-y-2 text-sm text-destructive">
            <p>{error}</p>
            {moreInfoUrl ? (
              <p>
                <a
                  href={moreInfoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium underline underline-offset-4"
                >
                  More information
                </a>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
