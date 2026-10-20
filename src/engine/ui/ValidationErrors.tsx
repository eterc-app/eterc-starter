"use client";

import { useTgUi } from "./TgUiProvider";

/**
 * Validation errors — port of validation's display_errors() rendering:
 *
 *   <ValidationErrors field="username" />   -> inline list for one field
 *   <ValidationErrors />                    -> general summary list
 *   <ValidationErrors opening="<div>" closing="</div>" /> -> custom wrappers
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
      <ul className="my-3 space-y-1 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {fieldErrors.map((error, index) => (
          <li key={index}>{error}</li>
        ))}
      </ul>
    );
  }

  const all = Object.values(errors).flat();
  if (all.length === 0) return null;

  if (opening !== undefined || closing !== undefined) {
    const Open = opening ?? '<ul class="my-3 space-y-1 text-sm text-destructive">';
    const Close = closing ?? "</ul>";
    return (
      <div>
        <div dangerouslySetInnerHTML={{ __html: Open }} />
        {all.map((error, index) => (
          <div key={index} dangerouslySetInnerHTML={{ __html: error }} />
        ))}
        <div dangerouslySetInnerHTML={{ __html: Close }} />
      </div>
    );
  }

  return (
    <ul className="my-3 space-y-1 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {all.map((error, index) => (
        <li key={index} dangerouslySetInnerHTML={{ __html: error }} />
      ))}
    </ul>
  );
}
