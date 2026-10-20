"use client";

/**
 * Pre-generation confirmation — port of
 * image_uploader_builder/views/conf_generate_uploader.php.
 *
 * The loader image is served from the port's copy under
 * public/trongate_control-image_uploader_builder_module.
 */
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
    <div className="center-stage">
      <div id="form-area">
        <div className="mt-1">
          <button
            type="button"
            className="highlight"
            onClick={onGenerate}
            disabled={busy}
          >
            Generate Image Uploader
          </button>
        </div>
        <div className="mt-1">
          <button type="button" onClick={onViewDetails}>
            View Uploader Details
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
          src="/trongate_control-image_uploader_builder_module/images/loader.svg"
          alt="loading"
        />
      </div>
    </div>
  );
}
