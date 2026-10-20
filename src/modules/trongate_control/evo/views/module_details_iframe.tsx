"use client";

import { useEffect, type ReactNode } from "react";
import type { TgViewProps } from "@/engine/views-registry";

/**
 * Details iframe body — port of evo/views/module_details_iframe.php.
 *
 * The PHP file was a standalone document. In the port the outer document,
 * <base> and close header are provided by ModuleDetailsTemplate; this view
 * renders the caller-supplied content and reproduces the localStorage seeding
 * script.
 */
export default function EvoModuleDetailsIframe({ data }: TgViewProps) {
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
