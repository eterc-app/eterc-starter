"use client";

import type { ChangeEvent } from "react";
import { BASE_URL } from "@/engine/config";

/**
 * "Records Per Page" selector for the browse view.
 *
 * Navigates to {module}/set_per_page/{index}/{table} exactly like the inline
 * setPerPage() script of the administrators manage view; the controller stores
 * the selected index in the session and redirects back to the browser.
 */
export function PerPageSelector({
  options,
  selected,
  module,
  table,
}: {
  options: number[];
  selected: number;
  module: string;
  table: string;
}) {
  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;

  const setPerPage = (event: ChangeEvent<HTMLSelectElement>) => {
    window.location.href = `${base}${module}/set_per_page/${event.target.value}/${table}`;
  };

  return (
    <select
      name="per_page"
      value={selected}
      onChange={setPerPage}
      className="h-8 rounded-lg border border-input bg-card px-2.5 py-0 text-sm outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:shadow-[0_0_16px_-8px_var(--ring)]"
    >
      {options.map((option, index) => (
        <option key={index} value={index}>
          {option}
        </option>
      ))}
    </select>
  );
}
