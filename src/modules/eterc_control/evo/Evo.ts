import { createElement, type ReactNode } from "react";
import { Eterc } from "@/engine/controller";
import { ENV, ETERC_API_URL, ETERC_FORUM_URL } from "@/engine/config";
import { get_context, has_context, segment } from "@/engine/request-context";
import { session_unset } from "@/engine/session";
import { EtHttpError } from "@/engine/signals";
import type { EtTemplateData } from "@/engine/Templates";
import { redirect } from "@/engine/Url";
import type { Eterc_security } from "@/modules/eterc_security/Eterc_security";
import { register_views } from "@/engine/views-registry";
import EvoErrorElement from "./views/error_element";
import EvoGenerationError from "./views/generation_error";
import EvoDisabled from "./views/disabled";
import { views } from "./views";

register_views(views);

/**
 * Evo — port of modules/eterc_control/evo/Evo.php.
 *
 * Evo is Flo's generic controller: home / module-manager menus, the
 * "ask a question" panel, the shared reset action and reusable error /
 * details / disabled views for sibling child modules.
 *
 * The original was loaded as a fragment inside the Flo iframe and had no
 * authentication guard. In the port the page-shaped methods render through
 * the admin theme and call the security service, while the reusable
 * render_* helpers stay bare so sibling modules can embed them. Direct URL
 * access to those helpers is rejected, mirroring `block_url()`.
 *
 * No framework files are read, written or upgraded by this module; the only
 * stateful action is reset(), which clears the shared `evo_wizard` session
 * key.
 */

export interface EvoDetailsIframeData {
  view_content?: ReactNode;
  local_storage_items?: Record<string, unknown>;
  after_close_url?: string;
  after_close_width?: string | number;
  after_close_height?: string | number;
  page_title?: string;
}

export default class Evo extends Eterc {
  /** Base URL of the Eterc API (used for troubleshooting links). */
  api_base_url = ETERC_API_URL;

  constructor(moduleName?: string | null) {
    super(moduleName);

    if (ENV.toLowerCase() !== "dev") {
      throw new EtHttpError(
        403,
        "This feature is only available when the application is running in development mode."
      );
    }
  }

  private securityService(): Eterc_security {
    return (this as unknown as { eterc_security: Eterc_security })
      .eterc_security;
  }

  private isAjax(): boolean {
    return get_context().isAjax;
  }

  /**
   * Reject direct URL access to an internal render helper.
   *
   * Sibling modules call these methods in-process, so the current URL method
   * segment is the caller's method (not the helper name) and the guard does
   * not fire. A direct hit is refused with the port's 403 signal.
   */
  private guardDirectInvocation(method: string): void {
    if (!has_context()) return;

    const current = String(segment(2) ?? "").toLowerCase();
    if (current === method.toLowerCase()) {
      throw new EtHttpError(
        403,
        "403 Forbidden - Direct URL access not permitted"
      );
    }
  }

  /** Port convenience: `/eterc_control-evo` → home. */
  index(): never {
    redirect("eterc_control-evo/home");
  }

  /** Render the Flo home menu. */
  async home(): Promise<ReactNode> {
    this.securityService().make_sure_allowed();
    return this.renderPage("home", "Flo");
  }

  /** Render the module manager menu. */
  async module_manager(): Promise<ReactNode> {
    this.securityService().make_sure_allowed();
    return this.renderPage("module_manager", "Module Manager");
  }

  /** Render the "Ask a Question" panel. */
  async ask(): Promise<ReactNode> {
    this.securityService().make_sure_allowed();

    return this.renderPage("ask", "Ask a Question", {
      ask_url: ETERC_FORUM_URL,
    });
  }

  /**
   * Clear the shared Flo wizard session and return to the main menu.
   *
   * PHP: unset($_SESSION['evo_wizard']) + view('home'). The AJAX caller gets a
   * small JSON acknowledgement (used by the React reset button).
   */
  async reset(): Promise<ReactNode | Record<string, unknown>> {
    this.securityService().make_sure_allowed();
    session_unset("evo_wizard");

    if (this.isAjax()) {
      return { ok: true, reset: "evo_wizard" };
    }

    return this.renderPage("home", "Flo");
  }

  /**
   * Render an error element for a sibling module.
   *
   * PHP returned an HTML fragment and used block_url(). The port returns a
   * React node with the same content; direct URL invocation is rejected.
   */
  render_error(message = ""): ReactNode {
    this.guardDirectInvocation("render_error");
    return createElement(EvoErrorElement, { data: { message }, message });
  }

  /**
   * Render the generic "details review" overlay.
   *
   * The PHP version emitted a standalone document with a close header and a
   * localStorage seeding script. The port composes ModuleDetailsTemplate with
   * the registered module_details_iframe view, which performs the seeding.
   */
  async render_details_iframe(
    data: EvoDetailsIframeData = {}
  ): Promise<ReactNode> {
    this.guardDirectInvocation("render_details_iframe");

    const templateData: EtTemplateData = {
      viewModule: "evo",
      viewFile: "module_details_iframe",
      pageTitle: data.page_title ?? "Details",
      view_content: data.view_content ?? null,
      local_storage_items: data.local_storage_items ?? {},
      after_close_url: String(data.after_close_url ?? ""),
      after_close_width: String(data.after_close_width ?? ""),
      after_close_height: String(data.after_close_height ?? ""),
    };

    return this.templates.module_details(templateData);
  }

  /** Render a generation failure with an optional "Learn More" link. */
  render_generation_error(
    message = "",
    more_info_url = ""
  ): ReactNode {
    this.guardDirectInvocation("render_generation_error");
    return createElement(EvoGenerationError, {
      data: { message, more_info_url },
      message,
      more_info_url,
    });
  }

  /**
   * Render the disabled response for non-dev environments.
   *
   * The constructor already raises a 403 outside dev (the port's equivalent
   * of the PHP `die()`), but the view stays public for parity and reuse.
   */
  render_disabled_response(): ReactNode {
    return createElement(EvoDisabled, { data: {} });
  }

  private renderPage(
    viewFile: string,
    pageTitle: string,
    extra: Record<string, unknown> = {}
  ): Promise<ReactNode> {
    const data: EtTemplateData = {
      ...extra,
      viewModule: "evo",
      viewFile,
      pageTitle,
    };
    return this.templates.admin(data);
  }
}
