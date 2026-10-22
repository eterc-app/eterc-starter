import { createElement, type ReactNode } from "react";
import { Eterc } from "@/engine/controller";
import { ENV } from "@/engine/config";
import { post } from "@/engine/post";
import { get_context } from "@/engine/request-context";
import { session_unset } from "@/engine/session";
import { EtHttpError } from "@/engine/signals";
import type { EtTemplateData } from "@/engine/Templates";
import { redirect, site_url } from "@/engine/Url";
import type { Eterc_security } from "@/modules/eterc_security/Eterc_security";
import { register_views } from "@/engine/views-registry";
import { FloGenerator } from "./FloGenerator";
import type { GenerationData, GenerationResult } from "./FloTypes";
import { FloTrigger } from "./FloTrigger";
import { views } from "./views";

register_views(views);
export default class Flo extends Eterc {
  constructor(moduleName?: string | null) {
    super(moduleName);

    if (ENV.toLowerCase() !== "dev") {
      throw new EtHttpError(
        403,
        "Flo is only available when the application is running in development mode."
      );
    }
  }

  private securityService(): Eterc_security {
    return (this as unknown as { eterc_security: Eterc_security })
      .eterc_security;
  }

  private generator(): FloGenerator {
    return new FloGenerator();
  }

  /** Convenience route: `/eterc_control-flo` → home. */
  index(): never {
    redirect("eterc_control-flo/home");
  }

  /** Render the Flo launcher / quick-generator page. */
  async home(): Promise<ReactNode> {
    this.securityService().make_sure_allowed();
    return this.renderHome();
  }
  draw_flow_trigger(html?: string | null): ReactNode {
    return this.triggerNode(html ?? null);
  }
  draw_open_flo(html?: string | null): ReactNode {
    return this.triggerNode(html ?? null);
  }

  private triggerNode(html: string | null): ReactNode {
    if (html !== null) {
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
        ? site_url(`${result.module_name}/manage`)
        : "";

    if (get_context().isAjax) {
      return {
        ...result,
        ok: result.status === "success",
        module_url,
      };
    }

    return this.renderHome(result, module_url);
  }
  async submit_generate_mod(
    posted_values: GenerationData | null = null
  ): Promise<GenerationResult> {
    this.securityService().make_sure_allowed();
    return this.run_generation(posted_values ?? this.get_posted_values());
  }
  async reset(): Promise<Record<string, unknown>> {
    this.securityService().make_sure_allowed();
    session_unset("evo_wizard");
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
      href: site_url(`${module.module_name}/manage`),
    }));

    const data: EtTemplateData = {
      viewModule: "flo",
      viewFile: "home",
      pageTitle: "Flo — Code Generator",
      api_base: "/api/xhr/eterc_control-flo",
      module_builder_url: site_url("eterc_control-module_builder"),
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
    const json = get_context().json;

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
