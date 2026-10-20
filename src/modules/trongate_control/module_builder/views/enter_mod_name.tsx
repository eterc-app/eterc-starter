"use client";

import type { FormEvent } from "react";

/**
 * Step 1 — port of module_builder/views/enter_mod_name.php.
 * Markup and copy preserved; the form is handled by ModuleBuilderWizard.
 */
export function EnterModNameStep({
  onSubmit,
  busy,
  error,
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  error?: string;
}) {
  return (
    <div className="center-stage">
      <div className="mt-1">Enter Module Name (singular)</div>
      <form
        action="#"
        id="enter-mod-name-form"
        className="highlight-errors"
        onSubmit={onSubmit}
      >
        <div className="mt-1">
          <input type="text" name="mod_name" autoComplete="off" />
        </div>
        {error ? <p style={{ color: "#b00020" }}>{error}</p> : null}
        <div className="mt-1">
          <button disabled={busy}>Submit</button>
        </div>
      </form>
    </div>
  );
}
