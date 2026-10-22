"use client";

import type { ChangeEvent } from "react";
import { BASE_URL } from "@/engine/config";
export function PerPageSelect({
  options,
  selected,
}: {
  options: number[];
  selected: number;
}) {
  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;

  const setPerPage = (event: ChangeEvent<HTMLSelectElement>) => {
    window.location.href = `${base}administrators/set_per_page/${event.target.value}`;
  };

  return (
    <select
      name="per_page"
      value={selected}
      onChange={setPerPage}
      className="h-8 rounded-md border border-input bg-background px-2 py-0 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      {options.map((option, index) => (
        <option key={index} value={index}>
          {option}
        </option>
      ))}
    </select>
  );
}

export default PerPageSelect;
