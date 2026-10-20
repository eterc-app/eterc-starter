import { registerViews } from "@/engine/views-registry";
import { views as welcomeViews } from "./welcome/views";
import { views as setupViews } from "./setup/views";
import { views as loginViews } from "./login/views";
import { views as administratorsViews } from "./trongate_administrators/views";
import { views as controlViews } from "./trongate_control/views";
import { views as paginationViews } from "./pagination/views";
import { views as imageUploaderViews } from "./image_uploader/views";
import { views as dbViews } from "./db/views";
import { views as moduleRelationsViews } from "./module_relations/views";
import { views as languageViews } from "./language/views";
import { views as moduleBuilderViews } from "./trongate_control/module_builder/views";
import { views as imageUploaderBuilderViews } from "./trongate_control/image_uploader_builder/views";
import { views as moduleRelationsBuilderViews } from "./trongate_control/module_relations_builder/views";
import { views as propertiesBuilderViews } from "./trongate_control/properties_builder/views";
import { views as pluralMakerViews } from "./trongate_control/plural_maker/views";
import { views as queryBuilderViews } from "./trongate_control/query_builder/views";
import { views as siteBuilderViews } from "./trongate_control/site_builder/views";

// Generated modules (Flo) self-register their view maps when this index is
// imported; Flo rewrites it whenever a module is generated.
import "@/modules/generated";

/**
 * Central view registration — imports each module's view map so views can be
 * addressed as "{module}/{view_file}" (PHP parity). Generators append entries.
 */
registerViews(welcomeViews);
registerViews(setupViews);
registerViews(loginViews);
registerViews(administratorsViews);
registerViews(controlViews);
registerViews(paginationViews);
registerViews(imageUploaderViews);
registerViews(dbViews);
registerViews(moduleRelationsViews);
registerViews(languageViews);
registerViews(moduleBuilderViews);
registerViews(imageUploaderBuilderViews);
registerViews(moduleRelationsBuilderViews);
registerViews(propertiesBuilderViews);
registerViews(pluralMakerViews);
registerViews(queryBuilderViews);
registerViews(siteBuilderViews);
