import * as fs from "node:fs";
import * as nodePath from "node:path";
import { escape_identifier, type Row } from "@/engine/db";
import { Model } from "@/engine/model";
import { DATA_DIR, MODULES_DIR, PROJECT_ROOT } from "@/engine/paths";

/**
 * Module_relations_model — runtime data layer for module relations.
 *
 * Port of modules/module_relations/Module_relations_model.php. Serves three
 * runtime needs for relations already created by the control panel's relation
 * builder:
 *
 *   - the show-page "Associated …" panel (list current associations, list
 *     available options, create/remove an association);
 *   - dropdown options and one-to-one claim/release for a generated module's
 *     create/edit form;
 *   - one-to-one / one-to-many / junction release on a generated module's
 *     delete hook.
 *
 * Settings shape (JSON file, unchanged from the PHP builder):
 *   settings[0] — module "A" entry {module_name, record_name_singular,
 *                 record_name_plural, identifier_column}
 *   settings[1] — module "B" entry, same shape
 *   settings[2] — relation config {relationship_type, bridging_table}
 *
 * MySQL → SQLite adaptations:
 *   - SHOW COLUMNS FROM `t` → PRAGMA table_info(`t`)
 *   - CONCAT_WS(' ', …)     → the identifier columns are selected into
 *                             ident_0..ident_n and joined in JavaScript
 *                             (see row_value())
 *   - backticks are kept; the engine's escape_identifier() emits them and
 *     SQLite accepts them.
 *
 * Settings file lookup: the PHP original reads
 * APPPATH . 'modules/module_relations/settings'. The port searches (in order):
 *   ET_MODULE_RELATIONS_SETTINGS_DIR (env override), <root>/modules/…/settings
 *   (PHP-compatible), src/modules/module_relations/settings,
 *   data/module_relations/settings, data/settings/module_relations.
 */

const SAFE_IDENTIFIER = /^[a-z0-9_]+$/;

export interface RelationEntry {
  module_name?: string;
  record_name_singular?: string;
  record_name_plural?: string;
  identifier_column?: string;
  relationship_type?: string;
  bridging_table?: boolean;
  [key: string]: unknown;
}

/** Decoded relation settings — [module A, module B, relation config]. */
export type RelationSettings = RelationEntry[];

export interface AssociatedRow {
  id: number;
  foreign_key: number;
  value: string;
}

export interface AvailableOption {
  key: number;
  value: string;
}

/** form_dropdown()-style map: id → display value ('— None —' uses key 0). */
export type OptionsDropdown = Record<number, string>;

export class Module_relations_model extends Model {
  // ============================================
  // Introspection helpers
  // ============================================

  /**
   * Real column names of a table (PHP: SHOW COLUMNS FROM). Used as the
   * whitelist that identifier_column values are checked against, so a stale or
   * malformed settings entry can never reach a query.
   */
  get_table_columns(table: string): string[] {
    if (table === "" || !SAFE_IDENTIFIER.test(table)) return [];
    if (!this.db.table_exists(table)) return [];

    const rows = this.db.query_bind(
      `PRAGMA table_info(${escape_identifier(table)})`,
      []
    ) as Row[];

    return rows
      .map((row) => String(row.name ?? ""))
      .filter((name) => name !== "");
  }

  // ============================================
  // Create-form runtime data (create-form injection)
  // ============================================

  /**
   * Dropdown options for a generated create/edit form's relation field
   * (PHP: fetch_create_options()).
   */
  fetch_create_options(
    settings: RelationSettings,
    calling_module: string,
    selected_key = 0
  ): OptionsDropdown {
    const module_a = String(settings[0]?.module_name ?? "");
    const module_b = String(settings[1]?.module_name ?? "");
    const relationship_type = String(settings[2]?.relationship_type ?? "");

    if (calling_module !== module_a && calling_module !== module_b) return {};

    const alt = this.est_associated_module(settings, calling_module);
    if (alt === null) return {};

    if (relationship_type === "one to many") {
      if (calling_module === module_a) {
        return {}; // Parent view: children are managed from the show panel.
      }
      return { 0: "— None —", ...options_to_dropdown(this.select_options(alt, [])) };
    }

    if (this.is_direct_one_to_one(settings)) {
      const calling_entry = this.get_settings_for_module(settings, calling_module);
      const back_fk = this.fk_column(calling_entry);
      const params: Record<string, unknown> = {};
      let where = `(${column("alt", back_fk)} IS NULL OR ${column("alt", back_fk)} = 0)`;
      if (selected_key > 0) {
        // Include the currently-linked record even though its back-FK is
        // claimed — otherwise editing would hide the existing partner.
        where += " OR alt.id = :selected_key";
        params.selected_key = selected_key;
      }
      const options = this.select_options(alt, [where], params);
      return { 0: "— None —", ...options_to_dropdown(options) };
    }

    return {}; // Junction-backed relations have no create-form dropdown.
  }

  /**
   * Bidirectional one-to-one claim/release (PHP: sync_create_claim()). No-op
   * for any other relation type or an invalid record id.
   */
  sync_create_claim(
    settings: RelationSettings,
    calling_module: string,
    update_id: number,
    value: number,
    prev_value = 0
  ): void {
    if (update_id < 1) return;
    if (!this.is_direct_one_to_one(settings)) return;

    const calling_entry = this.get_settings_for_module(settings, calling_module);
    const alt = this.est_associated_module(settings, calling_module);
    if (alt === null) return;

    const alt_table = table_of(alt);
    const alt_fk = this.fk_column(alt); // column on the calling table
    const back_fk = this.fk_column(calling_entry); // column on the alt table

    // 1. Edit path: release the previous partner's back-FK — only when the
    //    partner actually changed and only while it still points at us.
    if (prev_value > 0 && prev_value !== value) {
      this.db.query_bind(
        `UPDATE ${escape_identifier(alt_table)} SET ${escape_identifier(back_fk)} = 0` +
          ` WHERE id = :prev_value AND ${escape_identifier(back_fk)} = :update_id`,
        { prev_value, update_id }
      );
    }

    if (value < 1) return;

    // 2. Release the chosen alt record from any previous owner other than us.
    const owner = this.db.query_bind(
      `SELECT ${escape_identifier(back_fk)} AS owner_id FROM ${escape_identifier(alt_table)} WHERE id = :value`,
      { value }
    ) as Row[];
    const prev_owner_id = Number(owner[0]?.owner_id ?? 0);
    if (prev_owner_id > 0 && prev_owner_id !== update_id) {
      this.db.query_bind(
        `UPDATE ${escape_identifier(calling_module)} SET ${escape_identifier(alt_fk)} = 0 WHERE id = :prev_owner_id`,
        { prev_owner_id }
      );
    }

    // 3. Claim both sides.
    this.db.query_bind(
      `UPDATE ${escape_identifier(calling_module)} SET ${escape_identifier(alt_fk)} = :value WHERE id = :update_id`,
      { update_id, value }
    );
    this.db.query_bind(
      `UPDATE ${escape_identifier(alt_table)} SET ${escape_identifier(back_fk)} = :update_id WHERE id = :value`,
      { update_id, value }
    );
  }

  /**
   * Release a direct one-to-one link when a record is deleted — called BEFORE
   * the row is removed (PHP: release_create_link()).
   */
  release_create_link(
    settings: RelationSettings,
    calling_module: string,
    update_id: number
  ): void {
    if (update_id < 1) return;
    if (!this.is_direct_one_to_one(settings)) return;

    const calling_entry = this.get_settings_for_module(settings, calling_module);
    const alt = this.est_associated_module(settings, calling_module);
    if (alt === null) return;

    const back_fk = this.fk_column(calling_entry);
    this.db.query_bind(
      `UPDATE ${escape_identifier(table_of(alt))} SET ${escape_identifier(back_fk)} = 0` +
        ` WHERE ${escape_identifier(back_fk)} = :update_id`,
      { update_id }
    );
  }

  /**
   * Release every child when a one-to-many PARENT record is deleted — called
   * BEFORE the row is removed (PHP: release_children()). No-op on the child
   * side: nothing references a deleted child.
   */
  release_children(
    settings: RelationSettings,
    calling_module: string,
    update_id: number
  ): void {
    if (update_id < 1) return;
    if (String(settings[2]?.relationship_type ?? "") !== "one to many") return;

    const parent = String(settings[0]?.module_name ?? "");
    if (calling_module !== parent) return;

    const child = String(settings[1]?.module_name ?? "");
    const fk = this.fk_column(settings[0]);
    this.db.query_bind(
      `UPDATE ${escape_identifier(child)} SET ${escape_identifier(fk)} = 0` +
        ` WHERE ${escape_identifier(fk)} = :update_id`,
      { update_id }
    );
  }

  /**
   * Remove junction rows referencing a record being deleted (PHP:
   * release_junction_links()). The PHP original sweeps the calling side's FK
   * column; that behaviour is kept exactly.
   */
  release_junction_links(
    settings: RelationSettings,
    calling_module: string,
    update_id: number
  ): void {
    if (update_id < 1) return;

    const type = String(settings[2]?.relationship_type ?? "");
    if (type === "one to many" || this.is_direct_one_to_one(settings)) return;

    const alt = this.est_associated_module(settings, calling_module);
    if (alt === null) return;

    const junction = junction_table(settings);
    const calling_fk = this.junction_fk(settings, calling_module);
    this.db.query_bind(
      `DELETE FROM ${escape_identifier(junction)}` +
        ` WHERE ${escape_identifier(calling_fk)} = :update_id`,
      { update_id }
    );
  }

  // ============================================
  // Settings JSON (runtime contract)
  // ============================================

  /** Directories searched for relation settings files, in priority order. */
  private settings_dirs(): string[] {
    const dirs: string[] = [];

    const env = process.env.ET_MODULE_RELATIONS_SETTINGS_DIR;
    if (env !== undefined && env.trim() !== "") dirs.push(env.trim());

    dirs.push(nodePath.join(PROJECT_ROOT, "modules", "module_relations", "settings"));
    dirs.push(nodePath.join(MODULES_DIR, "module_relations", "settings"));
    dirs.push(nodePath.join(DATA_DIR, "module_relations", "settings"));
    dirs.push(nodePath.join(DATA_DIR, "settings", "module_relations"));

    return dirs;
  }

  /**
   * Read and decode the settings file for an unordered pair of modules
   * (PHP: get_relation_settings()). Both filename orders are tried.
   *
   * Returns null when either module name is malformed/empty, no settings file
   * exists for the pair, or its contents don't decode to a well-formed array.
   */
  get_relation_settings(
    module_a: string,
    module_b: string
  ): RelationSettings | null {
    if (module_a === "" || module_b === "") return null;
    if (!SAFE_IDENTIFIER.test(module_a) || !SAFE_IDENTIFIER.test(module_b)) {
      return null;
    }

    const filenames = [
      `${module_a}_and_${module_b}.json`,
      `${module_b}_and_${module_a}.json`,
    ];

    for (const dir of this.settings_dirs()) {
      for (const filename of filenames) {
        const file = nodePath.join(dir, filename);
        if (!fs.existsSync(file)) continue;

        try {
          const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
          if (!Array.isArray(parsed) || parsed.length < 3) return null;
          return parsed as RelationSettings;
        } catch {
          return null;
        }
      }
    }

    return null;
  }

  /**
   * The settings entry for the OTHER module in a relation
   * (PHP: est_associated_module()). Null when the calling module isn't part
   * of the relation.
   */
  est_associated_module(
    settings: RelationSettings,
    calling_module: string
  ): RelationEntry | null {
    const module_a = String(settings[0]?.module_name ?? "");
    const module_b = String(settings[1]?.module_name ?? "");

    if (calling_module === module_a) return settings[1] ?? null;
    if (calling_module === module_b) return settings[0] ?? null;
    return null;
  }

  // ============================================
  // Runtime association data (show-page panels)
  // ============================================

  /** The settings entry belonging to a specific module name. */
  get_settings_for_module(
    settings: RelationSettings,
    module_name: string
  ): RelationEntry {
    for (const entry of settings) {
      if (String(entry?.module_name ?? "") === module_name) return entry;
    }
    return {};
  }

  /**
   * Whether the settings describe a direct (non-bridged) one-to-one relation —
   * mirrored FK columns on both tables instead of a junction table.
   */
  is_direct_one_to_one(settings: RelationSettings): boolean {
    return (
      String(settings[2]?.relationship_type ?? "") === "one to one" &&
      (settings[2]?.bridging_table ?? false) === false
    );
  }

  /**
   * Records currently associated with the calling record
   * (PHP: fetch_associated_rows()). Row shape: {id, foreign_key, value} —
   * `id` is the junction row id for junction-backed relations and the
   * associated record's id otherwise.
   */
  fetch_associated_rows(
    settings: RelationSettings,
    calling_module: string,
    update_id: number
  ): AssociatedRow[] {
    const module_a = String(settings[0]?.module_name ?? "");
    const module_b = String(settings[1]?.module_name ?? "");
    const relationship_type = String(settings[2]?.relationship_type ?? "");

    if (calling_module !== module_a && calling_module !== module_b) return [];

    const alt = this.est_associated_module(settings, calling_module);
    if (alt === null) return [];

    if (relationship_type === "one to many") {
      return this.fetch_one_to_many_associated(settings, calling_module, update_id);
    }

    const alt_table = table_of(alt);

    if (this.is_direct_one_to_one(settings)) {
      const calling_entry = this.get_settings_for_module(settings, calling_module);
      const back_fk = this.fk_column(calling_entry);
      const sql =
        `SELECT alt.id AS id, alt.id AS foreign_key${this.ident_select(alt, "alt")}` +
        ` FROM ${escape_identifier(alt_table)} alt` +
        ` INNER JOIN ${escape_identifier(calling_module)} calling` +
        ` ON calling.id = alt.${escape_identifier(back_fk)}` +
        ` WHERE calling.id = :update_id` +
        ` ORDER BY ${this.identifier_order(alt, "alt")}`;
      return this.to_associated_rows(alt, this.db.query_bind(sql, { update_id }) as Row[]);
    }

    // Junction-backed (one to one with a bridge, or many to many). `id` must
    // be the JUNCTION row id (what remove_association() deletes by).
    const junction = junction_table(settings);
    const calling_fk = this.junction_fk(settings, calling_module);
    const alt_fk = this.fk_column(alt);
    const sql =
      `SELECT assoc.id AS id, assoc.${escape_identifier(alt_fk)} AS foreign_key${this.ident_select(alt, "alt")}` +
      ` FROM ${escape_identifier(junction)} assoc` +
      ` INNER JOIN ${escape_identifier(alt_table)} alt ON alt.id = assoc.${escape_identifier(alt_fk)}` +
      ` WHERE assoc.${escape_identifier(calling_fk)} = :update_id` +
      ` ORDER BY ${this.identifier_order(alt, "alt")}`;
    return this.to_associated_rows(alt, this.db.query_bind(sql, { update_id }) as Row[]);
  }

  /**
   * Records that could be newly associated with the calling record — the
   * options offered in the show-page panel's add dropdown
   * (PHP: fetch_available_options()).
   */
  fetch_available_options(
    settings: RelationSettings,
    calling_module: string,
    update_id: number
  ): AvailableOption[] {
    const module_a = String(settings[0]?.module_name ?? "");
    const module_b = String(settings[1]?.module_name ?? "");
    const relationship_type = String(settings[2]?.relationship_type ?? "");

    if (calling_module !== module_a && calling_module !== module_b) return [];

    const alt = this.est_associated_module(settings, calling_module);
    if (alt === null) return [];

    const alt_table = escape_identifier(table_of(alt));
    const order = this.identifier_order(alt, "alt");

    if (relationship_type === "one to many") {
      if (calling_module === module_b) {
        // Child view: every parent record.
        const sql = `SELECT alt.id AS id${this.ident_select(alt, "alt")} FROM ${alt_table} alt ORDER BY ${order}`;
        return this.to_options(alt, this.db.query_bind(sql, []) as Row[]);
      }
      // Parent view: unclaimed children only.
      const fk_a = this.fk_column(settings[0]);
      const sql =
        `SELECT alt.id AS id${this.ident_select(alt, "alt")} FROM ${alt_table} alt` +
        ` WHERE (${column("alt", fk_a)} IS NULL OR ${column("alt", fk_a)} = 0)` +
        ` ORDER BY ${order}`;
      return this.to_options(alt, this.db.query_bind(sql, []) as Row[]);
    }

    if (this.is_direct_one_to_one(settings)) {
      // Unclaimed alt records only (back-FK NULL or 0).
      const calling_entry = this.get_settings_for_module(settings, calling_module);
      const back_fk = this.fk_column(calling_entry);
      const sql =
        `SELECT alt.id AS id${this.ident_select(alt, "alt")} FROM ${alt_table} alt` +
        ` WHERE (${column("alt", back_fk)} IS NULL OR ${column("alt", back_fk)} = 0)` +
        ` ORDER BY ${order}`;
      return this.to_options(alt, this.db.query_bind(sql, []) as Row[]);
    }

    const junction = escape_identifier(junction_table(settings));
    const calling_fk = this.junction_fk(settings, calling_module);
    const alt_fk = this.fk_column(alt);

    if (relationship_type === "many to many") {
      const sql =
        `SELECT alt.id AS id${this.ident_select(alt, "alt")} FROM ${alt_table} alt` +
        ` WHERE alt.id NOT IN (SELECT assoc.${escape_identifier(alt_fk)} FROM ${junction} assoc` +
        ` WHERE assoc.${escape_identifier(calling_fk)} = :update_id)` +
        ` ORDER BY ${order}`;
      return this.to_options(alt, this.db.query_bind(sql, { update_id }) as Row[]);
    }

    // One to one with a bridge: alt records with no junction row at all.
    const sql =
      `SELECT alt.id AS id${this.ident_select(alt, "alt")} FROM ${alt_table} alt` +
      ` LEFT JOIN ${junction} assoc ON assoc.${escape_identifier(alt_fk)} = alt.id` +
      ` WHERE assoc.${escape_identifier(alt_fk)} IS NULL` +
      ` ORDER BY ${order}`;
    return this.to_options(alt, this.db.query_bind(sql, []) as Row[]);
  }

  /**
   * Create an association from the show-page panel's add form
   * (PHP: submit_association()).
   */
  submit_association(
    settings: RelationSettings,
    calling_module: string,
    update_id: number,
    value: number
  ): boolean {
    const module_a = String(settings[0]?.module_name ?? "");
    const module_b = String(settings[1]?.module_name ?? "");
    const relationship_type = String(settings[2]?.relationship_type ?? "");

    if (calling_module !== module_a && calling_module !== module_b) return false;
    if (update_id === 0 || value === 0) return false;

    const alt = this.est_associated_module(settings, calling_module);
    if (alt === null) return false;

    if (relationship_type === "one to many") {
      const fk_a = this.fk_column(settings[0]);
      if (calling_module === module_a) {
        // Parent view: point the chosen child at this parent — but only while
        // the child is unclaimed (or already ours).
        const child = this.db.query_bind(
          `SELECT ${escape_identifier(fk_a)} AS owner_id FROM ${escape_identifier(module_b)} WHERE id = :value`,
          { value }
        ) as Row[];
        const owner_id = Number(child[0]?.owner_id ?? -1);
        if (owner_id === update_id) return true;
        if (owner_id !== 0) return false;
        this.db.query_bind(
          `UPDATE ${escape_identifier(module_b)} SET ${escape_identifier(fk_a)} = :update_id WHERE id = :value`,
          { update_id, value }
        );
        return true;
      }
      // Child view: point this child at the chosen parent.
      this.db.query_bind(
        `UPDATE ${escape_identifier(module_b)} SET ${escape_identifier(fk_a)} = :value WHERE id = :update_id`,
        { update_id, value }
      );
      return true;
    }

    if (this.is_direct_one_to_one(settings)) {
      this.submit_direct_one_to_one(settings, calling_module, update_id, value);
      return true;
    }

    // Junction-backed (one to one with a bridge, or many to many).
    const junction = junction_table(settings);
    const calling_fk = this.junction_fk(settings, calling_module);
    const alt_fk = this.fk_column(alt);
    const alt_table = table_of(alt);

    // Defensive existence checks: both records must exist before a junction
    // row may reference them.
    const calling_row = this.db.query_bind(
      `SELECT id FROM ${escape_identifier(calling_module)} WHERE id = :update_id`,
      { update_id }
    ) as Row[];
    const alt_row = this.db.query_bind(
      `SELECT id FROM ${escape_identifier(alt_table)} WHERE id = :value`,
      { value }
    ) as Row[];
    if (calling_row.length === 0 || alt_row.length === 0) return false;

    if (relationship_type === "many to many") {
      const existing = this.db.query_bind(
        `SELECT id FROM ${escape_identifier(junction)}` +
          ` WHERE ${escape_identifier(calling_fk)} = :update_id AND ${escape_identifier(alt_fk)} = :value`,
        { update_id, value }
      ) as Row[];
      if (existing.length > 0) return true; // Idempotent — already linked.
    } else {
      // Bridged one to one: clear any existing row on either side first.
      this.db.query_bind(
        `DELETE FROM ${escape_identifier(junction)} WHERE ${escape_identifier(calling_fk)} = :update_id`,
        { update_id }
      );
      this.db.query_bind(
        `DELETE FROM ${escape_identifier(junction)} WHERE ${escape_identifier(alt_fk)} = :value`,
        { value }
      );
    }

    this.db.insert({ [calling_fk]: update_id, [alt_fk]: value }, junction);
    return true;
  }

  /**
   * Remove an association from the show-page panel
   * (PHP: disassociate_association()). $value is the junction row id for
   * junction-backed relations, otherwise the associated record's id.
   */
  disassociate_association(
    settings: RelationSettings,
    calling_module: string,
    update_id: number,
    value: number
  ): boolean {
    const module_a = String(settings[0]?.module_name ?? "");
    const module_b = String(settings[1]?.module_name ?? "");
    const relationship_type = String(settings[2]?.relationship_type ?? "");

    if (calling_module !== module_a && calling_module !== module_b) return false;
    if (update_id === 0 || value === 0) return false;

    const alt = this.est_associated_module(settings, calling_module);
    if (alt === null) return false;

    if (relationship_type === "one to many") {
      const fk_a = this.fk_column(settings[0]);
      this.db.query_bind(
        `UPDATE ${escape_identifier(module_b)} SET ${escape_identifier(fk_a)} = 0 WHERE id = :value`,
        { value }
      );
      return true;
    }

    if (this.is_direct_one_to_one(settings)) {
      const calling_entry = this.get_settings_for_module(settings, calling_module);
      const alt_fk = this.fk_column(alt); // on the calling table
      const back_fk = this.fk_column(calling_entry); // on the alt table
      this.db.query_bind(
        `UPDATE ${escape_identifier(calling_module)} SET ${escape_identifier(alt_fk)} = 0 WHERE id = :update_id`,
        { update_id }
      );
      this.db.query_bind(
        `UPDATE ${escape_identifier(table_of(alt))} SET ${escape_identifier(back_fk)} = 0 WHERE id = :value`,
        { value }
      );
      return true;
    }

    this.db.query_bind(
      `DELETE FROM ${escape_identifier(junction_table(settings))} WHERE id = :value`,
      { value }
    );
    return true;
  }

  // ============================================
  // Private helpers
  // ============================================

  /**
   * fetch_associated_rows() logic for one-to-many relations, covering both
   * the parent's and the child's view of the relationship.
   */
  private fetch_one_to_many_associated(
    settings: RelationSettings,
    calling_module: string,
    update_id: number
  ): AssociatedRow[] {
    const module_a = String(settings[0]?.module_name ?? "");
    const module_b = String(settings[1]?.module_name ?? "");
    const parent_entry = settings[0] ?? {};
    const child_entry = settings[1] ?? {};
    const fk_a = this.fk_column(parent_entry);

    if (calling_module === module_a) {
      // Parent view: every child currently linked to this parent.
      const sql =
        `SELECT child.id AS id, child.id AS foreign_key${this.ident_select(child_entry, "child")}` +
        ` FROM ${escape_identifier(module_b)} child` +
        ` WHERE child.${escape_identifier(fk_a)} = :update_id` +
        ` ORDER BY ${this.identifier_order(child_entry, "child")}`;
      return this.to_associated_rows(
        child_entry,
        this.db.query_bind(sql, { update_id }) as Row[]
      );
    }

    // Child view: the single parent this child belongs to, if any.
    const sql =
      `SELECT child.id AS id, parent.id AS foreign_key${this.ident_select(parent_entry, "parent")}` +
      ` FROM ${escape_identifier(module_a)} parent` +
      ` INNER JOIN ${escape_identifier(module_b)} child ON child.${escape_identifier(fk_a)} = parent.id` +
      ` WHERE child.id = :update_id`;
    return this.to_associated_rows(
      parent_entry,
      this.db.query_bind(sql, { update_id }) as Row[]
    );
  }

  /**
   * The full bidirectional claim/release for a direct one-to-one association
   * (PHP: submit_direct_one_to_one()).
   */
  private submit_direct_one_to_one(
    settings: RelationSettings,
    calling_module: string,
    update_id: number,
    value: number
  ): void {
    const calling_entry = this.get_settings_for_module(settings, calling_module);
    const alt = this.est_associated_module(settings, calling_module);
    if (alt === null) return;

    const alt_table = table_of(alt);
    const alt_fk = this.fk_column(alt); // column on the calling table
    const back_fk = this.fk_column(calling_entry); // column on the alt table

    // Release the calling record's previous partner (both sides), if any.
    const prev = this.db.query_bind(
      `SELECT ${escape_identifier(alt_fk)} AS alt_id FROM ${escape_identifier(calling_module)} WHERE id = :update_id`,
      { update_id }
    ) as Row[];
    const prev_alt_id = Number(prev[0]?.alt_id ?? 0);
    if (prev_alt_id > 0) {
      this.db.query_bind(
        `UPDATE ${escape_identifier(alt_table)} SET ${escape_identifier(back_fk)} = 0 WHERE id = :prev_alt_id`,
        { prev_alt_id }
      );
    }
    this.db.query_bind(
      `UPDATE ${escape_identifier(calling_module)} SET ${escape_identifier(alt_fk)} = 0 WHERE id = :update_id`,
      { update_id }
    );

    // Release the chosen alt record from any previous owner (both sides).
    const owner = this.db.query_bind(
      `SELECT ${escape_identifier(back_fk)} AS owner_id FROM ${escape_identifier(alt_table)} WHERE id = :value`,
      { value }
    ) as Row[];
    const prev_owner_id = Number(owner[0]?.owner_id ?? 0);
    if (prev_owner_id > 0) {
      this.db.query_bind(
        `UPDATE ${escape_identifier(calling_module)} SET ${escape_identifier(alt_fk)} = 0 WHERE id = :prev_owner_id`,
        { prev_owner_id }
      );
    }

    // Link both sides.
    this.db.query_bind(
      `UPDATE ${escape_identifier(calling_module)} SET ${escape_identifier(alt_fk)} = :value WHERE id = :update_id`,
      { update_id, value }
    );
    this.db.query_bind(
      `UPDATE ${escape_identifier(alt_table)} SET ${escape_identifier(back_fk)} = :update_id WHERE id = :value`,
      { update_id, value }
    );
  }

  /** FK column name for a settings entry ("section type" → section_type_id). */
  private fk_column(entry: RelationEntry | undefined): string {
    return String(entry?.record_name_singular ?? "").replace(/ /g, "_") + "_id";
  }

  /** The junction table's FK column for the calling module. */
  private junction_fk(settings: RelationSettings, calling_module: string): string {
    return this.fk_column(this.get_settings_for_module(settings, calling_module));
  }

  /**
   * identifier_column parts that are both well-formed and real columns on the
   * module's table, in their original order.
   */
  private identifier_columns(entry: RelationEntry): string[] {
    const raw = String(entry.identifier_column ?? "");
    const parts = raw
      .split(",")
      .map((part) => part.trim())
      .filter((part) => SAFE_IDENTIFIER.test(part));

    if (parts.length === 0) return [];

    const real = this.get_table_columns(String(entry.module_name ?? ""));
    return parts.filter((part) => real.includes(part));
  }

  /**
   * Extra SELECT-list fragment with one aliased column per valid identifier
   * column (ident_0, ident_1, …), so the display value can be joined in
   * JavaScript — the SQLite stand-in for CONCAT_WS. Includes the leading
   * comma; empty string when the entry has no valid identifier columns.
   */
  private ident_select(entry: RelationEntry, alias: string): string {
    return this.identifier_columns(entry)
      .map((col, index) => `, ${column(alias, col)} AS ident_${index}`)
      .join("");
  }

  /** ORDER BY expression: the last valid identifier column, else the id. */
  private identifier_order(entry: RelationEntry, alias: string): string {
    const columns = this.identifier_columns(entry);
    if (columns.length === 0) return `${alias}.id`;
    return column(alias, columns[columns.length - 1]);
  }

  /** Human-readable display value, joined from the ident_* columns. */
  private row_value(entry: RelationEntry, row: Row): string {
    const columns = this.identifier_columns(entry);
    if (columns.length === 0) return String(row.id ?? "");

    return columns
      .map((_, index) => {
        const value = row[`ident_${index}`];
        return value === null || value === undefined ? "" : String(value);
      })
      .join(" ")
      .trim();
  }

  /** Run an options SELECT and map rows to {key, value} pairs. */
  private select_options(
    entry: RelationEntry,
    where: string[],
    params: Record<string, unknown> = {}
  ): AvailableOption[] {
    const alt_table = escape_identifier(table_of(entry));
    let sql = `SELECT alt.id AS id${this.ident_select(entry, "alt")} FROM ${alt_table} alt`;
    if (where.length > 0) sql += ` WHERE ${where.join(" AND ")}`;
    sql += ` ORDER BY ${this.identifier_order(entry, "alt")}`;
    return this.to_options(entry, this.db.query_bind(sql, params) as Row[]);
  }

  private to_options(entry: RelationEntry, rows: Row[]): AvailableOption[] {
    return rows.map((row) => ({
      key: Number(row.id ?? 0),
      value: this.row_value(entry, row),
    }));
  }

  private to_associated_rows(entry: RelationEntry, rows: Row[]): AssociatedRow[] {
    return rows.map((row) => ({
      id: Number(row.id ?? 0),
      foreign_key: Number(row.foreign_key ?? row.id ?? 0),
      value: this.row_value(entry, row),
    }));
  }
}

/** Table name of a settings entry ("module_name"). */
function table_of(entry: RelationEntry | undefined): string {
  return String(entry?.module_name ?? "");
}

/** Junction table name — associated_{a}_and_{b}. */
function junction_table(settings: RelationSettings): string {
  return `associated_${String(settings[0]?.module_name ?? "")}_and_${String(
    settings[1]?.module_name ?? ""
  )}`;
}

/** Backtick-quoted column reference, e.g. alt.`author_id`. */
function column(alias: string, name: string): string {
  return `${alias}.${escape_identifier(name)}`;
}

/** [id => value] pairs for the form_dropdown() contract. */
function options_to_dropdown(options: AvailableOption[]): OptionsDropdown {
  const dropdown: OptionsDropdown = {};
  for (const option of options) {
    dropdown[option.key] = option.value;
  }
  return dropdown;
}
