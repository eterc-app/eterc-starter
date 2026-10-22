"use client";

import { useEtUi } from "./EtUiProvider";

/**
 * Flashdata — port of the flashdata module's rendering.
 * Default wrapper: <p style="color: green;">…</p>
 */
export function Flashdata() {
  const { flash } = useEtUi();
  if (!flash || flash.length === 0) return null;

  return (
    <>
      {flash.map((message, index) => (
        <p key={index} className="font-medium text-green-600">
          {message}
        </p>
      ))}
    </>
  );
}
