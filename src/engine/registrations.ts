import type { ControllerCtor } from "./controller";

// Side-effect import: registers the `trongate_security` sync service so
// controllers can use `this.trongate_security` (the admin auth guard).
import "@/modules/trongate_security";

// Generated modules (Flo) self-register their controller loaders and views via
// this static index; Flo rewrites it whenever a module is generated.
import { generatedControllerLoaders } from "@/modules/generated";

/**
 * Controller registry — the port's equivalent of the PHP autoloader's module
 * discovery. Keys are lower-case module names ("{module}" addressing); the
 * control panel's generators append entries here (and under ./generated).
 *
 * Child modules use the "parent-child" form (e.g. "trongate_control-flo").
 */

export const controllerLoaders: Record<
  string,
  () => Promise<{ default: ControllerCtor }>
> = {
  welcome: () => import("@/modules/welcome/Welcome"),
  setup: () => import("@/modules/setup/Setup"),
  login: () => import("@/modules/login/Login"),
  pagination: () => import("@/modules/pagination/Pagination"),
  image_uploader: () => import("@/modules/image_uploader/Image_uploader"),
  db: () => import("@/modules/db/DbAdmin"),
  module_relations: () => import("@/modules/module_relations/ModuleRelations"),
  "trongate_control-module_builder": () =>
    import("@/modules/trongate_control/module_builder/Module_builder"),
  "trongate_control-properties": () =>
    import("@/modules/trongate_control/properties/Properties"),
  "trongate_control-properties_builder": () =>
    import("@/modules/trongate_control/properties_builder/Properties_builder"),
  "trongate_control-flo": () => import("@/modules/trongate_control/flo/Flo"),
  "trongate_control-evo": () => import("@/modules/trongate_control/evo/Evo"),
  "trongate_control-image_uploader_builder": () =>
    import("@/modules/trongate_control/image_uploader_builder/Image_uploader_builder"),
  "trongate_control-module_relations_builder": () =>
    import("@/modules/trongate_control/module_relations_builder/Module_relations_builder"),
  "trongate_control-plural_maker": () =>
    import("@/modules/trongate_control/plural_maker/Plural_maker"),
  "trongate_control-query_builder": () =>
    import("@/modules/trongate_control/query_builder/Query_builder"),
  "trongate_control-site_builder": () =>
    import("@/modules/trongate_control/site_builder/Site_builder"),
  trongate_administrators: () =>
    import("@/modules/trongate_administrators/TrongateAdministrators"),
  trongate_control: () =>
    import("@/modules/trongate_control/Trongate_control"),
  ...generatedControllerLoaders,
};
