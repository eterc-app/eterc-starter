"use client";

import type { FormEvent, ReactNode } from "react";
import { useRef, useState, useTransition } from "react";
import { etSubmit } from "@/app/actions";
import { useEtUi } from "./EtUiProvider";

/**
 * EtForm — form wrapper for module submissions.
 *
 * Submits through the etSubmit server action with Eterc-style metadata
 * (`{module}/{method}` addressing). The controller reply replaces the form
 * subtree.
 */

function queryFromLocation(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const result: Record<string, string> = {};
  new URLSearchParams(window.location.search).forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

export function EtForm({
  action,
  params = [],
  children,
  className,
  id,
  hidden = {},
  encType,
  autoComplete,
  acceptCharset,
}: {
  action: string;
  params?: Array<string | number>;
  children: ReactNode;
  className?: string;
  id?: string;
  hidden?: Record<string, string | number>;
  encType?: string;
  autoComplete?: string;
  acceptCharset?: string;
}) {
  const { csrf_token } = useEtUi();
  const [reply, setReply] = useState<ReactNode | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const submitter = (event.nativeEvent as SubmitEvent).submitter as
      | (HTMLElement & { name?: string; value?: string })
      | null;
    if (submitter?.name) {
      formData.set(submitter.name, submitter.value ?? "");
    }
    formData.set("_et_action", action);
    formData.set("_et_params", JSON.stringify(params));
    formData.set("_et_query", JSON.stringify(queryFromLocation()));

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
    <form
      ref={formRef}
      action="#"
      method="post"
      id={id}
      className={className}
      encType={encType}
      autoComplete={autoComplete}
      acceptCharset={acceptCharset}
      onSubmit={handleSubmit}
      aria-busy={isPending}
      data-pending={isPending ? "true" : undefined}
    >
      <input type="hidden" name="csrf_token" value={csrf_token} />
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={String(value)} />
      ))}
      {errorMessage ? (
        <p className="text-sm font-medium text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}
      {children}
    </form>
  );
}
