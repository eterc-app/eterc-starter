import type { ReactNode } from "react";
import { Eterc } from "@/engine/controller";
import { BASE_URL, ENV } from "@/engine/config";
import { EtHttpError } from "@/engine/signals";
import { redirect } from "@/engine/Url";
import type { Eterc_security } from "@/modules/eterc_security/Eterc_security";
export default class Properties_builder extends Eterc {
  constructor(moduleName?: string | null) {
    super(moduleName);

    if (ENV.toLowerCase() !== "dev") {
      throw new EtHttpError(
        403,
        "The properties builder is only available when the application is running in development mode."
      );
    }
  }

  private securityService(): Eterc_security {
    return (this as unknown as { eterc_security: Eterc_security })
      .eterc_security;
  }

  /**
   * Entry point for the control-panel dashboard link.
   * Redirects to web() so the page's `usingWebApp` detection (last URL
   * segment === 'web') and the postMessage protocol keep working.
   */
  index(): never {
    this.securityService().make_sure_allowed();
    redirect("eterc_control-properties_builder/web");
  }
  async web(): Promise<ReactNode> {
    this.securityService().make_sure_allowed();

    const data = {
      viewModule: "properties_builder",
      viewFile: "home",
      pageTitle: "Properties Builder",
      api_base: "/api/xhr",
      base_url: BASE_URL,
    };

    return this.view("properties_builder/home", data);
  }
}
