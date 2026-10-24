import type { ControllerCtor } from "./controller";

// Side-effect import: registers the `eterc_security` sync service so
// controllers can use `this.eterc_security` (the admin auth guard).
import "@/modules/eterc_security";

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
  media: () => import("@/modules/media/Media"),
  pagination: () => import("@/modules/pagination/Pagination"),
  db: () => import("@/modules/db/Db"),
  eterc_administrators: () =>
    import("@/modules/eterc_administrators/Eterc_administrators"),
};
