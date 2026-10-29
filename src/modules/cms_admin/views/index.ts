import type { EtViewComponent } from "@/engine/views-registry";
import CmsDashboard from "./dashboard";
import DataStudio from "./data";
import AccessStudio from "./access";
import Profile from "./profile";
import ProjectSettings from "./settings";

export const views: Record<string, EtViewComponent> = {
  "cms_admin/dashboard": CmsDashboard,
  "cms_admin/data": DataStudio,
  "cms_admin/access": AccessStudio,
  "cms_admin/profile": Profile,
  "cms_admin/settings": ProjectSettings,
};
