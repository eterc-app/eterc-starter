import type { EtViewComponent } from "@/engine/views-registry";
import Create from "./create";
import DeleteConf from "./delete_conf";
import Manage from "./manage";
import NotFound from "./not_found";
import Show from "./show";
import UpdatePassword from "./update_password";
export const views: Record<string, EtViewComponent> = {
  "eterc_administrators/create": Create,
  "eterc_administrators/delete_conf": DeleteConf,
  "eterc_administrators/manage": Manage,
  "eterc_administrators/not_found": NotFound,
  "eterc_administrators/show": Show,
  "eterc_administrators/update_password": UpdatePassword,
};
