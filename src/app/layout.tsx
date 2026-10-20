import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Eterc",
  description: "A TypeScript port of the Trongate framework for Next.js",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <link rel="stylesheet" href="/css/trongate-icons.css" />
        <link rel="stylesheet" href="/css/trongate.css" />
        <link rel="stylesheet" href="/templates_module/css/admin.css" />
        {children}
      </body>
    </html>
  );
}
