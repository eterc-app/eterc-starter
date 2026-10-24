import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowLeft, FileJson2 } from "lucide-react";
import "@scalar/api-reference-react/style.css";
import { build_openapi_document } from "@/engine/api";
import { ScalarReference } from "./ScalarReference";

export const metadata: Metadata = {
  title: "API Reference | Eterc",
  description:
    "Browse and test the JSON API for this Eterc project with Scalar.",
};

const linkClasses =
  "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

async function ApiReferenceContent() {
  // API specs are read from the project on each request so newly generated or
  // edited modules appear without rebuilding the page.
  await connection();
  const openapi = build_openapi_document();
  return <ScalarReference document={openapi} />;
}

export default function ApiReferencePage() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-3 sm:px-4">
        <Link href="/admin" className={linkClasses}>
          <ArrowLeft className="size-3.5" />
          CMS admin
        </Link>
        <span aria-hidden="true" className="h-4 w-px bg-border" />
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-[12px] font-medium">API Reference</span>
          <span className="hidden text-[11px] text-muted-foreground md:inline">
            Generated from API fragments
          </span>
        </div>
        <a
          href="/api/openapi"
          target="_blank"
          rel="noreferrer"
          className={`${linkClasses} ml-auto`}
        >
          <FileJson2 className="size-3.5" />
          OpenAPI JSON
        </a>
      </header>

      <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground">
              Loading API reference…
            </div>
          }
        >
          <ApiReferenceContent />
        </Suspense>
      </main>
    </div>
  );
}
