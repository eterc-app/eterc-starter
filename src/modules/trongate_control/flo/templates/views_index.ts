/**
 * Generated view registration map — port of
 * site_builder/views/donor_views_index.php behaviour.
 */
export const VIEWS_INDEX_TEMPLATE = `import type { TgViewComponent } from "@/engine/views-registry";
import Manage from "./manage";
import Create from "./create";
import Show from "./show";
import DeleteConf from "./delete_conf";
import NotFound from "./not_found";
<?php if (has_searchable): ?>
import SearchModal from "./search_modal";
<?php endif; ?>

/**
 * View registration map for the generated <?= module_folder_name ?> module.
 */
export const views: Record<string, TgViewComponent> = {
  "<?= module_folder_name ?>/manage": Manage,
  "<?= module_folder_name ?>/create": Create,
  "<?= module_folder_name ?>/show": Show,
  "<?= module_folder_name ?>/delete_conf": DeleteConf,
  "<?= module_folder_name ?>/not_found": NotFound,
<?php if (has_searchable): ?>
  "<?= module_folder_name ?>/search_modal": SearchModal,
<?php endif; ?>
};
`;
