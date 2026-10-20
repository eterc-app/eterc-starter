import type { ReactNode } from "react";

/** Public theme — port of modules/templates/views/public.php. */
export function PublicTemplate({
  children,
  pageTitle,
}: {
  children: ReactNode;
  pageTitle?: string;
}) {
  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted/40 px-4 py-14 sm:py-20">
      <div className="text-center">
        {pageTitle ? <h1 className="sr-only">{pageTitle}</h1> : null}
        {children}
      </div>
    </main>
  );
}
