import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-4", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="type-headline">{eyebrow}</p> : null}
        <h1 className={cn("type-title", eyebrow && "mt-1")}>{title}</h1>
        {description ? (
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
    </header>
  );
}
