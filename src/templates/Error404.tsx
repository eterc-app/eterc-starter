"use client";

import type { ReactNode } from "react";
import NextImage from "next/image";
import { Button } from "@/components/ui/button";

function ErrorSurface({
  status,
  title,
  message,
  children,
}: {
  status: string;
  title: string;
  message: string;
  children?: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-8 text-center shadow-none sm:p-10">
        <NextImage
          src="/company-logo.png"
          alt="Eterc"
          width={44}
          height={44}
          className="mx-auto size-11 rounded-lg border border-border object-cover"
          priority
        />
        <p className="type-headline mt-4">Error</p>
        <h1 className="type-title mt-1">{status}</h1>
        <h2 className="mt-2 text-base font-semibold">{title}</h2>
        <p className="mt-3 text-sm text-muted-foreground">{message}</p>
        {children}
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Button asChild>
            <a href="/">Go home</a>
          </Button>
          <Button type="button" variant="outline" onClick={() => history.back()}>
            Go back
          </Button>
        </div>
      </div>
    </main>
  );
}

export function Error404() {
  return (
    <ErrorSurface
      status="404"
      title="Page not found"
      message="The page you are looking for does not exist or has been moved."
    />
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
    <ErrorSurface
      status={String(status)}
      title={status === 403 ? "Forbidden" : "Something went wrong"}
      message={message || "The request could not be completed."}
    >
      {children}
    </ErrorSurface>
  );
}
