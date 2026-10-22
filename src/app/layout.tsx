import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Eterc",
  description:
    "Eterc is a TypeScript-first framework for Next.js with file-based routing, modules, authentication, and code generators.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-background text-foreground">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster richColors />
      </body>
    </html>
  );
}
