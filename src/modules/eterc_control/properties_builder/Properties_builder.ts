import type { ReactNode } from "react";
import { Eterc } from "@/engine/controller";
import { BASE_URL, ENV } from "@/engine/config";
import { EtHttpError } from "@/engine/signals";
import { redirect } from "@/engine/Url";
import type { Eterc_security } from "@/modules/eterc_security/Eterc_security";

/**
 * Properties_builder — port of
 * modules/eterc_control/properties_builder/Properties_builder.php.
 *
 * The PHP page was a standalone document loaded into the Flo iframe overlay:
 *
 *   GET /eterc_control-properties_builder/web
 *
 * Its CSS/fonts/images live in the public module-assets folder:
 *
 *   public/eterc_control-properties_builder_module/
 *
 * The interactive builder itself is a React client component
 * (PropertiesBuilder.tsx); it talks to the sibling `properties` service
 * through the port's JSON API:
 *
 *   /api/xhr/eterc_control-properties/get_fields_info
 *   /api/xhr/eterc_control-properties/get_address_types
 *   /api/xhr/eterc_control-properties/get_address_data
 *
 * Deviations:
 *  - the original only defined web(). The port's control-panel dashboard links
 *    to /eterc_control-properties_builder (no method), so index() is a
 *    port-only redirect to /web;
 *  - the dev-only gate raises 403 instead of calling evo's disabled response
 *    (HTML is not a valid reply for this page's data endpoints), matching the
 *    sibling builders;
 *  - the page is rendered as a full standalone view rather than through the
 *    admin theme, exactly like the original iframe document (and like the
 *    ported query_builder page).
 */
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
   * Port-only entry point for the control-panel dashboard link.
   * Redirects to web() so the page's `usingWebApp` detection (last URL
   * segment === 'web') and the original postMessage protocol keep working.
   */
  index(): never {
    this.securityService().make_sure_allowed();
    redirect("eterc_control-properties_builder/web");
  }

  /**
   * Render the Properties Builder interface (PHP: web()).
   *
   * Entry point for the iframe overlay. The React component auto-detects the
   * 'web' URL segment to enable postMessage-based communication with the
   * parent window.
   */
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
