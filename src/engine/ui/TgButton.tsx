"use client";

import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import { tgSubmit } from "@/app/actions";

/**
 * TgButton — port of buttons that trigger a module method (mx-post buttons).
 * The reply replaces the button subtree.
 */
export function TgButton({
  action,
  params = [],
  children,
  className = "button",
  confirmMessage,
}: {
  action: string;
  params?: Array<string | number>;
  children: ReactNode;
  className?: string;
  confirmMessage?: string;
}) {
  const [reply, setReply] = useState<ReactNode | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    if (confirmMessage && typeof window !== "undefined" && !window.confirm(confirmMessage)) {
      return;
    }
    const formData = new FormData();
    formData.set("_tg_action", action);
    formData.set("_tg_params", JSON.stringify(params));

    startTransition(async () => {
      const result = await tgSubmit(formData);
      if (result.kind === "node") {
        setErrorMessage(null);
        setReply(result.node);
      } else if (result.kind === "error") {
        setErrorMessage(result.message);
      }
    });
  };

  if (reply) {
    return <>{reply}</>;
  }

  return (
    <>
      <button type="button" className={className} onClick={handleClick} disabled={isPending}>
        {children}
      </button>
      {errorMessage ? (
        <p style={{ color: "red" }} role="alert">
          {errorMessage}
        </p>
      ) : null}
    </>
  );
}
