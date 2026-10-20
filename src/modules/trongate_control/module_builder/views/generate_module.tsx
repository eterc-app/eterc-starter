"use client";

/**
 * Generation success — port of module_builder/views/generate_module.php.
 */
export function GenerateModuleStep({
  moduleUrl,
  onView,
  onOkay,
}: {
  moduleUrl: string;
  onView: () => void;
  onOkay: () => void;
}) {
  return (
    <div className="center-stage">
      <div className="mt-1">
        <button type="button" className="success" onClick={onView}>
          View Your Module
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
