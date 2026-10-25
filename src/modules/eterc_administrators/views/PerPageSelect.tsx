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

export default PerPageSelect;
