"use client";

import { useMemo } from "react";
import {
  ApiReferenceReact,
  type AnyApiReferenceConfiguration,
} from "@scalar/api-reference-react";
import type { OpenApiDocument } from "@/engine/api";

const customCss = `
  :root {
    --scalar-font: var(--font-inter), ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --scalar-font-code: var(--font-fira-mono), ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    --scalar-radius: 8px;
    --scalar-background-1: #ffffff;
    --scalar-background-2: #ededed;
    --scalar-background-3: #f5f5f5;
    --scalar-background-accent: #ededed;
    --scalar-color-1: #000000;
    --scalar-color-2: #666666;
    --scalar-color-3: #666666;
    --scalar-color-accent: #000000;
    --scalar-border-color: #d9d9d9;
    --scalar-button-1: #000000;
    --scalar-button-1-hover: #333333;
    --scalar-button-1-color: #ffffff;
    --scalar-sidebar-background-1: #ffffff;
    --scalar-sidebar-search-background: #f5f5f5;
  }

  .scalar-host .references-layout {
    min-height: 100% !important;
    --full-height: calc(100dvh - 64px) !important;
  }
`;

interface ScalarReferenceProps {
  document: OpenApiDocument;
}

export function ScalarReference({ document }: ScalarReferenceProps) {
  const configuration = useMemo<AnyApiReferenceConfiguration>(
    () => ({
      content: document,
      theme: "default",
      layout: "modern",
      showSidebar: true,
      hideDarkModeToggle: true,
      forceDarkModeState: "light",
      hideClientButton: true,
      showDeveloperTools: "never",
      telemetry: false,
      withDefaultFonts: false,
      persistAuth: true,
      customCss,
      // Scalar documents are bundled above, so this is used for test requests.
      // Same-origin credentials let a signed-in control-panel session call
      // protected endpoints without copying its token into the UI.
      customFetch: (input, init) =>
        fetch(input, {
          ...init,
          credentials: "include",
        }),
    }),
    [document]
  );

  return (
    <div className="scalar-host h-full min-h-0">
      <ApiReferenceReact configuration={configuration} />
    </div>
  );
}
