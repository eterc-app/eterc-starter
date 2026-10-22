import type { ReactNode } from "react";
export function PublicTemplate({
  children,
  pageTitle,
}: {
  children: ReactNode;
  pageTitle?: string;
}) {
  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="text-center">
        {pageTitle ? <h1 className="sr-only">{pageTitle}</h1> : null}
        {children}
      </div>
    </main>
  );
}
