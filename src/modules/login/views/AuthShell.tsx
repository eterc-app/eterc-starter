import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Shared Eterc authentication surface. Built from shadcn Card primitives and
 * Tailwind utilities so every login/reset variant shares one visual language.
 */
export function AuthShell({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 p-5">
      <Card
        className={`w-full max-w-md border-primary/30 bg-card/95 shadow-2xl backdrop-blur ${className ?? ""}`}
      >
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold tracking-tight">{title}</CardTitle>
          {description ? (
            <CardDescription className="text-sm">{description}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  );
}
