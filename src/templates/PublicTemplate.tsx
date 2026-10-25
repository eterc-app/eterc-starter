import type { ReactNode } from "react";
export function PublicTemplate({
  children,
  pageTitle,
}: {
  children: ReactNode;
  pageTitle?: string;
}) {
  return (
    <main className="min-h-screen bg-background px-4 py-10 sm:py-16">
      <div className="mx-auto w-full max-w-4xl">
        {pageTitle ? <h1 className="sr-only">{pageTitle}</h1> : null}
        {children}
      </div>
    </main>
  );
}
