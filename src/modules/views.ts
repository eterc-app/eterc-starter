import { register_views } from "@/engine/views-registry";
import { views as welcomeViews } from "./welcome/views";
import { views as setupViews } from "./setup/views";
import { views as loginViews } from "./login/views";
import { views as administratorsViews } from "./eterc_administrators/views";
import { views as controlViews } from "./eterc_control/views";
import { views as paginationViews } from "./pagination/views";
import { views as imageUploaderViews } from "./image_uploader/views";
import { views as dbViews } from "./db/views";
import { views as moduleRelationsViews } from "./module_relations/views";
import { views as languageViews } from "./language/views";
import { views as moduleBuilderViews } from "./eterc_control/module_builder/views";
import { views as imageUploaderBuilderViews } from "./eterc_control/image_uploader_builder/views";
import { views as moduleRelationsBuilderViews } from "./eterc_control/module_relations_builder/views";
import { views as propertiesBuilderViews } from "./eterc_control/properties_builder/views";
import { views as pluralMakerViews } from "./eterc_control/plural_maker/views";
import { views as queryBuilderViews } from "./eterc_control/query_builder/views";
import { views as siteBuilderViews } from "./eterc_control/site_builder/views";

// Generated modules (Flo) self-register their view maps when this index is
// imported; Flo rewrites it whenever a module is generated.
import "@/modules/generated";
register_views(welcomeViews);
register_views(setupViews);
register_views(loginViews);
register_views(administratorsViews);
register_views(controlViews);
register_views(paginationViews);
register_views(imageUploaderViews);
register_views(dbViews);
register_views(moduleRelationsViews);
register_views(languageViews);
register_views(moduleBuilderViews);
register_views(imageUploaderBuilderViews);
register_views(moduleRelationsBuilderViews);
register_views(propertiesBuilderViews);
register_views(pluralMakerViews);
register_views(queryBuilderViews);
register_views(siteBuilderViews);
