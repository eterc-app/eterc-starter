import type { EtViewComponent } from "@/engine/views-registry";
import ContentManager from "./content";
import DataStudio from "./data";
import AccessStudio from "./access";
import Profile from "./profile";
import ProjectSettings from "./settings";
import Appearance from "./appearance";

export const views: Record<string, EtViewComponent> = {
  "cms_admin/content": ContentManager,
  "cms_admin/data": DataStudio,
  "cms_admin/access": AccessStudio,
  "cms_admin/profile": Profile,
  "cms_admin/settings": ProjectSettings,
  "cms_admin/appearance": Appearance,
};
