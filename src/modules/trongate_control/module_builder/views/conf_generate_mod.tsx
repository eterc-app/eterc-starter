"use client";

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
    <div className="center-stage">
      <div id="form-area">
        <div className="mt-1">
          <button
            type="button"
            className="highlight"
            onClick={onGenerate}
            disabled={busy}
          >
            Generate New Module
          </button>
        </div>
        <div className="mt-1">
          <button type="button" onClick={onViewDetails}>
            View Module Details
          </button>
        </div>
        {error ? (
          <div className="mt-1" style={{ color: "#b00020" }}>
            <p>{error}</p>
            {moreInfoUrl ? (
              <p>
                <a href={moreInfoUrl} target="_blank" rel="noreferrer">
                  More information
                </a>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <div id="loading" className="mx-indicator" style={{ display: "none" }}>
        <img
          src="/trongate_control-evo_module/images/loader.svg"
          alt="loading"
        />
      </div>
    </div>
  );
}
