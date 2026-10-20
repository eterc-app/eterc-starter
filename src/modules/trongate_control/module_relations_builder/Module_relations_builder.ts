import * as fs from "node:fs";
import * as path from "node:path";
import type { ReactNode } from "react";
import ts from "typescript";
import { Trongate, prepare_controller } from "@/engine/controller";
import { ENV } from "@/engine/config";
import { post } from "@/engine/post";
import { get_context } from "@/engine/request-context";
import { session_get, session_set, session_unset } from "@/engine/session";
import { TgHttpError } from "@/engine/signals";
import type { TgTemplateData } from "@/engine/Templates";
import { segment, site_url } from "@/engine/Url";
import { register_views } from "@/engine/views-registry";
import type { Trongate_security } from "@/modules/trongate_security/Trongate_security";
import Plural_maker from "../plural_maker/Plural_maker";
import { views } from "./views";
import {
  deleteHookBlock,
  dropdownRowBlock,
  getOptionsMethodBlock,
  junctionDeleteHookBlock,
  optionsFetchBlock,
  parentDeleteHookBlock,
  postedDataBlock,
  prevCaptureBlock,
  releaseChildrenMethodBlock,
  releaseJunctionMethodBlock,
  releaseMethodBlock,
  summaryPanelDataBlock,
  summaryPanelExpression,
  summaryPanelFetchBlock,
  syncMethodBlock,
  syncOnSaveCreateBlock,
  syncOnSaveUpdateBlock,
} from "./code_templates";
import {
  Module_relations_builder_model,
  ucfirst,
  ucwords,
} from "./Module_relations_builder_model";
import {
  RELATION_TYPES,
  type InjectionItem,
  type InjectionPlan,
  type RelationModuleChoice,
  type RelationType,
  type RelationsWizard,
} from "./types";

register_views(views);

/**
 * Module_relations_builder - the "Create Module Relation" wizard.
 *
 * Port of modules/trongate_control/module_relations_builder. The wizard walks
 * through relation type -> module A -> module B -> (bridging question for
 * 1:1) -> confirmation, then writes the schema, the runtime settings JSON and
 * the code injections that make the relation visible.
 *
 * Port adaptations:
 *  - generated modules live under src/modules/generated; injection targets that
 *    layout (with a fallback to src/modules/<module> for hand-written modules);
 *  - PHP code templates are rendered as TypeScript/JSX blocks and parse-checked
 *    with the TypeScript compiler before any file is written;
 *  - the original MX/echo flow is split: AJAX callers get JSON, page requests
 *    render through the admin theme;
 *  - the dev-only guard raises 403 instead of calling evo's disabled view.
 */

const WIZARD_SESSION_KEY = "evo_wizard";

const SHOW_FETCH_ANCHOR =
  "    const data = this.moduleModel().get_data_from_db(update_id, true);";

const SHOW_DATA_TAIL_ANCHOR = [
  "      back_url: this.get_back_url(),",
  "      viewModule: this.module_name,",
  '      viewFile: "show",',
].join("\n");

const SHOW_FRAGMENT_END = "\n    </>";

const RECORD_LOAD_ANCHOR =
  "    const record = this.moduleModel().find_by_id(update_id);";

export default class Module_relations_builder extends Trongate {
  constructor(moduleName?: string | null) {
    super(moduleName);
    this.model = new Module_relations_builder_model(
      this.module_name || "module_relations_builder"
    );

    if (ENV.toLowerCase() !== "dev") {
      throw new TgHttpError(
        403,
        "The module relations builder is only available when the application is running in development mode."
      );
    }
  }

  // ============================================
  // Shared helpers
  // ============================================

  private relationsModel(): Module_relations_builder_model {
    return this.model as Module_relations_builder_model;
  }

  private securityService(): Trongate_security {
    return (this as unknown as { trongate_security: Trongate_security })
      .trongate_security;
  }

  private isAjax(): boolean {
    return get_context().isAjax;
  }

  private getWizard(): RelationsWizard {
    const wizard = session_get<RelationsWizard>(WIZARD_SESSION_KEY);
    return wizard && typeof wizard === "object" ? wizard : {};
  }

  private saveWizard(wizard: RelationsWizard): void {
    session_set(WIZARD_SESSION_KEY, wizard);
  }

  private updateWizard(partial: Partial<RelationsWizard>): RelationsWizard {
    const wizard = { ...this.getWizard(), ...partial };
    this.saveWizard(wizard);
    return wizard;
  }

  /** Resolve the plural_maker child module (static fallback when unwired). */
  private async pluralMaker(): Promise<Plural_maker> {
    try {
      return await this.module<Plural_maker>(
        "trongate_control-plural_maker"
      );
    } catch {
      const instance = new Plural_maker("trongate_control-plural_maker");
      return prepare_controller(
        instance,
        "trongate_control-plural_maker"
      ) as unknown as Plural_maker;
    }
  }

  private renderStep(
    step: string,
    data: Record<string, unknown> = {}
  ): Promise<ReactNode> {
    const templateData: TgTemplateData = {
      ...data,
      viewModule: "module_relations_builder",
      viewFile: step,
    };
    return this.templates.admin(templateData);
  }

  private errorPayload(message: string): Record<string, unknown> {
    return { ok: false, error: message };
  }

  /** Render or return a step failure, depending on the request type. */
  private failure(
    step: string,
    message: string
  ): Promise<ReactNode> | Record<string, unknown> {
    if (this.isAjax()) return this.errorPayload(message);
    return this.renderStep(step, { error: message });
  }

  // ============================================
  // Wizard entry point
  // ============================================

  /** Port convenience: `/trongate_control-module_relations_builder`. */
  async index(): Promise<ReactNode | Record<string, unknown>> {
    return this.choose_relation_type();
  }

  /** Step 1: choose the relation type; clears stale wizard state. */
  async choose_relation_type(): Promise<ReactNode | Record<string, unknown>> {
    this.securityService().make_sure_allowed();
    session_unset(WIZARD_SESSION_KEY);

    if (this.isAjax()) {
      return { ok: true, next_step: "choose_relation_type" };
    }

    return this.renderStep("choose_relation_type");
  }

  // ============================================
  // Step 2: relation type -> module selection
  // ============================================

  async submit_relation_type(): Promise<
    ReactNode | Record<string, unknown>
  > {
    this.securityService().make_sure_allowed();

    const selected = String(post("selected", true) ?? "");

    if (!RELATION_TYPES.includes(selected as RelationType)) {
      return this.failure(
        "choose_relation_type",
        "Please choose a valid relation type."
      );
    }

    this.updateWizard({ relation_type: selected });
    return this.respondWithSelection(this.selectionResult(1));
  }

  /**
   * Build the parent (stage 1) or child (stage 2) module picker payload.
   * Stage 2 excludes the already-chosen parent.
   */
  private selectionResult(stage: number): Record<string, unknown> {
    const wizard = this.getWizard();
    const type = String(wizard.relation_type ?? "");

    if (type === "") {
      return this.errorPayload("Please choose a valid relation type.");
    }

    const one_to_many = type === "one to many";
    const parent = String(wizard.parent_module ?? "");

    let heading: string;
    let submit_method: string;
    let module_names: string[];

    if (stage === 1) {
      heading = one_to_many ? "Select Parent Module" : "Select Module A";
      submit_method = "submit_parent";
      module_names = this.relationsModel().get_relation_tables();
    } else {
      heading = one_to_many ? "Select Child Module" : "Select Module B";
      submit_method = "submit_child";
      module_names = this.relationsModel()
        .get_relation_tables()
        .filter((name) => name !== parent);
    }

    if (module_names.length === 0) {
      return this.errorPayload(
        "No modules with database tables were found. Generate a module first."
      );
    }

    const modules: RelationModuleChoice[] = module_names.map((name) => ({
      module: name,
      label: ucwords(name.replace(/_/g, " ")),
    }));

    return {
      ok: true,
      next_step: "select_module",
      stage,
      heading,
      submit_method,
      modules,
      wizard,
    };
  }

  private respondWithSelection(
    selection: Record<string, unknown>
  ): Promise<ReactNode> | Record<string, unknown> {
    if (selection.ok !== true) {
      return this.failure(
        "choose_relation_type",
        String(selection.error ?? "The module selection could not be loaded.")
      );
    }

    if (this.isAjax()) return selection;
    return this.renderStep("select_module", selection);
  }

  // ============================================
  // Step 3: module A (parent)
  // ============================================

  async submit_parent(): Promise<ReactNode | Record<string, unknown>> {
    this.securityService().make_sure_allowed();

    const selected = String(post("selected", true) ?? "");

    if (selected === "" || !this.relationsModel().is_relation_table(selected)) {
      return this.failure(
        "select_module",
        "Please choose a valid module."
      );
    }

    this.updateWizard({ parent_module: selected });
    return this.respondWithSelection(this.selectionResult(2));
  }

  // ============================================
  // Step 4: module B (child) and defaults
  // ============================================

  async submit_child(): Promise<ReactNode | Record<string, unknown>> {
    this.securityService().make_sure_allowed();

    const selected = String(post("selected", true) ?? "");
    const parent = String(this.getWizard().parent_module ?? "");

    if (
      selected === "" ||
      !this.relationsModel().is_relation_table(selected) ||
      selected === parent
    ) {
      return this.failure("select_module", "Please choose a valid module.");
    }

    const pluralMaker = await this.pluralMaker();
    const singular_a = pluralMaker.get_singular(parent);
    const singular_b = pluralMaker.get_singular(selected);
    const plural_a = pluralMaker.make_plural(singular_a);
    const plural_b = pluralMaker.make_plural(singular_b);

    const wizard = this.updateWizard({
      child_module: selected,
      singular_a,
      singular_b,
      plural_a,
      plural_b,
      identifier_column_a:
        this.relationsModel().get_default_identifier_column(parent),
      identifier_column_b:
        this.relationsModel().get_default_identifier_column(selected),
    });

    const type = String(wizard.relation_type ?? "");

    if (type === "one to many") {
      this.updateWizard({ bridging_table: false });
      return this.respondWithConfirmation(this.confirmationData());
    }

    if (type === "many to many") {
      this.updateWizard({ bridging_table: true });
      return this.respondWithConfirmation(this.confirmationData());
    }

    // one-to-one: ask the bridging question first.
    if (this.isAjax()) {
      return {
        ok: true,
        next_step: "bridging_question",
        wizard: this.getWizard(),
      };
    }

    return this.renderStep("bridging_question", {
      wizard: this.getWizard(),
    });
  }

  async submit_bridging_option(): Promise<
    ReactNode | Record<string, unknown>
  > {
    this.securityService().make_sure_allowed();

    const selected = String(post("selected", true) ?? "");

    if (!["Yes", "No"].includes(selected)) {
      return this.failure(
        "bridging_question",
        "Please choose a valid option."
      );
    }

    this.updateWizard({ bridging_table: selected === "Yes" });
    return this.respondWithConfirmation(this.confirmationData());
  }

  // ============================================
  // Confirmation
  // ============================================

  private confirmationData(): Record<string, unknown> {
    const wizard = this.getWizard();
    const parent = String(wizard.parent_module ?? "");
    const child = String(wizard.child_module ?? "");

    return {
      ok: true,
      next_step: "conf_generate_relation",
      wizard,
      parent_label: ucwords(parent.replace(/_/g, " ")),
      child_label: ucwords(child.replace(/_/g, " ")),
      module_a_manage_url: site_url(`${parent}/manage`),
      module_b_manage_url: site_url(`${child}/manage`),
      relation_details_url: site_url(
        "trongate_control-module_relations_builder/relation_details/web"
      ),
    };
  }

  private respondWithConfirmation(
    data: Record<string, unknown>
  ): Promise<ReactNode> | Record<string, unknown> {
    if (this.isAjax()) return data;
    return this.renderStep("conf_generate_relation", data);
  }

  async conf_generate_relation(): Promise<
    ReactNode | Record<string, unknown>
  > {
    this.securityService().make_sure_allowed();

    const wizard = this.getWizard();
    if (
      String(wizard.parent_module ?? "") === "" ||
      String(wizard.child_module ?? "") === ""
    ) {
      return this.choose_relation_type();
    }

    return this.renderStep("conf_generate_relation", this.confirmationData());
  }

  // ============================================
  // Editable details overlay
  // ============================================

  async relation_details(): Promise<ReactNode> {
    this.securityService().make_sure_allowed();

    const wizard = this.getWizard();
    const after_close_url = site_url(
      "trongate_control-module_relations_builder/conf_generate_relation?template=c64"
    );

    const data: TgTemplateData = {
      viewModule: "module_relations_builder",
      viewFile: "conf_relation_details",
      pageTitle: "Relation Details",
      wizard,
      relation_type_options: {
        "one to one": "One to One",
        "one to many": "One to Many",
        "many to many": "Many to Many",
      },
      after_close_url,
      form_location: after_close_url.replace(
        "/conf_generate_relation",
        "/submit_relation_details"
      ),
      after_close_width: 800,
      after_close_height: 600,
    };

    if (String(segment(3)) === "web") {
      return this.templates.module_details(data);
    }

    return this.templates.admin(data);
  }

  async submit_relation_details(): Promise<Record<string, unknown>> {
    this.securityService().make_sure_allowed();

    const identifier_a = String(post("identifierColumnA", true) ?? "");
    const identifier_b = String(post("identifierColumnB", true) ?? "");
    const wizard = this.getWizard();

    const parent = String(wizard.parent_module ?? "");
    const child = String(wizard.child_module ?? "");
    const errors: Record<string, string[]> = {};

    if (!this.relationsModel().identifier_columns_valid(identifier_a, parent)) {
      errors.identifierColumnA = [
        `Identifier column A contains a column that does not exist on the ${parent} table.`,
      ];
    }

    if (!this.relationsModel().identifier_columns_valid(identifier_b, child)) {
      errors.identifierColumnB = [
        `Identifier column B contains a column that does not exist on the ${child} table.`,
      ];
    }

    if (Object.keys(errors).length > 0) {
      return { ok: false, errors };
    }

    this.updateWizard({
      identifier_column_a: identifier_a.trim(),
      identifier_column_b: identifier_b.trim(),
    });

    return {
      ok: true,
      posted_items: {
        identifierColumnA: identifier_a.trim(),
        identifierColumnB: identifier_b.trim(),
      },
    };
  }

  public identifier_column_a_check(identifierColumnA: string): true | string {
    const parent = String(this.getWizard().parent_module ?? "");
    if (
      !this.relationsModel().identifier_columns_valid(
        identifierColumnA,
        parent
      )
    ) {
      return `Identifier column A contains a column that does not exist on the ${parent} table.`;
    }
    return true;
  }

  public identifier_column_b_check(identifierColumnB: string): true | string {
    const child = String(this.getWizard().child_module ?? "");
    if (
      !this.relationsModel().identifier_columns_valid(
        identifierColumnB,
        child
      )
    ) {
      return `Identifier column B contains a column that does not exist on the ${child} table.`;
    }
    return true;
  }

  // ============================================
  // Generation
  // ============================================

  async run_gen(): Promise<ReactNode | Record<string, unknown>> {
    this.securityService().make_sure_allowed();

    const wizard = this.getWizard();
    const type = String(wizard.relation_type ?? "");
    const parent = String(wizard.parent_module ?? "");
    const child = String(wizard.child_module ?? "");

    if (type === "" || parent === "" || child === "") {
      return this.generationFailure(
        "Relation could not be created because the wizard data is incomplete.",
        wizard
      );
    }

    let settings_written = false;

    try {
      // 1. Eligibility + injection preflight: every check before any write.
      this.relationsModel().guard_relation_ready(wizard);
      const plan = this.preflight(wizard);

      // 2. Schema first (single statement per query call).
      for (const statement of this.relationsModel().build_relation_sql(wizard)) {
        this.db.query(statement);
      }

      // 3. Settings only after the schema exists.
      this.relationsModel().write_settings_file(wizard);
      settings_written = true;

      // 4. Code injection last.
      this.commit(plan);
    } catch (error) {
      if (settings_written) {
        this.relationsModel().delete_settings_file(wizard);
      }
      return this.generationFailure(
        error instanceof Error ? error.message : String(error),
        wizard
      );
    }

    const data = {
      ok: true,
      parent_label: ucwords(parent.replace(/_/g, " ")),
      child_label: ucwords(child.replace(/_/g, " ")),
      module_a_manage_url: site_url(`${parent}/manage`),
      module_b_manage_url: site_url(`${child}/manage`),
      wizard,
    };

    if (this.isAjax()) return data;
    return this.renderStep("generate_relation", data);
  }

  private generationFailure(
    message: string,
    wizard: RelationsWizard = {}
  ): Promise<ReactNode> | Record<string, unknown> {
    const headline = "Generation Error";
    if (this.isAjax()) return { ok: false, headline, message };
    return this.renderStep("generate_relation", {
      error: message,
      headline,
      wizard,
    });
  }

  // ============================================
  // Injection plan
  // ============================================

  private modulePath(module: string, relative: string): string {
    const dir = this.relationsModel().get_module_dir(module);
    if (dir === null) {
      throw new Error(
        `Injection aborted: the '${module}' module folder could not be found.`
      );
    }
    return path.join(dir, relative);
  }

  private planItem(
    module: string,
    relative: string,
    item: Omit<InjectionItem, "path" | "displayPath">
  ): InjectionItem {
    const absolute = this.modulePath(module, relative);
    return {
      ...item,
      path: absolute,
      displayPath: this.relationsModel().relative_path(absolute),
    };
  }

  private build_plan(wizard: RelationsWizard): InjectionItem[] {
    const type = String(wizard.relation_type ?? "");
    const module_a = String(wizard.parent_module ?? "");
    const module_b = String(wizard.child_module ?? "");
    const singular_a = this.relationsModel().column_name(
      String(wizard.singular_a ?? "")
    );
    const singular_b = this.relationsModel().column_name(
      String(wizard.singular_b ?? "")
    );
    const bridging = Boolean(wizard.bridging_table ?? false);

    const panels = [
      ...this.planShowPanel(module_a, module_b),
      ...this.planShowPanel(module_b, module_a),
    ];

    if (type === "one to one" && !bridging) {
      return [
        ...this.planFormModule(module_a, module_b, singular_b, true),
        ...this.planFormModule(module_b, module_a, singular_a, true),
        ...panels,
      ];
    }

    if (type === "one to many") {
      const plural_b = String(wizard.plural_b ?? module_b);
      return [
        ...this.planFormModule(module_b, module_a, singular_a, false),
        ...this.planParentDeleteHook(
          module_a,
          module_b,
          singular_a,
          plural_b
        ),
        ...panels,
      ];
    }

    if (type === "one to one") {
      return panels;
    }

    return [
      ...this.planJunctionDeleteHook(module_a, module_b),
      ...this.planJunctionDeleteHook(module_b, module_a),
      ...panels,
    ];
  }

  /** One module's show page: fetch, data key and panel expression. */
  private planShowPanel(module: string, alt_module: string): InjectionItem[] {
    const controller = `${ucfirst(module)}.ts`;
    const fetch_marker = `// flo_relation: summary panel fetch ${alt_module}`;
    const data_marker = `// flo_relation: summary panel data ${alt_module}`;
    const expression = summaryPanelExpression(alt_module);

    return [
      this.planItem(module, controller, {
        anchorKind: "exact",
        anchor: SHOW_FETCH_ANCHOR,
        insert: "after",
        block: summaryPanelFetchBlock(alt_module),
        marker: fetch_marker,
      }),
      this.planItem(module, controller, {
        anchorKind: "exact",
        anchor: SHOW_DATA_TAIL_ANCHOR,
        insert: "after",
        block: summaryPanelDataBlock(alt_module),
        marker: data_marker,
      }),
      this.planItem(module, path.join("views", "show.tsx"), {
        anchorKind: "show-tail",
        anchor: "",
        insert: "after",
        block: expression,
        marker: expression,
      }),
    ];
  }

  /** One module's create form + (optionally) 1:1 sync/delete methods. */
  private planFormModule(
    module: string,
    alt_module: string,
    alt_singular: string,
    with_sync: boolean
  ): InjectionItem[] {
    const fk = this.relationsModel().fk_name(alt_singular);
    const options_var = this.relationsModel().options_var(alt_singular);
    const label = this.relationsModel().label(alt_singular);
    const controller = `${ucfirst(module)}.ts`;
    const model = `${ucfirst(module)}_model.ts`;
    const create_view = path.join("views", "create.tsx");

    const plan: InjectionItem[] = [
      this.planItem(module, controller, {
        anchorKind: "exact",
        anchor:
          "    return this.templates.admin(this.build_create_data(data, update_id));",
        insert: "before",
        block: optionsFetchBlock(fk, options_var, alt_singular),
        marker: `// flo_relation: ${fk} options fetch`,
      }),
      this.planItem(module, controller, {
        anchorKind: "class-end",
        anchor: "",
        insert: "before",
        block: getOptionsMethodBlock(
          alt_singular,
          label,
          module,
          alt_module
        ),
        marker: `private async get_${alt_singular}_options(`,
      }),
      this.planItem(module, create_view, {
        anchorKind: "exact",
        anchor: '            <div className="text-center">',
        insert: "before",
        block: dropdownRowBlock(fk, options_var, label),
        marker: `{/* flo_relation: ${fk} dropdown row */}`,
        refuseField: fk,
      }),
      this.planItem(module, model, {
        anchorKind: "exact",
        anchor: "    return {",
        insert: "after",
        block: postedDataBlock(fk),
        marker: `// flo_relation: ${fk} posted data`,
      }),
    ];

    if (!with_sync) return plan;

    plan.push(
      this.planItem(module, controller, {
        anchorKind: "exact",
        anchor: "      this.moduleModel().update_record(update_id, data);",
        insert: "before",
        block: prevCaptureBlock(fk),
        marker: `// flo_relation: ${fk} prev capture`,
      }),
      this.planItem(module, controller, {
        anchorKind: "exact",
        anchor:
          "    update_id = this.moduleModel().create_new_record(data);",
        insert: "after",
        block: syncOnSaveCreateBlock(alt_singular, fk),
        marker: `// flo_relation: ${fk} sync on save`,
      }),
      this.planItem(module, controller, {
        anchorKind: "exact",
        anchor: "      this.moduleModel().update_record(update_id, data);",
        insert: "after",
        block: syncOnSaveUpdateBlock(alt_singular, fk),
        marker: `// flo_relation: ${fk} sync on save`,
      }),
      this.planItem(module, controller, {
        anchorKind: "class-end",
        anchor: "",
        insert: "before",
        block: syncMethodBlock(alt_singular, module, alt_module),
        marker: `private async sync_with_${alt_singular}(`,
      }),
      this.planItem(module, controller, {
        anchorKind: "exact",
        anchor: "    this.moduleModel().delete_record(update_id);",
        insert: "before",
        block: deleteHookBlock(alt_singular, fk),
        marker: `// flo_relation: ${fk} delete hook`,
      }),
      this.planItem(module, controller, {
        anchorKind: "class-end",
        anchor: "",
        insert: "before",
        block: releaseMethodBlock(alt_singular, module, alt_module),
        marker: `private async release_${alt_singular}_link(`,
      })
    );

    return plan;
  }

  /** Parent (1:N) delete hook + release_children method. */
  private planParentDeleteHook(
    module: string,
    child_module: string,
    singular: string,
    plural: string
  ): InjectionItem[] {
    const fk = this.relationsModel().fk_name(singular);
    const controller = `${ucfirst(module)}.ts`;

    return [
      this.planItem(module, controller, {
        anchorKind: "exact",
        anchor: "    this.moduleModel().delete_record(update_id);",
        insert: "before",
        block: parentDeleteHookBlock(fk, plural),
        marker: `// flo_relation: ${fk} delete hook`,
      }),
      this.planItem(module, controller, {
        anchorKind: "class-end",
        anchor: "",
        insert: "before",
        block: releaseChildrenMethodBlock(plural, module, child_module),
        marker: `private async release_${plural}_links(`,
      }),
    ];
  }

  /** One side of a junction relation: delete hook + release method. */
  private planJunctionDeleteHook(
    module: string,
    alt_module: string
  ): InjectionItem[] {
    const controller = `${ucfirst(module)}.ts`;

    return [
      this.planItem(module, controller, {
        anchorKind: "exact",
        anchor: "    this.moduleModel().delete_record(update_id);",
        insert: "before",
        block: junctionDeleteHookBlock(),
        marker: "// flo_relation: junction delete hook",
      }),
      this.planItem(module, controller, {
        anchorKind: "class-end",
        anchor: "",
        insert: "before",
        block: releaseJunctionMethodBlock(module, alt_module),
        marker: "private async release_junction_links(",
      }),
    ];
  }

  // ============================================
  // Injection preflight / apply
  // ============================================

  private preflight(wizard: RelationsWizard): InjectionPlan {
    const items = this.build_plan(wizard);
    const originals: Record<string, string> = {};
    const updates: Record<string, string> = {};

    for (const item of items) {
      if (!fs.existsSync(item.path) || !fs.statSync(item.path).isFile()) {
        throw new Error(
          `Injection aborted: target file does not exist - ${item.displayPath}`
        );
      }

      if (originals[item.path] === undefined) {
        try {
          fs.accessSync(item.path, fs.constants.W_OK);
        } catch {
          throw new Error(
            `Injection aborted: target file is not writable - ${item.displayPath}`
          );
        }

        originals[item.path] = fs.readFileSync(item.path, "utf8");
        updates[item.path] = this.normalize_line_endings(
          originals[item.path]
        );
      }

      const content = originals[item.path];

      if (item.anchorKind === "show-tail") {
        if (item.marker !== "" && content.includes(item.marker)) {
          throw new Error(
            `Injection refused: "${this.excerpt(item.marker)}" is already present in ${item.displayPath} - never double-inject.`
          );
        }
        if (!this.view_tail_is_panel_calls(content)) {
          throw new Error(
            `Injection aborted: the show view does not end with the details card - ${item.displayPath}. The panel belongs after that card; adjust the view or wire the panel manually.`
          );
        }
      } else if (item.anchorKind === "class-end") {
        const trimmed = content.trimEnd();
        if (trimmed === "" || !trimmed.endsWith("}")) {
          throw new Error(
            `Injection aborted: class-closing brace not found at the end of ${item.displayPath}.`
          );
        }
      } else {
        const count = this.countOccurrences(content, item.anchor);
        if (count !== 1) {
          throw new Error(
            `Injection aborted: anchor "${this.excerpt(item.anchor)}" found ${count} time(s) in ${item.displayPath} (expected exactly 1).`
          );
        }
      }

      if (item.marker !== "" && content.includes(item.marker)) {
        throw new Error(
          `Injection refused: "${this.excerpt(item.marker)}" is already present in ${item.displayPath} - never double-inject.`
        );
      }

      if (
        item.refuseField !== undefined &&
        this.hasFieldCall(content, item.refuseField)
      ) {
        throw new Error(
          `Injection aborted: ${item.displayPath} already contains a form field for "${item.refuseField}". The relations wizard will not replace an existing field - remove it first or wire the relation manually.`
        );
      }

      if (item.needsRecord === true) {
        const count = this.countOccurrences(content, RECORD_LOAD_ANCHOR);
        if (count !== 1) {
          throw new Error(
            `Injection aborted: the delete flow in ${item.displayPath} does not match the supported scaffold - expected exactly one record-load line, found ${count}.`
          );
        }
      }

      updates[item.path] = this.applyItem(updates[item.path], item);
    }

    for (const [file_path, new_content] of Object.entries(updates)) {
      this.assert_parses(new_content, this.relationsModel().relative_path(file_path));
    }

    return { items, originals, updates };
  }

  private view_tail_is_panel_calls(content: string): boolean {
    const trimmed = content.trimEnd();
    const card_end = trimmed.lastIndexOf("</div>");
    if (card_end === -1) return false;

    const tail = trimmed.slice(card_end + 6);
    const closing = "\n    </>\n  );\n}";

    if (!tail.endsWith(closing)) return false;

    const between = tail.slice(0, tail.length - closing.length);
    const panel_pattern =
      /^\{data\.[A-Za-z0-9_]+ as import\("react"\)\.ReactNode\}$/;

    for (const line of between.split("\n")) {
      const value = line.trim();
      if (value === "") continue;
      if (!panel_pattern.test(value)) return false;
    }

    return true;
  }

  private applyItem(content: string, item: InjectionItem): string {
    if (item.anchorKind === "class-end") {
      const trimmed = content.trimEnd();
      return `${trimmed.slice(0, -1)}\n${item.block.trimEnd()}\n}\n`;
    }

    if (item.anchorKind === "show-tail") {
      const position = content.lastIndexOf(SHOW_FRAGMENT_END);
      if (position === -1) {
        throw new Error(
          `Injection aborted: fragment closing tag not found in ${item.displayPath}.`
        );
      }
      return (
        content.slice(0, position) +
        "\n" +
        item.block.trimEnd() +
        content.slice(position)
      );
    }

    if (item.insert === "after") {
      return content.replace(
        item.anchor,
        `${item.anchor}\n${item.block.trimEnd()}`
      );
    }

    const position = content.indexOf(item.anchor);
    if (position === -1) {
      throw new Error(
        `Injection aborted: anchor not found in ${item.displayPath}.`
      );
    }

    const line_start = content.lastIndexOf("\n", position - 1) + 1;
    return (
      content.slice(0, line_start) +
      item.block.trimEnd() +
      "\n" +
      content.slice(line_start)
    );
  }

  private commit(plan: InjectionPlan): void {
    const written: string[] = [];

    try {
      for (const [file_path, new_content] of Object.entries(plan.updates)) {
        fs.writeFileSync(file_path, new_content, "utf8");
        written.push(file_path);
      }
    } catch {
      for (const file_path of written) {
        try {
          fs.writeFileSync(file_path, plan.originals[file_path], "utf8");
        } catch {
          /* best effort rollback */
        }
      }
      throw new Error(
        "Injection failed: a target file could not be written. Every file written by this run has been restored."
      );
    }
  }

  private assert_parses(code: string, file: string): void {
    const result = ts.transpileModule(code, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
      fileName: file.endsWith(".tsx") ? file : `${file}.ts`,
      reportDiagnostics: true,
    });

    const errors = (result.diagnostics ?? []).filter(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
    );

    if (errors.length > 0) {
      const message = ts.flattenDiagnosticMessageText(
        errors[0].messageText,
        " "
      );
      throw new Error(
        `Injection aborted: the generated code for ${file} would not parse (${message}). No files were changed.`
      );
    }
  }

  private normalize_line_endings(content: string): string {
    return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  private countOccurrences(content: string, anchor: string): number {
    if (anchor === "") return 0;
    let count = 0;
    let position = 0;

    while (true) {
      const found = content.indexOf(anchor, position);
      if (found === -1) break;
      count += 1;
      position = found + anchor.length;
    }

    return count;
  }

  private hasFieldCall(content: string, field: string): boolean {
    const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`name\\s*=\\s*["']${escaped}["']`).test(content);
  }

  private excerpt(value: string): string {
    const one_line = value.replace(/\n/g, " ");
    return one_line.length > 60
      ? `${one_line.slice(0, 57)}...`
      : one_line;
  }
}
