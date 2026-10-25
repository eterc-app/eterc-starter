import NextImage from "next/image";
import {
  ArrowUpRight,
  BookOpen,
  Braces,
  Globe2,
  LockKeyhole,
} from "lucide-react";
import { ENV, ETERC_HOME_URL, ETERC_DOCS_URL } from "@/engine/config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function DefaultHomepage() {
  return (
    <div className="mx-auto max-w-3xl">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <NextImage
            src="/company-logo.png"
            alt="Eterc"
            width={36}
            height={36}
            className="size-9 rounded-lg border border-border object-cover"
            priority
          />
          <span>
            <span className="block text-sm font-semibold leading-5">Eterc</span>
            <span className="block text-xs leading-4 text-muted-foreground">
              CMS starter
            </span>
          </span>
        </div>
        <Badge variant="outline">
          <LockKeyhole className="size-3" strokeWidth={1.75} />
          Private by default
        </Badge>
      </header>

      <Card className="mt-10">
        <CardContent className="p-8 sm:p-10">
          <p className="type-headline">Installed</p>
          <h1 className="type-title mt-2">Enjoy Eterc</h1>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground">
            You have successfully installed Eterc. You&apos;re now ready to
            build fast, efficient web applications with collections, access
            control, and a private API.
          </p>

          <div className="mt-8 flex flex-col gap-2 sm:flex-row">
            {ENV === "dev" ? (
              <Button asChild>
                <a href="/admin">Open CMS admin</a>
              </Button>
            ) : (
              <Button asChild>
                <a href={ETERC_HOME_URL} target="_blank" rel="noreferrer">
                  Visit Eterc
                </a>
              </Button>
            )}
            <Button asChild variant="outline">
              <a href={ETERC_DOCS_URL} target="_blank" rel="noreferrer">
                <BookOpen className="size-4" strokeWidth={1.75} />
                Documentation
              </a>
            </Button>
          </div>

          <div className="mt-8 grid gap-3 border-t border-border pt-6 sm:grid-cols-2">
            <a
              href={ETERC_HOME_URL}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center gap-3 rounded-lg border border-border px-4 py-3 transition-colors hover:bg-surface-subtle"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                <Globe2 className="size-4" strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Website</span>
                <span className="block text-xs text-muted-foreground">
                  eterc.app
                </span>
              </span>
              <ArrowUpRight className="size-4 text-muted-foreground" />
            </a>
            <a
              href="/api-reference"
              target="_blank"
              rel="noreferrer"
              className="group flex items-center gap-3 rounded-lg border border-border px-4 py-3 transition-colors hover:bg-surface-subtle"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                <Braces className="size-4" strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">
                  API reference
                </span>
                <span className="block text-xs text-muted-foreground">
                  Endpoints and schemas
                </span>
              </span>
              <ArrowUpRight className="size-4 text-muted-foreground" />
            </a>
          </div>
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Next.js + SQLite · Built-in accounts
      </p>
    </div>
  );
}
