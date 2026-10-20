import { createElement, type ReactNode } from "react";
import { Trongate } from "@/engine/controller";
import { ENV } from "@/engine/config";
import { post } from "@/engine/post";
import { getContext } from "@/engine/request-context";
import { sessionUnset } from "@/engine/session";
import { TgHttpError } from "@/engine/signals";
import type { TgTemplateData } from "@/engine/templates";
import { redirect, siteUrl } from "@/engine/url";
import type { TrongateSecurityService } from "@/modules/trongate_security/TrongateSecurityService";
import { registerViews } from "@/engine/views-registry";
import { FloGenerator } from "./FloGenerator";
import type { GenerationData, GenerationResult } from "./FloTypes";
import { FloTrigger } from "./FloTrigger";
import { views } from "./views";

registerViews(views);

/**
 * Flo — port of modules/trongate_control/flo/Flo.php.
 *
 * The PHP class was a thin shell around the site_builder donor pipeline:
 * `home()` rendered the Flo menu, while `draw_flow_trigger()` /
 * `draw_open_flo()` injected the launcher button into other pages.
 *
 * In this port Flo is the independent generator front-end. The launcher and
 * home page stay, and the controller exposes the generator through
 *
 *   POST /api/xhr/trongate_control-flo/generate
 *
 * so the React quick-generator can create a complete Next.js module without
 * going through the PHP wizard. Sibling builders are not modified.
 *
 * The generator itself is deliberately kept in FloGenerator; this controller
 * only handles request parsing, guards and page rendering.
 */
export default class Flo extends Trongate {
  constructor(moduleName?: string | null) {
    super(moduleName);

    if (ENV.toLowerCase() !== "dev") {
      throw new TgHttpError(
        403,
        "Flo is only available when the application is running in development mode."
      );
    }
  }

  private securityService(): TrongateSecurityService {
    return (this as unknown as { trongate_security: TrongateSecurityService })
      .trongate_security;
  }

  private generator(): FloGenerator {
    return new FloGenerator();
  }

  /** Port convenience: `/trongate_control-flo` → home. */
  index(): never {
    redirect("trongate_control-flo/home");
  }

  /** Render the Flo launcher / quick-generator page. */
  async home(): Promise<ReactNode> {
    this.securityService().make_sure_allowed();
    return this.renderHome();
  }

  /**
   * Render (but do not echo) the Flo trigger element.
   *
   * The PHP method returned an HTML string; the port returns a React node.
   * When `html` is supplied it is used verbatim, matching the optional
   * behaviour of draw_open_flo().
   */
  draw_flow_trigger(html?: string | null): ReactNode {
    return this.triggerNode(html ?? null);
  }

  /**
   * Return the "Open Flo" trigger element.
   *
   * PHP echoed the markup; the port returns the node so callers can embed it
   * in a React tree (there is no output buffer).
   */
  draw_open_flo(html?: string | null): ReactNode {
    return this.triggerNode(html ?? null);
  }

  private triggerNode(html: string | null): ReactNode {
    if (html !== null) {
      // PHP: `isset($html) ? $html : view(...)`; an empty string renders nothing.
      return html === ""
        ? null
        : createElement("div", {
            dangerouslySetInnerHTML: { __html: html },
          });
    }
    return createElement(FloTrigger);
  }

  /**
   * Generate a module from the current request.
   *
   * AJAX callers receive the JSON-friendly generation result (the API route
   * wraps it in its standard envelope); page requests are shown the home
   * page with the outcome.
   */
  async generate(): Promise<GenerationResult | Record<string, unknown> | ReactNode> {
    this.securityService().make_sure_allowed();

    const result = await this.run_generation(this.get_posted_values());
    const module_url =
      result.status === "success" && result.module_name
        ? siteUrl(`${result.module_name}/manage`)
        : "";

    if (getContext().isAjax) {
      return {
        ...result,
        ok: result.status === "success",
        module_url,
      };
    }

    return this.renderHome(result, module_url);
  }

  /**
   * Generator entry point for sibling callers (PHP: site_builder's
   * submit_generate_mod contract). Returns the result instead of rendering.
   */
  async submit_generate_mod(
    posted_values: GenerationData | null = null
  ): Promise<GenerationResult> {
    this.securityService().make_sure_allowed();
    return this.run_generation(posted_values ?? this.get_posted_values());
  }

  /**
   * Clear Flo's client-side wizard hints on the server side.
   *
   * The original cleared localStorage from the trigger script. The port keeps
   * the shared `evo_wizard` session key clean as well, mirroring Evo::reset().
   */
  async reset(): Promise<Record<string, unknown>> {
    this.securityService().make_sure_allowed();
    sessionUnset("evo_wizard");
    return { ok: true };
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private run_generation(data: GenerationData): GenerationResult {
    return this.generator().generate(data, {
      db: this.db,
    });
  }

  private renderHome(
    result: GenerationResult | null = null,
    module_url = ""
  ): Promise<ReactNode> {
    const generated = this.generator().list_modules().map((module) => ({
      ...module,
      label: module.nav_label || module.record_name_plural || module.module_name,
      href: siteUrl(`${module.module_name}/manage`),
    }));

    const data: TgTemplateData = {
      viewModule: "flo",
      viewFile: "home",
      pageTitle: "Flo — Code Generator",
      api_base: "/api/xhr/trongate_control-flo",
      module_builder_url: siteUrl("trongate_control-module_builder"),
      generated_modules: generated,
      generation_result: result,
      module_url,
      properties_example: [
        {
          propertyName: "Task Title",
          propertyType: "varchar",
          onForm: "yes",
          isSearchable: "yes",
          onSummaryTable: "yes",
          validationRules: ["required", "max length[120]"],
        },
        {
          propertyName: "Task Description",
          propertyType: "textarea",
          onForm: "yes",
          isSearchable: "no",
          onSummaryTable: "no",
          validationRules: ["required"],
        },
      ],
    };

    return this.templates.admin(data);
  }

  /** Read the posted generator values (JSON body first, then form fields). */
  private get_posted_values(): GenerationData {
    const values: Record<string, unknown> = {};
    const json = getContext().json;

    if (json !== null && typeof json === "object" && !Array.isArray(json)) {
      for (const [key, value] of Object.entries(
        json as Record<string, unknown>
      )) {
        if (key !== "csrf_token") values[key] = value;
      }
      return values as GenerationData;
    }

    for (const field of [
      "module_folder_name",
      "record_name_singular",
      "record_name_plural",
      "nav_label",
      "urlColumn",
      "orderBy",
      "properties",
      "icon_id",
      "icon_code",
      "run_sql",
    ]) {
      const value = post(field);
      if (value !== "") values[field] = value;
    }

    return values as GenerationData;
  }
}
