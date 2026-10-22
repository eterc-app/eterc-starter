/**
 * View registration template.
 */
export const VIEWS_INDEX_TEMPLATE = `import type { EtViewComponent } from "@/engine/views-registry";
import Manage from "./manage";
import Create from "./create";
import Show from "./show";
import DeleteConf from "./delete_conf";
import NotFound from "./not_found";
{{#if has_searchable}}
import SearchModal from "./search_modal";
{{/if}}

/**
 * View registration map for the generated {{{module_folder_name}}} module.
 */
export const views: Record<string, EtViewComponent> = {
  "{{{module_folder_name}}}/manage": Manage,
  "{{{module_folder_name}}}/create": Create,
  "{{{module_folder_name}}}/show": Show,
  "{{{module_folder_name}}}/delete_conf": DeleteConf,
  "{{{module_folder_name}}}/not_found": NotFound,
{{#if has_searchable}}
  "{{{module_folder_name}}}/search_modal": SearchModal,
{{/if}}
};
`;
