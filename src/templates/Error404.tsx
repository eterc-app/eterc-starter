"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** 404 page — port of modules/templates/views/error_404.php. */
export function Error404() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-lg rounded-xl border bg-card p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Eterc
        </p>
        <h1 className="mt-3 text-6xl font-bold tracking-tight">404</h1>
        <h2 className="mt-2 text-xl font-semibold">Page Not Found</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Sorry, the page you&apos;re looking for doesn&apos;t exist or has been
          moved.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Button asChild>
            <a href="/">Go to Homepage</a>
          </Button>
          <Button type="button" variant="outline" onClick={() => history.back()}>
            Go Back
          </Button>
        </div>
      </div>
    </main>
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
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-lg rounded-xl border bg-card p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Eterc
        </p>
        <h1 className="mt-3 text-6xl font-bold tracking-tight">{status}</h1>
        <h2 className="mt-2 text-xl font-semibold">
          {status === 403 ? "Forbidden" : "Something went wrong"}
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          {message || "The request could not be completed."}
        </p>
        {children}
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Button asChild>
            <a href="/">Go to Homepage</a>
          </Button>
          <Button type="button" variant="outline" onClick={() => history.back()}>
            Go Back
          </Button>
        </div>
      </div>
    </main>
  );
}
