import { site_url } from "@/engine/Url";
import type { TgViewProps } from "@/engine/views-registry";
import { Button } from "@/components/ui/button";

/**
 * Evo home menu — port of evo/views/home.php.
 *
 * The original list items called MX to swap `main`; the port uses ordinary
 * links because each Evo page is rendered inside the admin theme.
 */
export default function EvoHome(_props: TgViewProps) {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
      <div className="flex flex-col items-start gap-2">
        <Button asChild variant="outline">
          <a href={site_url("trongate_control-evo/module_manager")}>
            Module Manager
          </a>
        </Button>
        <Button asChild variant="outline">
          <a href={site_url("trongate_control-query_builder/home")}>
            Query Builder
          </a>
        </Button>
        <Button asChild variant="outline">
          <a href={site_url("trongate_control-evo/ask")}>Ask a Question</a>
        </Button>
      </div>
    </div>
  );
}

export { EvoHome };
