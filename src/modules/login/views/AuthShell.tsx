import type { ReactNode } from "react";
import NextImage from "next/image";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";

/**
 * Shared Eterc authentication surface. Every login/reset variant uses the same
 * neutral canvas, white card, and black primary action as the admin workspace.
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
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-5">
      <Card
        className={`w-full max-w-[440px] border-border bg-card shadow-none ${className ?? ""}`}
      >
        <CardHeader className="justify-items-center text-center">
          <NextImage
            src="/company-logo.png"
            alt="Eterc"
            width={44}
            height={44}
            className="mb-2 size-11 rounded-lg border border-border object-cover"
            priority
          />
          <h1 className="text-lg leading-snug font-medium">{title}</h1>
          {description ? (
            <CardDescription>{description}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Eterc CMS · Private by default
      </p>
    </main>
  );
}
