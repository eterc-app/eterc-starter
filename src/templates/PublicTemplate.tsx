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
    <div className="container">
      <div className="text-center">{children}</div>
    </div>
  );
}
