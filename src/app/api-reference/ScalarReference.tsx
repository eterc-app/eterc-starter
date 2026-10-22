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
    --scalar-font-code: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    --scalar-radius: 4px;
    --scalar-background-1: #ffffff;
    --scalar-background-2: #f7f7f8;
    --scalar-background-3: #efeff1;
    --scalar-background-accent: #f4f4f5;
    --scalar-color-1: #18181b;
    --scalar-color-2: #52525b;
    --scalar-color-3: #71717a;
    --scalar-color-accent: #18181b;
    --scalar-border-color: #e4e4e7;
    --scalar-button-1: #18181b;
    --scalar-button-1-hover: #3f3f46;
    --scalar-button-1-color: #ffffff;
    --scalar-sidebar-background-1: #fafafa;
    --scalar-sidebar-search-background: #f4f4f5;
  }

  .scalar-host .references-layout {
    min-height: 100% !important;
    --full-height: calc(100dvh - 48px) !important;
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
