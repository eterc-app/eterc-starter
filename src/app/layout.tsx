import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: "Eterc",
  description:
    "Eterc is a PHP-faithful TypeScript framework for Next.js with PHP-compatible routing and modules.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster richColors />
      </body>
    </html>
  );
}
