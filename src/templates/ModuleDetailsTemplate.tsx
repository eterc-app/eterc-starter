"use client";

import type { ReactNode } from "react";

/** Module details page — port of modules/templates/views/module_details.php. */
export function ModuleDetailsTemplate({
  children,
  afterCloseUrl = "",
  afterCloseWidth = "",
  afterCloseHeight = "",
}: {
  children: ReactNode;
  afterCloseUrl?: string;
  afterCloseWidth?: string;
  afterCloseHeight?: string;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[#cae5fe] text-[#2d2d2d] [&_h1]:mt-0 [&_h1]:text-center [&_h1]:text-3xl [&_p]:text-center [&_td]:align-top [&_table]:bg-white">
      <header className="fixed inset-x-0 top-0 z-[1000] bg-[#ff744a] px-3 py-1.5 text-right text-lg font-bold text-[#eee]">
        <button
          type="button"
          className="cursor-pointer border-0 bg-transparent p-0 text-inherit"
          aria-label="Close"
          onClick={() =>
            window.parent.postMessage(
              `reload_iframe:${afterCloseUrl}|${afterCloseWidth}|${afterCloseHeight}`,
              "*"
            )
          }
        >
          &times;
        </button>
      </header>
      <main className="mt-12">{children}</main>
    </div>
  );
}
