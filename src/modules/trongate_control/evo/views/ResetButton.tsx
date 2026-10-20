"use client";

import { useState } from "react";
import { BASE_URL } from "@/engine/config";

const BASE = BASE_URL.endsWith("/") ? BASE_URL : BASE_URL + "/";

/**
 * Shared reset control for Evo views.
 *
 * The PHP views called the global `doReset()` from flo.js, which posted to
 * `trongate_control-evo/reset` and reloaded the Flo home menu. This component
 * keeps the same contract but uses the port's JSON API:
 *
 *   POST /api/xhr/trongate_control-evo/reset
 *
 * Inside the Flo iframe it asks the launcher to reopen Flo; outside it
 * navigates to the Evo home page.
 */
export function ResetButton({
  label = "Okay",
  className,
  afterHref = `${BASE}trongate_control-evo/home`,
}: {
  label?: string;
  className?: string;
  afterHref?: string;
}) {
  const [busy, setBusy] = useState(false);

  const reset = async () => {
    setBusy(true);

    try {
      await fetch(`${BASE}api/xhr/trongate_control-evo/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    } catch {
      /* Best effort: still return the user to the menu. */
    }

    if (window.parent !== window) {
      window.parent.postMessage("reset", "*");
      return;
    }

    window.location.href = afterHref;
  };

  return (
    <button
      type="button"
      className={className}
      onClick={reset}
      disabled={busy}
    >
      {busy ? "Resetting..." : label}
    </button>
  );
}

export default ResetButton;
