"use client";

import { useEtUi } from "./EtUiProvider";

/** Flashdata — renders one-shot flash messages. */
export function Flashdata() {
  const { flash } = useEtUi();
  if (!flash || flash.length === 0) return null;

  return (
    <>
      {flash.map((message, index) => (
        <p key={index} className="font-semibold text-success">
          {message}
        </p>
      ))}
    </>
  );
}
