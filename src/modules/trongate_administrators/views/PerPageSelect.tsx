"use client";

import type { ChangeEvent } from "react";
import { BASE_URL } from "@/engine/config";

/**
 * "Records Per Page" selector — the interactive part of the manage view.
 *
 * Extracted into a client component so the manage view itself can stay a
 * server component (it renders the canonical pagination, which reads the
 * request context). Navigates to {module}/set_per_page/{index} exactly like
 * the PHP view's inline setPerPage() script.
 */
export function PerPageSelect({
  options,
  selected,
}: {
  options: number[];
  selected: number;
}) {
  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;

  const setPerPage = (event: ChangeEvent<HTMLSelectElement>) => {
    window.location.href = `${base}trongate_administrators/set_per_page/${event.target.value}`;
  };

  return (
    <select name="per_page" value={selected} onChange={setPerPage}>
      {options.map((option, index) => (
        <option key={index} value={index}>
          {option}
        </option>
      ))}
    </select>
  );
}

export default PerPageSelect;
