"use client";

import { useTheme } from "next-themes";
import { Moon } from "lucide-react";
import { useSetNavbarMeta } from "@/components/app/PageActionsSlot";
import { Switch } from "@/components/ui/switch";

export default function Appearance() {
  const { resolvedTheme, setTheme } = useTheme();

  useSetNavbarMeta({
    section: "Workspace",
    title: "Appearance",
    icon: <Moon className="size-4" strokeWidth={1.75} />,
  });

  return (
    <div className="app-page max-w-3xl space-y-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">Appearance</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Customize how the admin workspace looks.
        </p>
      </div>

      <section className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">Dark theme</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Use a dark color scheme for the admin workspace.
          </p>
        </div>
        <Switch
          checked={resolvedTheme === "dark"}
          onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
          aria-label="Use dark theme"
        />
      </section>
    </div>
  );
}
