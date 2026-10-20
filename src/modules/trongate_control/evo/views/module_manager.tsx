import { site_url } from "@/engine/Url";
import type { TgViewProps } from "@/engine/views-registry";
import { Button } from "@/components/ui/button";

/**
 * Evo module manager — port of evo/views/module_manager.php.
 *
 * Labels are preserved. All three wizards are now ported; the relation and
 * image-uploader entries point at their dedicated builder modules.
 */
export default function EvoModuleManager(_props: TgViewProps) {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
      <div className="flex flex-col items-start gap-2">
        <Button asChild variant="outline">
          <a href={site_url("trongate_control-module_builder/enter_mod_name")}>
            Create Module
          </a>
        </Button>
        <Button asChild variant="outline">
          <a href={site_url("trongate_control-module_relations_builder")}>
            Create Module Relation
          </a>
        </Button>
        <Button asChild variant="outline">
          <a href={site_url("trongate_control-image_uploader_builder")}>
            Add Image Uploader
          </a>
        </Button>
      </div>
    </div>
  );
}

export { EvoModuleManager };
