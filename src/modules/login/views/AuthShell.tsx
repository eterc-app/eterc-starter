import type { ReactNode } from "react";
import NextImage from "next/image";
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
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-5">
      <Card
        className={`w-full max-w-md border-border/70 bg-card shadow-none ${className ?? ""}`}
      >
        <CardHeader className="text-center">
          <NextImage
            src="/company-logo.png"
            alt="Eterc"
            width={48}
            height={48}
            className="mx-auto mb-3 size-12 rounded-lg object-cover"
            priority
          />
          <CardTitle className="text-lg font-semibold tracking-[-0.01em]">{title}</CardTitle>
          {description ? (
            <CardDescription className="text-[12px]">{description}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  );
}
