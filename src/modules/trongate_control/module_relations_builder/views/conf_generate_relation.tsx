"use client";

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
    <div className="center-stage">
      <div id="form-area">
        <div className="mt-1">
          <button
            type="button"
            className="highlight"
            onClick={onGenerate}
            disabled={busy}
          >
            Generate Relation
          </button>
        </div>
        <div className="mt-1">
          <button type="button" onClick={onViewDetails}>
            View Relation Details
          </button>
        </div>
        {error ? (
          <div className="mt-1" style={{ color: "#b00020" }}>
            <p>{error}</p>
          </div>
        ) : null}
      </div>
      <div id="loading" className="mx-indicator" style={{ display: "none" }}>
        <img
          src="/trongate_control-module_relations_builder_module/images/loader.svg"
          alt="loading"
        />
      </div>
    </div>
  );
}
