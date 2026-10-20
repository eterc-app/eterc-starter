"use client";

import { useTgUi } from "./TgUiProvider";

/**
 * Validation errors — port of validation's display_errors() rendering:
 *
 *   <ValidationErrors field="username" />   → inline list for one field
 *   <ValidationErrors />                    → general summary list
 *   <ValidationErrors opening="<div>" closing="</div>" /> → custom wrappers
 */
export function ValidationErrors({
  field,
  opening,
  closing,
}: {
  field?: string;
  opening?: string;
  closing?: string;
}) {
  const { errors } = useTgUi();
  if (!errors) return null;

  if (field !== undefined) {
    const fieldErrors = errors[field];
    if (!fieldErrors || fieldErrors.length === 0) return null;
    return (
      <ul className="validation-errors validation-errors--inline">
        {fieldErrors.map((error, index) => (
          <li key={index}>{error}</li>
        ))}
      </ul>
    );
  }

  const all = Object.values(errors).flat();
  if (all.length === 0) return null;

  const Open = opening ?? '<ul class="validation-errors">';
  const Close = closing ?? "</ul>";

  return (
    <div className="validation-error-report">
      <div dangerouslySetInnerHTML={{ __html: Open }} />
      {all.map((error, index) => (
        <div key={index} dangerouslySetInnerHTML={{ __html: error }} />
      ))}
      <div dangerouslySetInnerHTML={{ __html: Close }} />
    </div>
  );
}
