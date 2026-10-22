import { ENV, ETERC_HOME_URL, ETERC_DOCS_URL } from "@/engine/config";
import { Button } from "@/components/ui/button";
export default function DefaultHomepage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-4">
      <span className="rounded-full border bg-background px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Eterc
      </span>
      <h1 className="mt-2">Enjoy Eterc!</h1>
      <h2 className="text-[15px] font-semibold tracking-[-0.01em]">
        The Next.js Framework
      </h2>
      <p className="max-w-xl text-muted-foreground">
        You have successfully installed Eterc. You&apos;re now ready to start
        building fast, efficient web applications.
      </p>

      <div className="mt-3 flex flex-col justify-center gap-2 sm:flex-row">
        {ENV === "dev" ? (
          <Button asChild>
            <a href="/administrators/manage">Admin Panel</a>
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
            View Documentation
          </a>
        </Button>
      </div>
    </div>
  );
}
