import * as fs from "node:fs";
import * as path from "node:path";
import type { ReactNode } from "react";
import { Trongate, prepareController } from "@/engine/controller";
import { ENV, MODULE_ASSETS_TRIGGER } from "@/engine/config";
import { post } from "@/engine/post";
import { GENERATED_MODULES_DIR, MODULES_DIR } from "@/engine/paths";
import { getContext } from "@/engine/request-context";
import { sessionGet, sessionSet, sessionUnset } from "@/engine/session";
import { TgHttpError } from "@/engine/signals";
import { urlTitle } from "@/engine/string-service";
import type { TgTemplateData } from "@/engine/templates";
import { segment, siteUrl } from "@/engine/url";
import type { TrongateSecurityService } from "@/modules/trongate_security/TrongateSecurityService";
import Plural_maker from "../plural_maker/Plural_maker";
import type Site_builder from "../site_builder/Site_builder";
import type { GenerateModuleResult } from "../site_builder/types";

/**
 * Module_builder — port of
 * modules/trongate_control/module_builder/Module_builder.php.
 *
 * The interactive "Create Module" wizard:
 *   module name -> nav label -> properties -> URL column -> order by ->
 *   confirmation -> generation (delegated to site_builder).
 *
 * Wizard state is held in the shared `evo_wizard` session key exactly like the
 * PHP original. The step methods branch on the request type like the original
 * MX flow: AJAX requests receive JSON, normal page requests render the next
 * step inside the admin theme.
 *
 * Deviation from PHP: the original echoed bare view fragments (the Flo shell
 * swapped them into `main`). This port renders every page-shaped response
 * through the admin theme and returns JSON to the React wizard. Outside dev
 * mode a 403 is raised (Evo's disabled response is HTML and is not usable as a
 * JSON reply); generation errors are returned as JSON for the wizard.
 */

export interface WizardProperty {
  propertyName?: string;
  propertyType?: string;
  onForm?: string;
  isSearchable?: string;
  onSummaryTable?: string;
  validationRules?: string[];
  [key: string]: unknown;
}

interface EvoWizard {
  record_name_singular?: string;
  record_name_plural?: string;
  module_folder_name?: string;
  nav_label?: string;
  icon_code?: string;
  icon_id?: string;
  properties?: WizardProperty[];
  url_column?: string;
  order_by?: string;
}

interface StepRenderData extends Record<string, unknown> {
  viewModule: string;
  viewFile: string;
}

const WIZARD_SESSION_KEY = "evo_wizard";

const RESERVED_NAMES = [
  "config",
  "system",
  "engine",
  "public",
  "templates",
  "assets",
  "modules",
  "welcome",
];

/** PHP ucwords(): capitalise the first letter of every space-separated word. */
function ucwords(value: string): string {
  return value
    .split(" ")
    .map((word) => (word === "" ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

/** True when a module folder name is already taken. */
function moduleFolderExists(folderName: string): boolean {
  const candidates = [
    path.join(MODULES_DIR, folderName),
    path.join(GENERATED_MODULES_DIR, folderName),
  ];
  return candidates.some((candidate) => fs.existsSync(candidate));
}

export default class Module_builder extends Trongate {
  constructor(moduleName?: string | null) {
    super(moduleName);

    if (ENV.toLowerCase() !== "dev") {
      throw new TgHttpError(
        403,
        "The module builder is only available when the application is running in development mode."
      );
    }
  }

  // ============================================
  // Shared helpers
  // ============================================

  private securityService(): TrongateSecurityService {
    return (this as unknown as { trongate_security: TrongateSecurityService })
      .trongate_security;
  }

  private isAjax(): boolean {
    return getContext().isAjax;
  }

  private getWizard(): EvoWizard {
    const wizard = sessionGet<EvoWizard>(WIZARD_SESSION_KEY);
    return wizard && typeof wizard === "object" ? wizard : {};
  }

  private saveWizard(wizard: EvoWizard): void {
    sessionSet(WIZARD_SESSION_KEY, wizard);
  }

  /** Merge a partial update into the session wizard (PHP: $_SESSION[...] = ...). */
  private updateWizard(partial: Partial<EvoWizard>): EvoWizard {
    const wizard = { ...this.getWizard(), ...partial };
    this.saveWizard(wizard);
    return wizard;
  }

  /** Resolve the plural_maker child module (with a static fallback). */
  private async pluralMaker(): Promise<Plural_maker> {
    try {
      return await this.module<Plural_maker>("trongate_control-plural_maker");
    } catch {
      // The sibling may not be registered yet; instantiate it directly so the
      // wizard still works when the orchestrator has not wired it.
      const instance = new Plural_maker("trongate_control-plural_maker");
      return prepareController(instance, "trongate_control-plural_maker") as unknown as Plural_maker;
    }
  }

  /** Resolve the site_builder child module (with a static fallback). */
  private async siteBuilder(): Promise<Site_builder> {
    try {
      return await this.module<Site_builder>("trongate_control-site_builder");
    } catch {
      const { default: SiteBuilderCtor } = await import("../site_builder/Site_builder");
      const instance = new SiteBuilderCtor("trongate_control-site_builder");
      return prepareController(
        instance,
        "trongate_control-site_builder"
      ) as unknown as Site_builder;
    }
  }

  /** Render a wizard step inside the admin theme (non-AJAX responses). */
  private renderStep(step: string, data: Record<string, unknown> = {}): Promise<ReactNode> {
    const templateData: TgTemplateData = {
      ...data,
      viewModule: "module_builder",
      viewFile: step,
    };
    return this.templates.admin(templateData);
  }

  /** Read the JSON body (or posted fields) as a plain record. */
  private getPostedItems(): Record<string, unknown> {
    const json = getContext().json;
    if (json && typeof json === "object" && !Array.isArray(json)) {
      const copy: Record<string, unknown> = { ...(json as Record<string, unknown>) };
      delete copy.csrf_token;
      return copy;
    }

    const items: Record<string, unknown> = {};
    for (const key of [
      "moduleDir",
      "recordNameSingular",
      "recordNamePlural",
      "navLabel",
      "properties",
      "urlColumn",
      "orderBy",
    ]) {
      const value = post(key);
      if (value !== "") items[key] = value;
    }
    return items;
  }

  // ============================================
  // Wizard Step 1: Submit Module Name
  // ============================================

  /**
   * Renders the 'enter module name' wizard step.
   *
   * Clears any stale wizard session state when starting fresh (PHP parity).
   */
  /** Port convenience: `/trongate_control-module_builder` → enter_mod_name. */
  async index() {
    return this.enter_mod_name();
  }

  async enter_mod_name(): Promise<ReactNode | Record<string, unknown>> {
    this.securityService().make_sure_allowed();
    sessionUnset(WIZARD_SESSION_KEY);

    if (this.isAjax()) {
      return { ok: true };
    }

    return this.renderStep("enter_mod_name");
  }

  /**
   * Accepts the module name (singular) and advances the wizard.
   */
  async submit_mod_name(): Promise<ReactNode | Record<string, unknown>> {
    this.securityService().make_sure_allowed();

    const mod_name = String(post("mod_name", true) ?? "");
    const fail = (error: string) => {
      if (this.isAjax()) return { ok: false, error };
      return this.renderStep("enter_mod_name", { error });
    };

    if (mod_name.length < 2) {
      return fail("Module name must be at least 2 characters long.");
    }

    if (mod_name.length > 50) {
      return fail("Module name cannot exceed 50 characters.");
    }

    if (!/^[a-zA-Z][a-zA-Z0-9_ ]*$/.test(mod_name)) {
      return fail(
        "Module name must start with a letter and contain only letters, numbers, underscores, and spaces."
      );
    }

    if (mod_name.includes(MODULE_ASSETS_TRIGGER)) {
      return fail(`Module name cannot contain "${MODULE_ASSETS_TRIGGER}".`);
    }

    if (RESERVED_NAMES.includes(mod_name.toLowerCase())) {
      return fail("This module name is reserved and cannot be used.");
    }

    const pluralMaker = await this.pluralMaker();
    const plural = ucwords(pluralMaker.make_plural(mod_name));
    const module_folder_name = urlTitle(plural).replace(/-/g, "_");

    if (moduleFolderExists(module_folder_name)) {
      return fail(`A module named '${module_folder_name}' already exists.`);
    }

    // PHP replaces the whole evo_wizard array at this point.
    this.saveWizard({
      record_name_singular: mod_name,
      record_name_plural: plural,
      module_folder_name,
    });

    if (this.isAjax()) {
      return {
        ok: true,
        next_step: "add_nav_label",
        record_name_plural: plural,
        module_folder_name,
      };
    }

    return this.renderStep("add_nav_label", { record_name_plural: plural });
  }

  // ============================================
  // Wizard Step 2: Add Navigation Label
  // ============================================

  /** Renders the 'add navigation label' wizard step. */
  async add_nav_label(): Promise<ReactNode> {
    this.securityService().make_sure_allowed();

    // Redirect back to start if no wizard session exists (PHP parity).
    if (sessionGet(WIZARD_SESSION_KEY) === undefined) {
      return this.renderStep("enter_mod_name");
    }

    const plural = this.getWizard().record_name_plural ?? "";
    return this.renderStep("add_nav_label", { record_name_plural: plural });
  }

  /** Accepts the navigation label and advances the wizard. */
  async submit_nav_label(): Promise<ReactNode | Record<string, unknown>> {
    this.securityService().make_sure_allowed();

    const nav_label = String(post("nav_label", true) ?? "");

    this.updateWizard({ nav_label, icon_code: "", icon_id: "" });

    if (this.isAjax()) {
      return { ok: true, next_step: "lets_add_properties_conf" };
    }

    return this.renderStep("lets_add_properties_conf");
  }

  // ============================================
  // Wizard Step 3: Properties Confirmation (STOP)
  // ============================================

  /**
   * Renders the 'now add some properties' stopping point.
   *
   * The PHP view opened the Properties Builder iframe through the Flo shell
   * (`postMessage('open_properties_builder')`). That child module has not been
   * ported, so the wizard additionally offers a built-in JSON editor which
   * posts to store_properties() using the same contract.
   */
  async lets_add_properties_conf(): Promise<ReactNode> {
    this.securityService().make_sure_allowed();
    return this.renderStep("lets_add_properties_conf", {
      properties: this.getWizard().properties ?? [],
    });
  }

  // ============================================
  // Wizard Step 4: Store Properties (via AJAX)
  // ============================================

  /**
   * Receives properties JSON and stores it in the wizard session.
   *
   * Contract preserved from PHP:
   *   {success: true, count, next_step: 'trongate_control-module_builder/choose_order_by'}
   * The PHP code answered HTTP 400 with {success:false,error} for invalid
   * data; that deviation is kept (the JSON API cannot set an arbitrary status
   * from a return value, so the payload carries the same information).
   */
  async store_properties(): Promise<Record<string, unknown>> {
    this.securityService().make_sure_allowed();

    const json = getContext().json;
    let properties: unknown = json;

    // Support form-encoded posts in addition to the JSON body.
    if (typeof properties === "string") {
      try {
        properties = JSON.parse(properties);
      } catch {
        properties = null;
      }
    }

    if (!Array.isArray(properties)) {
      return { success: false, error: "Invalid properties data received." };
    }

    const wizard = this.getWizard();
    wizard.properties = properties as WizardProperty[];
    this.saveWizard(wizard);

    return {
      success: true,
      count: properties.length,
      next_step: "trongate_control-module-builder/choose_order_by",
    };
  }

  // ============================================
  // Wizard Step 5: Choose URL Column (Slug)
  // ============================================

  /** Renders the URL column selection view. */
  async choose_url_column(): Promise<ReactNode> {
    this.securityService().make_sure_allowed();
    return this.renderStep("choose_url_column", {
      properties: this.getWizard().properties ?? [],
    });
  }

  /** Stores the selected URL column (form POST variant). */
  async submit_url_column(): Promise<ReactNode | Record<string, unknown>> {
    this.securityService().make_sure_allowed();

    const url_column = String(post("url_column", true) ?? "");
    const wizard = this.updateWizard({ url_column });
    const properties = wizard.properties ?? [];

    if (this.isAjax()) {
      return { ok: true, next_step: "choose_order_by", properties };
    }

    return this.renderStep("choose_order_by", { properties });
  }

  /** Accepts POST from the URL column options selector (parameter: selected). */
  async submit_url_col(): Promise<ReactNode | Record<string, unknown>> {
    this.securityService().make_sure_allowed();

    const selected = String(post("selected", true) ?? "");
    const wizard = this.updateWizard({ url_column: selected });
    const properties = wizard.properties ?? [];

    if (this.isAjax()) {
      return {
        ok: true,
        next_step: "choose_order_by",
        url_column: selected,
        properties,
      };
    }

    return this.renderStep("choose_order_by", { properties });
  }

  // ============================================
  // Wizard Step 6: Choose Default Order By
  // ============================================

  /** Renders the default order by selection view. */
  async choose_order_by(): Promise<ReactNode> {
    this.securityService().make_sure_allowed();
    return this.renderStep("choose_order_by", {
      properties: this.getWizard().properties ?? [],
    });
  }

  /** Accepts the order by selection and shows the pre-generation screen. */
  async submit_order_by(): Promise<ReactNode | Record<string, unknown>> {
    this.securityService().make_sure_allowed();

    const selected = String(post("selected", true) ?? "");

    // A default order by is mandatory — never accept an empty/malformed value.
    if (selected === "" || !/^[a-z0-9_]+( DESC)?$/.test(selected)) {
      const error = "Please choose a valid option for the default order by.";
      if (this.isAjax()) return { ok: false, error };
      return this.renderStep("choose_order_by", {
        properties: this.getWizard().properties ?? [],
        error,
      });
    }

    const wizard = this.updateWizard({ order_by: selected });

    if (this.isAjax()) {
      return { ok: true, next_step: "conf_generate_mod", wizard };
    }

    return this.renderStep("conf_generate_mod", { wizard });
  }

  // ============================================
  // Pre-generation confirmation
  // ============================================

  /** Renders the pre-generation confirmation page. */
  async conf_generate_mod(): Promise<ReactNode> {
    this.securityService().make_sure_allowed();
    return this.renderStep("conf_generate_mod", { wizard: this.getWizard() });
  }

  // ============================================
  // Generate Module
  // ============================================

  /**
   * Generates the new module from wizard session data.
   *
   * Delegates to site_builder->submit_generate_mod(), exactly like PHP.
   * AJAX callers receive {ok, ...}; page requests render the success view.
   */
  async run_gen(): Promise<ReactNode | Record<string, unknown>> {
    this.securityService().make_sure_allowed();

    const wizard = this.getWizard();
    const module_name = wizard.module_folder_name ?? "";

    if (module_name === "") {
      return {
        ok: false,
        headline: "Invalid Request",
        message:
          "Module could not be created because no module name was provided.",
      };
    }

    // Map session data to Site_builder's expected format (PHP parity).
    const data: Record<string, unknown> = {
      module_folder_name: module_name,
      record_name_singular: wizard.record_name_singular ?? "Record",
      record_name_plural: wizard.record_name_plural ?? "Records",
      nav_label: wizard.nav_label ?? "",
      urlColumn: wizard.url_column ?? "",
      orderBy: wizard.order_by || "id",
      properties: JSON.stringify(wizard.properties ?? []),
      icon_id: wizard.icon_id ?? "",
      icon_code: wizard.icon_code ?? "",
      tempParams: JSON.stringify({ previousAction: "submitProperties" }),
    };

    const site_builder = await this.siteBuilder();
    const result: GenerateModuleResult = await site_builder.submit_generate_mod(data);

    if (result.status === "success") {
      const module_url = siteUrl(`${module_name}/manage`);

      if (this.isAjax()) {
        return {
          ok: true,
          status: "success",
          module_name,
          module_url,
          message: result.message,
        };
      }

      return this.renderStep("generate_module", { module_url });
    }

    // PHP called evo->render_generation_error(). The port's wizard is a React
    // client flow, so return the same information as JSON to display.
    return {
      ok: false,
      status: "error",
      headline: result.headline ?? "Generation Error",
      message: result.message,
      more_info_url: result.more_info_url ?? "",
    };
  }

  // ============================================
  // Module Details (editable overlay)
  // ============================================

  /**
   * Renders the editable module details overlay.
   *
   * When addressed with `/web` (segment 3) the view is rendered inside the
   * module_details iframe template, matching the original 'View Module
   * Details' review step.
   */
  async module_details(): Promise<ReactNode> {
    this.securityService().make_sure_allowed();

    const wizard = this.getWizard();
    const properties = wizard.properties ?? [];

    // Build URL column dropdown options.
    const url_column_options: Record<string, string> = {
      "": "-- No URL Column --",
    };
    for (const prop of properties) {
      const name = prop.propertyName ?? "";
      if (name !== "") url_column_options[name] = name;
    }

    // Build order by dropdown options.
    const order_by_options: Record<string, string> = {
      id: "id",
      "id DESC": "id DESC",
    };
    for (const prop of properties) {
      const name = prop.propertyName ?? "";
      if (name !== "") {
        order_by_options[name] = name;
        order_by_options[`${name} DESC`] = `${name} DESC`;
      }
    }

    const after_close_url = siteUrl(
      "trongate_control-module_builder/conf_generate_mod?template=c64"
    );

    const data: TgTemplateData = {
      viewModule: "module_builder",
      viewFile: "conf_module_details",
      pageTitle: "Module Details",
      wizard,
      url_column_options,
      order_by_options,
      after_close_url,
      after_close_width: 800,
      after_close_height: 600,
    };

    if (String(segment(3)) === "web") {
      return this.templates.module_details(data);
    }

    return this.templates.admin(data);
  }

  /** Accepts POST from the module details editable form. */
  async submit_mod_details(): Promise<Record<string, unknown>> {
    this.securityService().make_sure_allowed();

    await this.validation.set_rules(
      "moduleDir",
      "module directory",
      "required|callback_module_dir_check"
    );
    await this.validation.set_rules(
      "recordNameSingular",
      "record name singular",
      "required"
    );
    await this.validation.set_rules(
      "recordNamePlural",
      "record name plural",
      "required"
    );
    await this.validation.set_rules("navLabel", "navigation label", "max_length[40]");
    await this.validation.set_rules(
      "properties",
      "properties",
      "required|callback_properties_check"
    );
    await this.validation.set_rules("urlColumn", "URL column", "callback_url_column_check");
    await this.validation.set_rules(
      "orderBy",
      "order by",
      "required|callback_order_by_check"
    );

    const result = await this.validation.run();

    if (result === true) {
      const posted_items = this.getPostedItems();

      // Save to the wizard session for backward compatibility (PHP parity).
      const wizard = this.getWizard();
      wizard.module_folder_name = String(posted_items.moduleDir ?? "");
      wizard.record_name_singular = String(posted_items.recordNameSingular ?? "");
      wizard.record_name_plural = String(posted_items.recordNamePlural ?? "");
      wizard.nav_label = String(posted_items.navLabel ?? "");

      const properties_raw = String(posted_items.properties ?? "");
      try {
        const properties = JSON.parse(properties_raw);
        if (Array.isArray(properties)) {
          wizard.properties = properties as WizardProperty[];
        }
      } catch {
        /* validation already rejected invalid JSON */
      }

      wizard.url_column = String(posted_items.urlColumn ?? "");
      wizard.order_by = String(posted_items.orderBy ?? "");
      this.saveWizard(wizard);

      return { ok: true, posted_items };
    }

    return { ok: false, errors: this.validation.errors };
  }

  // ─── Validation Callbacks ─────────────────────────────────

  /** Validates the module directory name. */
  module_dir_check(moduleDir: string): boolean | string {
    if (moduleDir === "") {
      return true;
    }
    if (!/^[a-z0-9_]+$/.test(moduleDir)) {
      return "Directory name can only contain lowercase letters, numbers, and underscores.";
    }
    return true;
  }

  /** Validates the properties JSON string. */
  properties_check(properties: string): boolean | string {
    if (properties === "") {
      return true;
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(properties);
    } catch {
      return "Properties must be valid JSON.";
    }

    if (!Array.isArray(decoded)) {
      return "Properties must be a JSON array.";
    }

    const propertyNames: string[] = [];
    for (let index = 0; index < decoded.length; index++) {
      const item = decoded[index];
      if (item === null || typeof item !== "object" || Array.isArray(item)) {
        return "Each item in the properties array must be an object.";
      }
      const record = item as Record<string, unknown>;
      if (!record.propertyName) {
        return `Item at index ${index} is missing propertyName.`;
      }
      if (!record.propertyType) {
        return `Item at index ${index} is missing propertyType.`;
      }
      propertyNames.push(String(record.propertyName));
    }

    if (new Set(propertyNames).size !== propertyNames.length) {
      return "Property names must be unique.";
    }

    return true;
  }

  /** Validates the URL column selection against the posted properties. */
  url_column_check(urlColumn: string): boolean | string {
    const value = urlColumn.trim();
    if (value === "") {
      return true;
    }
    if (value.toLowerCase() === "id") {
      return true;
    }

    const properties = String(post("properties", true) ?? "");
    let decoded: unknown;
    try {
      decoded = JSON.parse(properties);
    } catch {
      return "URL column could not be validated against properties.";
    }

    if (!Array.isArray(decoded)) {
      return "URL column could not be validated against properties.";
    }

    for (const item of decoded) {
      if (
        item !== null &&
        typeof item === "object" &&
        (item as Record<string, unknown>).propertyName === value
      ) {
        return true;
      }
    }

    return `URL column '${value}' does not match any property name.`;
  }

  /** Validates the order by field selection against the posted properties. */
  order_by_check(orderBy: string): boolean | string {
    const value = orderBy.trim();
    if (value === "") {
      return "Order by field is required.";
    }

    const properties = String(post("properties", true) ?? "");
    let decoded: unknown;
    try {
      decoded = JSON.parse(properties);
    } catch {
      return "Order by could not be validated against properties.";
    }

    if (!Array.isArray(decoded)) {
      return "Order by could not be validated against properties.";
    }

    const validValues = ["id", "id DESC"];
    for (const item of decoded) {
      if (item === null || typeof item !== "object") continue;
      const name = (item as Record<string, unknown>).propertyName;
      if (typeof name !== "string") continue;

      // Accept both the raw property name (legacy) and the column name.
      validValues.push(name, `${name} DESC`);
      const columnName = urlTitle(name).replace(/-/g, "_");
      validValues.push(columnName, `${columnName} DESC`);
    }

    if (validValues.includes(value)) {
      return true;
    }

    return `Order by value '${value}' does not match any valid property name.`;
  }
}
