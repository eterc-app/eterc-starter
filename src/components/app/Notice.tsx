import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Notice({
  icon: Icon,
  children,
  tone = "neutral",
  className,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  tone?: "neutral" | "destructive" | "success" | "warning";
  className?: string;
}) {
  return (
    <div
      role={tone === "destructive" ? "alert" : "status"}
      className={cn(
        "flex gap-3 rounded-xl border border-border border-l-4 bg-card p-4 text-sm text-foreground",
        tone === "neutral" && "border-l-foreground",
        tone === "destructive" &&
          "border-l-destructive bg-destructive/5 text-destructive",
        tone === "success" && "border-l-success bg-success/5",
        tone === "warning" && "border-l-warning bg-warning/5",
        className
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tone === "neutral" && "text-foreground",
          tone === "destructive" && "text-destructive",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning"
        )}
        strokeWidth={1.75}
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
