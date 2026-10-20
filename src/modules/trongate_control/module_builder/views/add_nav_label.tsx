"use client";

import type { FormEvent } from "react";

/**
 * Step 2 — port of module_builder/views/add_nav_label.php.
 */
export function AddNavLabelStep({
  recordNamePlural,
  onSubmit,
  busy,
  error,
}: {
  recordNamePlural: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  error?: string;
}) {
  return (
    <div className="center-stage">
      <div className="mt-1">Add Navigation Label</div>
      <form
        action="#"
        id="enter-nav-label-form"
        onSubmit={onSubmit}
      >
        <div className="mt-1">
          <input
            type="text"
            name="nav_label"
            defaultValue={`Manage ${recordNamePlural}`}
            autoComplete="off"
          />
        </div>
        {error ? <p style={{ color: "#b00020" }}>{error}</p> : null}
        <div className="mt-1">
          <button disabled={busy}>Submit</button>
        </div>
        <p>Submit empty value if not required</p>
      </form>
    </div>
  );
}
