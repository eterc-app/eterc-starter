"use client";

import { Button } from "@/components/ui/button";

/**
 * Pre-generation confirmation — port of
 * module_relations_builder/views/conf_generate_relation.php.
 *
 * The PHP view posted through mx-get/mx-post; this component calls the same
 * controller methods through the JSON API. The loader image is served from
 * the port's copy under public/trongate_control-module_relations_builder_module.
 */
export function ConfGenerateRelationStep({
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
      <h2>Generate Relation</h2>
      <div id="form-area" className="space-y-3">
        <Button type="button" onClick={onGenerate} disabled={busy}>
          Generate Relation
        </Button>
        <div>
          <Button type="button" variant="outline" onClick={onViewDetails}>
            View Relation Details
          </Button>
        </div>
        {error ? (
          <p className="text-sm font-medium text-destructive">{error}</p>
        ) : null}
      </div>
    </div>
  );
}
