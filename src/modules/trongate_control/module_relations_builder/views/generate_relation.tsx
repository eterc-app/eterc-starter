"use client";

/**
 * Generation result — port of
 * module_relations_builder/views/generate_relation.php.
 *
 * Success shows the two module shortcuts; failure shows the controller's
 * headline and message. Both success buttons open the manage page in a new
 * tab and reset the wizard, matching the original doReset() behaviour.
 */
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
        <strong>Module Relation Successfully Created</strong>
      </div>

      <div className="mt-1">
        <button
          type="button"
          className="success"
          onClick={() => onViewModule(moduleAManageUrl ?? "")}
        >
          View {parentLabel} Module
        </button>
      </div>
      <div className="mt-1">
        <button
          type="button"
          onClick={() => onViewModule(moduleBManageUrl ?? "")}
        >
          View {childLabel} Module
        </button>
      </div>
    </div>
  );
}
