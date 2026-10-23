import type { ControllerCtor } from "./controller";

// Side-effect import: registers the `eterc_security` sync service so
// controllers can use `this.eterc_security` (the admin auth guard).
import "@/modules/eterc_security";

// Generated modules (Flo) self-register their controller loaders and views via
// this static index; Flo rewrites it whenever a module is generated.
import { generatedControllerLoaders } from "@/modules/generated";

export const controllerLoaders: Record<
  string,
  () => Promise<{ default: ControllerCtor }>
> = {
  welcome: () => import("@/modules/welcome/Welcome"),
  setup: () => import("@/modules/setup/Setup"),
  login: () => import("@/modules/login/Login"),
  system_api: () => import("@/modules/system_api/System_api"),
  cms_api: () => import("@/modules/cms_api/Cms_api"),
  cms_admin: () => import("@/modules/cms_admin/Cms_admin"),
  pagination: () => import("@/modules/pagination/Pagination"),
  image_uploader: () => import("@/modules/image_uploader/Image_uploader"),
  db: () => import("@/modules/db/Db"),
  module_relations: () => import("@/modules/module_relations/Module_relations"),
  "eterc_control-module_builder": () =>
    import("@/modules/eterc_control/module_builder/Module_builder"),
  "eterc_control-properties": () =>
    import("@/modules/eterc_control/properties/Properties"),
  "eterc_control-properties_builder": () =>
    import("@/modules/eterc_control/properties_builder/Properties_builder"),
  "eterc_control-flo": () => import("@/modules/eterc_control/flo/Flo"),
  "eterc_control-evo": () => import("@/modules/eterc_control/evo/Evo"),
  "eterc_control-image_uploader_builder": () =>
    import("@/modules/eterc_control/image_uploader_builder/Image_uploader_builder"),
  "eterc_control-module_relations_builder": () =>
    import("@/modules/eterc_control/module_relations_builder/Module_relations_builder"),
  "eterc_control-plural_maker": () =>
    import("@/modules/eterc_control/plural_maker/Plural_maker"),
  "eterc_control-query_builder": () =>
    import("@/modules/eterc_control/query_builder/Query_builder"),
  "eterc_control-site_builder": () =>
    import("@/modules/eterc_control/site_builder/Site_builder"),
  eterc_administrators: () =>
    import("@/modules/eterc_administrators/Eterc_administrators"),
  eterc_control: () =>
    import("@/modules/eterc_control/Eterc_control"),
  ...generatedControllerLoaders,
};
