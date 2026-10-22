"use client";

import { BASE_URL } from "@/engine/config";

/**
 * Flo trigger — floating button rendered inside the admin theme in dev.
 * Opens the Flo launcher page; the richer overlay trigger lives in
 * `flo/FloTrigger.tsx`.
 */
export function FlowTrigger() {
  const base = BASE_URL.endsWith("/") ? BASE_URL : BASE_URL + "/";

  return (
    <div id="flow-trigger-wrap">
      <a
        href={`${base}control/flo/home`}
        id="flow-trigger"
        title="Flo — code generator"
      >
        <img
          src={`${base}eterc_control_module/images/flo_button.png`}
          alt="Flo"
        />
      </a>
    </div>
  );
}
