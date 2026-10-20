import { siteUrl } from "@/engine/url";
import type { TgViewProps } from "@/engine/views-registry";

/**
 * Evo module manager — port of evo/views/module_manager.php.
 *
 * Labels are preserved. All three wizards are now ported; the relation and
 * image-uploader entries point at their dedicated builder modules.
 */
export default function EvoModuleManager(_props: TgViewProps) {
  return (
    <div className="container">
      <h1>Module Manager</h1>
      <ul className="evo-menu">
        <li>
          <a
            href={siteUrl("trongate_control-module_builder/enter_mod_name")}
          >
            Create Module
          </a>
        </li>
        <li>
          <a href={siteUrl("trongate_control-module_relations_builder")}>
            Create Module Relation
          </a>
        </li>
        <li>
          <a href={siteUrl("trongate_control-image_uploader_builder")}>
            Add Image Uploader
          </a>
        </li>
      </ul>
    </div>
  );
}

export { EvoModuleManager };
