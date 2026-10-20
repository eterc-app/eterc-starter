"use client";

import { useTgUi } from "./TgUiProvider";

/**
 * Flashdata — port of the flashdata module's rendering.
 * Default wrapper: <p style="color: green;">…</p>
 */
export function Flashdata() {
  const { flash } = useTgUi();
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
