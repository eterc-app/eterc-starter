"use client";

import type { ReactNode } from "react";

/** 404 page — port of modules/templates/views/error_404.php. */
export function Error404() {
  return (
    <div className="container-sm">
      <div className="text-center mt-7">
        <h1>404</h1>
        <h2>Page Not Found</h2>
        <p>Sorry, the page you&apos;re looking for doesn&apos;t exist or has been moved.</p>
        <div className="mt-3">
          <a href="/" className="button">
            Go to Homepage
          </a>{" "}
          <button type="button" className="button alt" onClick={() => history.back()}>
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}

/** Generic framework error page (403 / 500 / ...). */
export function ErrorPage({
  status,
  message,
  children,
}: {
  status: number;
  message?: string;
  children?: ReactNode;
}) {
  return (
    <div className="container-sm">
      <div className="text-center mt-7">
        <h1>{status}</h1>
        <h2>{status === 403 ? "Forbidden" : "Something went wrong"}</h2>
        <p>{message || "The request could not be completed."}</p>
        {children}
        <div className="mt-3">
          <a href="/" className="button">
            Go to Homepage
          </a>{" "}
          <button type="button" className="button alt" onClick={() => history.back()}>
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}
