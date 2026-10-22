"use client";

import { useState } from "react";
import { BASE_URL } from "@/engine/config";
import { Button } from "@/components/ui/button";

const BASE = BASE_URL.endsWith("/") ? BASE_URL : BASE_URL + "/";
export function ResetButton({
  label = "Okay",
  className,
  afterHref = `${BASE}control/evo/home`,
}: {
  label?: string;
  className?: string;
  afterHref?: string;
}) {
  const [busy, setBusy] = useState(false);

  const reset = async () => {
    setBusy(true);

    try {
      await fetch(`${BASE}api/xhr/eterc_control-evo/reset`, {
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
    <Button
      type="button"
      variant="outline"
      className={className}
      onClick={reset}
      disabled={busy}
    >
      {busy ? "Resetting..." : label}
    </Button>
  );
}

export default ResetButton;
