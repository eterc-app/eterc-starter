"use client";

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
      <div className="center-stage">
        <div className="mt-1">
          <strong>{headline ?? "Generation Error"}</strong>
        </div>
        <p style={{ color: "#b00020" }}>{error}</p>
        <div className="mt-1">
          <button type="button" onClick={onOkay}>
            Okay
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="center-stage">
      <div className="mt-1">
        <strong>Image Uploader Successfully Created</strong>
      </div>

      <div className="mt-1">
        <button
          type="button"
          className="success"
          onClick={() => onViewModule(moduleUrl ?? "")}
        >
          View {moduleLabel} Module
        </button>
      </div>
      <div className="mt-1">
        <button type="button" onClick={onOkay}>
          Okay
        </button>
      </div>
    </div>
  );
}
