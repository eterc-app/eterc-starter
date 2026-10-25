"use client";

import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import { etSubmit } from "@/app/actions";
import { useConfirm } from "@/components/app/ConfirmDialog";
import { Button } from "@/components/ui/button";

/**
 * EtButton — button that triggers a module method (MX post).
 * The reply replaces the button subtree.
 */
export function EtButton({
  action,
  params = [],
  children,
  className,
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
  const { confirm, dialog: confirm_dialog } = useConfirm();

  const handleClick = async () => {
    if (confirmMessage) {
      const confirmed = await confirm({
        title: "Confirm action",
        description: confirmMessage,
        confirmLabel: "Continue",
        tone: "default",
      });
      if (!confirmed) return;
    }
    const formData = new FormData();
    formData.set("_et_action", action);
    formData.set("_et_params", JSON.stringify(params));

    startTransition(async () => {
      const result = await etSubmit(formData);
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
      <Button
        type="button"
        variant="outline"
        className={className}
        onClick={() => void handleClick()}
        disabled={isPending}
      >
        {children}
      </Button>
      {errorMessage ? (
        <p className="text-sm font-medium text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}
      {confirm_dialog}
    </>
  );
}
