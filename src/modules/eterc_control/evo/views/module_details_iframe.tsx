"use client";

import { useEffect, type ReactNode } from "react";
import type { EtViewProps } from "@/engine/views-registry";
export default function EvoModuleDetailsIframe({ data }: EtViewProps) {
  const viewContent = data?.view_content as ReactNode;
  const localStorageItems = (data?.local_storage_items ?? {}) as Record<
    string,
    unknown
  >;

  useEffect(() => {
    for (const [key, value] of Object.entries(localStorageItems)) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* storage may be unavailable */
      }
    }
  }, [localStorageItems]);

  return <>{viewContent ?? null}</>;
}

export { EvoModuleDetailsIframe };
