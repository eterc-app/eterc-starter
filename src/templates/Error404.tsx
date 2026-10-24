"use client";

import type { ReactNode } from "react";
import NextImage from "next/image";
import { Button } from "@/components/ui/button";
export function Error404() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-lg rounded-lg border border-border/70 bg-card p-8 text-center shadow-none">
        <NextImage
          src="/company-logo.png"
          alt="Eterc"
          width={48}
          height={48}
          className="mx-auto size-12 rounded-lg object-cover"
          priority
        />
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.01em]">404</h1>
        <h2 className="mt-2 text-base font-semibold">Page Not Found</h2>
        <p className="mt-3 text-[13px] text-muted-foreground">
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
      <div className="w-full max-w-lg rounded-lg border border-border/70 bg-card p-8 text-center shadow-none">
        <NextImage
          src="/company-logo.png"
          alt="Eterc"
          width={48}
          height={48}
          className="mx-auto size-12 rounded-lg object-cover"
          priority
        />
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.01em]">{status}</h1>
        <h2 className="mt-2 text-base font-semibold">
          {status === 403 ? "Forbidden" : "Something went wrong"}
        </h2>
        <p className="mt-3 text-[13px] text-muted-foreground">
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
