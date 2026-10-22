import type { ReactNode } from "react";
import { Eterc } from "@/engine/controller";
import { csrf_token } from "@/engine/csrf";
import { get_param, post } from "@/engine/post";
import { get_context, type EtRequest } from "@/engine/request-context";
import { EtHttpError } from "@/engine/signals";
import { make_rand_str } from "@/engine/String_service";
import { segment } from "@/engine/Url";
import type { Eterc_security } from "@/modules/eterc_security/Eterc_security";
import {
  Module_relations_model,
  type AssociatedRow,
  type AvailableOption,
  type OptionsDropdown,
  type RelationSettings,
} from "./Module_relations_model";

/**
 * Module_relations controller — runtime for generated module relations.
 *
 * Port of modules/module_relations/Module_relations.php. Two calling styles are
 * preserved:
 *
 *   1. Page load / module-to-module calls — draw_summary_panel(),
 *      fetch_create_options(), sync_create_claim(), release_create_link(),
 *      release_children() and release_junction_links() are invoked directly by
 *      a generated module's controller.
 *   2. Browser requests — render_panel_body(), submit_association() and
 *      remove_association() are hit over HTTP and are therefore
 *      session-authenticated; the two mutating endpoints are CSRF-gated.
 *
 * Port adaptation of the MX transport: the PHP panel exchanges HTML fragments
 * via mx-get / mx-post and out-of-band swaps. In the port the panel's client
 * components call /api/xhr/module_relations/* with `format: "json"` and
 * receive the same panel data the `panel_body` view renders, then re-render
 * only the two panel regions themselves. Non-JSON callers (a plain form post,
 * or a server-rendered page) still get the panel_body view, matching the PHP
 * contract. Business-rule failures answer {ok:false, message} instead of the
 * PHP original's HTTP 422 + JSON body.
 */

export interface RelationParams {
  calling_module?: string;
  alt_module?: string;
  selected_key?: number;
  update_id?: number;
  value?: number;
  prev_value?: number;
}

/** Panel body data — also the JSON contract consumed by the React panel. */
export interface PanelData {
  view_module: string;
  calling_module: string;
  alt_module: string;
  update_id: number;
  relation_name: string;
  associated_singular: string;
  associated_plural: string;
  calling_singular: string;
  panel_id: string;
  panel_selector: string;
  csrf_token: string;
  associated_rows: AssociatedRow[];
  available_options: AvailableOption[];
  form_visible: boolean;
  [key: string]: unknown;
}

export default class Module_relations extends Eterc {
  constructor(moduleName?: string | null) {
    super(moduleName);
    this.model = new Module_relations_model(
      this.module_name || "module_relations"
    );
  }

  private relationsModel(): Module_relations_model {
    return this.model as Module_relations_model;
  }

  private securityService(): Eterc_security {
    return (this as unknown as { eterc_security: Eterc_security })
      .eterc_security;
  }

  // ============================================
  // Show-page summary panel
  // ============================================

  /**
   * Render the "Associated …" summary panel shell on a generated show page
   * (PHP: draw_summary_panel()). Returns null — render nothing — when no
   * relation is configured for this module pair or the URL carries no record
   * id to scope the panel to. PHP echoed the view; the port returns the React
   * node so the calling controller can embed it.
   */
  async draw_summary_panel(
    alt_module_name: string | null = null
  ): Promise<ReactNode | null> {
    this.assertNotDirectCall("draw_summary_panel");

    const calling_module = String(segment(1) ?? "").toLowerCase();
    const update_id = Number(segment(3, "int"));
    const alt_module = String(alt_module_name ?? "").toLowerCase();

    const settings = this.relationsModel().get_relation_settings(
      calling_module,
      alt_module
    );

    if (settings === null || update_id === 0) {
      return null; // No relation configured — render nothing.
    }

    const associated = this.relationsModel().est_associated_module(
      settings,
      calling_module
    );

    if (associated === null) return null;

    const associated_singular = String(associated.record_name_singular ?? "");
    const associated_plural = String(associated.record_name_plural ?? "");

    const data: Record<string, unknown> = {
      view_module: "module_relations",
      calling_module: calling_module,
      alt_module: alt_module,
      update_id: update_id,
      relation_name: `associated_${String(settings[0]?.module_name ?? "")}_and_${String(
        settings[1]?.module_name ?? ""
      )}`,
      associated_singular: associated_singular,
      associated_plural: associated_plural,
      summary_panel_id: make_rand_str(16),
      csrf_token: csrf_token(),
    };

    const relationship_type = settings[2]?.relationship_type ?? null;
    if (relationship_type === null) return null;

    // Singular noun whenever the calling side can hold at most one associated
    // record — either side of a one to one, or the CHILD side of a one to many.
    const single_associated =
      relationship_type === "one to one" ||
      (relationship_type === "one to many" &&
        calling_module === String(settings[1]?.module_name ?? ""));
    const noun = single_associated ? associated_singular : associated_plural;
    data.card_heading = `Associated ${ucwords(noun.replace(/_/g, " "))}`;

    return this.view("module_relations/summary_panel", data);
  }

  // ============================================
  // Panel body + association endpoints (browser)
  // ============================================

  /**
   * Render the panel body — associate form + associated items
   * (PHP: render_panel_body()). The X-* panel context arrives either as the
   * original custom headers or as JSON body fields; both are accepted.
   */
  async render_panel_body() {
    this.securityService().make_sure_allowed();

    const ctx = get_context();
    const calling_module = this.contextValue(ctx, "x-calling-module", "calling_module")
      .toLowerCase();
    const alt_module = this.contextValue(ctx, "x-alt-module", "alt_module")
      .toLowerCase();
    const update_id = this.contextInt(ctx, "x-update-id", "update_id");
    const panel_id = this.contextValue(ctx, "x-panel-id", "panel_id");

    if (
      calling_module === "" ||
      alt_module === "" ||
      update_id === 0 ||
      !valid_panel_id(panel_id)
    ) {
      throw new EtHttpError(400, "");
    }

    const settings = this.relationsModel().get_relation_settings(
      calling_module,
      alt_module
    );
    if (settings === null) throw new EtHttpError(400, "");

    const data = this.panelData(settings, calling_module, update_id, panel_id);
    if (data === null) throw new EtHttpError(400, "");

    if (this.wantsJson()) return { ok: true, panel: data };
    return this.view("module_relations/panel_body", data);
  }

  /**
   * Create an association from the panel's add form (PHP: submit_association();
   * session auth + CSRF gate).
   */
  async submit_association() {
    this.securityService().make_sure_allowed();
    await this.validation.run(); // CSRF gate

    const calling_module = String(post("calling_module") ?? "").toLowerCase();
    const alt_module = String(post("alt_module") ?? "").toLowerCase();
    const update_id = Number(post("update_id") ?? 0);
    const value = Number(post("value") ?? 0);
    const panel_id = String(post("panel_id") ?? "");

    if (!valid_panel_id(panel_id)) {
      return this.associationFailure("Invalid panel identifier.", 422);
    }

    const settings = this.relationsModel().get_relation_settings(
      calling_module,
      alt_module
    );

    if (settings === null || update_id === 0 || value === 0) {
      return this.associationFailure("Invalid association parameters.", 422);
    }

    if (
      !this.relationsModel().submit_association(
        settings,
        calling_module,
        update_id,
        value
      )
    ) {
      return this.associationFailure("The association could not be created.", 422);
    }

    const data = this.panelData(settings, calling_module, update_id, panel_id);
    if (data === null) {
      return this.associationFailure(
        "The association panel could not be rendered.",
        422
      );
    }

    if (this.wantsJson()) return { ok: true, panel: data };
    return this.view("module_relations/panel_body", data);
  }

  /**
   * Remove an association from the panel (PHP: remove_association(); session
   * auth + CSRF gate). `value` is the id from fetch_associated_rows() — the
   * junction row id for junction-backed relations, otherwise the associated
   * record's id.
   */
  async remove_association() {
    this.securityService().make_sure_allowed();
    await this.validation.run(); // CSRF gate

    const calling_module = String(post("calling_module") ?? "").toLowerCase();
    const alt_module = String(post("alt_module") ?? "").toLowerCase();
    const update_id = Number(post("update_id") ?? 0);
    const value = Number(post("value") ?? 0);
    const panel_id = String(post("panel_id") ?? "");

    if (!valid_panel_id(panel_id)) {
      return this.associationFailure("Invalid panel identifier.", 422);
    }

    const settings = this.relationsModel().get_relation_settings(
      calling_module,
      alt_module
    );

    if (settings === null || update_id === 0 || value === 0) {
      return this.associationFailure("Invalid association parameters.", 422);
    }

    if (
      !this.relationsModel().disassociate_association(
        settings,
        calling_module,
        update_id,
        value
      )
    ) {
      return this.associationFailure("The association could not be removed.", 422);
    }

    const data = this.panelData(settings, calling_module, update_id, panel_id);
    if (data === null) {
      return this.associationFailure(
        "The association panel could not be rendered.",
        422
      );
    }

    if (this.wantsJson()) return { ok: true, panel: data };
    return this.view("module_relations/panel_body", data);
  }

  // ============================================
  // Create-form runtime endpoints (internal)
  // ============================================

  /**
   * Dropdown options for a generated create/edit form
   * (PHP: fetch_create_options(); internal — block_url + module calls only).
   */
  fetch_create_options(params: RelationParams = {}): OptionsDropdown {
    this.assertNotDirectCall("fetch_create_options");

    const calling_module = String(params.calling_module ?? "").toLowerCase();
    const alt_module = String(params.alt_module ?? "").toLowerCase();
    const selected_key = Number(params.selected_key ?? 0);

    const settings = this.relationsModel().get_relation_settings(
      calling_module,
      alt_module
    );

    if (settings === null || calling_module === "") return {};

    return this.relationsModel().fetch_create_options(
      settings,
      calling_module,
      selected_key
    );
  }

  /**
   * Bidirectional one-to-one claim/release from a generated create/edit form
   * (PHP: sync_create_claim(); internal).
   */
  sync_create_claim(params: RelationParams = {}): void {
    this.assertNotDirectCall("sync_create_claim");

    const calling_module = String(params.calling_module ?? "").toLowerCase();
    const alt_module = String(params.alt_module ?? "").toLowerCase();
    const update_id = Number(params.update_id ?? 0);
    const value = Number(params.value ?? 0);
    const prev_value = Number(params.prev_value ?? 0);

    const settings = this.relationsModel().get_relation_settings(
      calling_module,
      alt_module
    );

    if (settings === null || calling_module === "") return;

    this.relationsModel().sync_create_claim(
      settings,
      calling_module,
      update_id,
      value,
      prev_value
    );
  }

  /**
   * Release a one-to-one link when a generated record is deleted
   * (PHP: release_create_link(); internal).
   */
  release_create_link(params: RelationParams = {}): void {
    this.assertNotDirectCall("release_create_link");

    const calling_module = String(params.calling_module ?? "").toLowerCase();
    const alt_module = String(params.alt_module ?? "").toLowerCase();
    const update_id = Number(params.update_id ?? 0);

    const settings = this.relationsModel().get_relation_settings(
      calling_module,
      alt_module
    );

    if (settings === null || calling_module === "") return;

    this.relationsModel().release_create_link(settings, calling_module, update_id);
  }

  /**
   * Release a one-to-many parent's children when the parent is deleted
   * (PHP: release_children(); internal).
   */
  release_children(params: RelationParams = {}): void {
    this.assertNotDirectCall("release_children");

    const calling_module = String(params.calling_module ?? "").toLowerCase();
    const alt_module = String(params.alt_module ?? "").toLowerCase();
    const update_id = Number(params.update_id ?? 0);

    const settings = this.relationsModel().get_relation_settings(
      calling_module,
      alt_module
    );

    if (settings === null || calling_module === "") return;

    this.relationsModel().release_children(settings, calling_module, update_id);
  }

  /**
   * Release a junction relation's rows when either side's record is deleted
   * (PHP: release_junction_links(); internal).
   */
  release_junction_links(params: RelationParams = {}): void {
    this.assertNotDirectCall("release_junction_links");

    const calling_module = String(params.calling_module ?? "").toLowerCase();
    const alt_module = String(params.alt_module ?? "").toLowerCase();
    const update_id = Number(params.update_id ?? 0);

    const settings = this.relationsModel().get_relation_settings(
      calling_module,
      alt_module
    );

    if (settings === null || calling_module === "") return;

    this.relationsModel().release_junction_links(
      settings,
      calling_module,
      update_id
    );
  }

  // ============================================
  // Internal helpers
  // ============================================

  /**
   * Assemble the view data for a panel's live content (PHP: panel_data()).
   * Returns null when the calling module isn't part of the relation, or the
   * relation's other side can't be resolved; callers treat null as a failure.
   */
  private panelData(
    settings: RelationSettings,
    calling_module: string,
    update_id: number,
    panel_id: string
  ): PanelData | null {
    const associated = this.relationsModel().est_associated_module(
      settings,
      calling_module
    );
    if (associated === null) return null;

    const associated_rows = this.relationsModel().fetch_associated_rows(
      settings,
      calling_module,
      update_id
    );
    const available_options = this.relationsModel().fetch_available_options(
      settings,
      calling_module,
      update_id
    );

    const relationship_type = String(
      settings[2]?.relationship_type ?? ""
    );

    // A one-to-one caps both sides at a single association, and so does the
    // CHILD side of a one to many (a child holds at most one parent).
    const capped_at_one =
      relationship_type === "one to one" ||
      (relationship_type === "one to many" &&
        calling_module === String(settings[1]?.module_name ?? ""));

    let form_visible = available_options.length > 0;
    if (capped_at_one) {
      form_visible = form_visible && associated_rows.length === 0;
    }

    const calling_singular =
      String(settings[0]?.module_name ?? "") === calling_module
        ? String(settings[0]?.record_name_singular ?? "")
        : String(settings[1]?.record_name_singular ?? "");

    return {
      view_module: "module_relations",
      calling_module: calling_module,
      alt_module: String(associated.module_name ?? ""),
      update_id: update_id,
      relation_name: `associated_${String(settings[0]?.module_name ?? "")}_and_${String(
        settings[1]?.module_name ?? ""
      )}`,
      associated_singular: String(associated.record_name_singular ?? ""),
      associated_plural: String(associated.record_name_plural ?? ""),
      calling_singular: calling_singular,
      panel_id: panel_id,
      panel_selector: css_escape_id(panel_id),
      csrf_token: csrf_token(),
      associated_rows: associated_rows,
      available_options: available_options,
      form_visible: form_visible,
    };
  }

  /**
   * JSON callers get {ok:false, message} for business-rule failures (HTTP 200
   * by design — the port's XHR envelope); all other callers get the PHP
   * original's HTTP 422.
   */
  private associationFailure(
    message: string,
    status: number
  ): { ok: false; message: string } {
    if (this.wantsJson()) return { ok: false, message: message };
    throw new EtHttpError(status, message);
  }

  /** Whether the caller asked for the JSON representation of the panel. */
  private wantsJson(): boolean {
    return (
      String(post("format") ?? "") === "json" || get_param("format") === "json"
    );
  }

  /** A panel context value: custom header first, JSON body fallback. */
  private contextValue(
    ctx: EtRequest,
    header: string,
    field: string
  ): string {
    const from_header = ctx.headers.get(header);
    if (from_header !== null && from_header !== "") return from_header;

    const value = post(field);
    if (value === null || value === undefined) return "";
    return String(value);
  }

  /** A numeric panel context value (header first, JSON body fallback). */
  private contextInt(ctx: EtRequest, header: string, field: string): number {
    const raw = this.contextValue(ctx, header, field);
    const parsed = parseInt(raw, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Mirrors block_url('module_relations/<method>') — direct URL access to an
   * internal endpoint answers 403 Forbidden.
   */
  private assertNotDirectCall(method: string): void {
    const ctx = get_context();
    const module_segment = (ctx.segments[0] ?? "").toLowerCase();
    const method_segment = (ctx.segments[1] ?? "").toLowerCase();

    if (
      module_segment === this.module_name.toLowerCase() &&
      method_segment === method.toLowerCase()
    ) {
      throw new EtHttpError(403, "403 Forbidden - Direct URL access not permitted");
    }
  }
}

/** PHP ucwords(): uppercase the first character of each space-separated word. */
function ucwords(value: string): string {
  return value
    .split(" ")
    .map((word) => (word === "" ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

/** Panel ids are make_rand_str() output — alphanumeric, 8–32 characters. */
function valid_panel_id(panel_id: string): boolean {
  return /^[A-Za-z0-9]{8,32}$/.test(panel_id);
}

/**
 * Escape an element id for safe use inside a CSS ID selector: a leading digit
 * becomes a CSS hex escape (`7bgZ…` → `\37 bgZ…`), as the CSS spec requires.
 */
function css_escape_id(id: string): string {
  if (id === "") return "";
  const first = id.charAt(0);
  if (first >= "0" && first <= "9") {
    return `\\${first.charCodeAt(0).toString(16)} ${id.slice(1)}`;
  }
  return id;
}
