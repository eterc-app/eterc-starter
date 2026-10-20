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
    <div className="module-details-body">
      <header>
        <span
          className="close-btn"
          onClick={() =>
            window.parent.postMessage(
              `reload_iframe:${afterCloseUrl}|${afterCloseWidth}|${afterCloseHeight}`,
              "*"
            )
          }
        >
          &times;
        </span>
      </header>
      <main>{children}</main>
      <style jsx global>{`
        .module-details-body {
          background-color: #cae5fe;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          color: #2d2d2d;
        }
        .module-details-body header {
          background-color: #ff744a;
          color: #eee;
          text-align: right;
          font-weight: bold;
          font-size: 18px;
          padding: 6px 12px;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 1000;
        }
        .module-details-body main {
          margin-top: 48px;
        }
        .module-details-body h1 {
          text-align: center;
          margin-top: 0;
          font-size: 33px;
        }
        .module-details-body p {
          text-align: center;
        }
        .module-details-body table {
          background-color: #fff;
        }
        .module-details-body tr > td {
          vertical-align: top;
        }
        .module-details-body .close-btn {
          cursor: pointer;
        }
        .module-details-body .validation-error-report > div {
          font-size: 0.9em;
        }
      `}</style>
    </div>
  );
}
