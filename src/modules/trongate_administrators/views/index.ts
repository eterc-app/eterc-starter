import type { TgViewComponent } from "@/engine/views-registry";
import Create from "./create";
import DeleteConf from "./delete_conf";
import Manage from "./manage";
import NotFound from "./not_found";
import Show from "./show";
import UpdatePassword from "./update_password";

/**
 * View registration map for the trongate_administrators module — keys are
 * "{module}/{view_file}" and match the PHP view filenames under
 * modules/trongate_administrators/views/.
 */
export const views: Record<string, TgViewComponent> = {
  "trongate_administrators/create": Create,
  "trongate_administrators/delete_conf": DeleteConf,
  "trongate_administrators/manage": Manage,
  "trongate_administrators/not_found": NotFound,
  "trongate_administrators/show": Show,
  "trongate_administrators/update_password": UpdatePassword,
};
