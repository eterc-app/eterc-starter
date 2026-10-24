import { register_views } from "@/engine/views-registry";
import { views as welcomeViews } from "./welcome/views";
import { views as setupViews } from "./setup/views";
import { views as loginViews } from "./login/views";
import { views as administratorsViews } from "./eterc_administrators/views";
import { views as paginationViews } from "./pagination/views";
import { views as dbViews } from "./db/views";
import { views as mediaViews } from "./media/views";
import { views as cmsAdminViews } from "./cms_admin/views";

register_views(welcomeViews);
register_views(setupViews);
register_views(loginViews);
register_views(administratorsViews);
register_views(paginationViews);
register_views(dbViews);
register_views(mediaViews);
register_views(cmsAdminViews);
