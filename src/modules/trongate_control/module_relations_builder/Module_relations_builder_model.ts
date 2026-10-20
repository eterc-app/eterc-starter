import * as fs from "node:fs";
import * as path from "node:path";
import { Model } from "@/engine/model";
import {
  DATA_DIR,
  GENERATED_MODULES_DIR,
  MODULES_DIR,
  PROJECT_ROOT,
} from "@/engine/paths";
import {
  RELATION_TYPES,
  type RelationType,
  type RelationsWizard,
} from "./types";

/**
 * Module_relations_builder_model - data layer for the relation wizard.
 *
 * Port of modules/trongate_control/module_relations_builder/Module_relations_
 * builder_model.php adapted to the port's SQLite database and generated-module
 * layout.
 *
 * SQLite adaptations:
 *   - information_schema is replaced by sqlite_master + PRAGMA table_info;
 *   - ALTER TABLE ADD COLUMN and CREATE INDEX are separate statements;
 *   - junction ids use INTEGER PRIMARY KEY AUTOINCREMENT.
 *
 * Settings are written to data/settings/module_relations/{parent}_and_{child}
 * .json - the runtime's first lookup location.
 */

const SYSTEM_TABLES = [
  "login_attempts",
  "password_resets",
  "tg_sessions",
  "welcome",
];

const IDENTIFIER = /^[a-z0-9_]+$/;
const TEXTUAL_TYPE =
  /^(varchar|char|nchar|nvarchar|text|tinytext|mediumtext|longtext|clob)\b/i;

export function ucfirst(value: string): string {
  return value === "" ? value : value.charAt(0).toUpperCase() + value.slice(1);
}

export function ucwords(value: string): string {
  return value
    .split(" ")
    .map((word) =>
      word === "" ? word : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(" ");
}

function truncateIdentifier(value: string): string {
  return value.length > 64 ? value.slice(0, 64) : value;
}

export class Module_relations_builder_model extends Model {
  /** Runtime route prefix used by every injected code block. */
  private readonly runtime_route = "module_relations";

  /** Port-only settings directory (the runtime searches this first). */
  private readonly settings_dir = path.join(
    DATA_DIR,
    "settings",
    "module_relations"
  );

  public get_runtime_route(): string {
    return this.runtime_route;
  }

  // ============================================
  // Injection vocabulary
  // ============================================

  public fk_name(singular: string): string {
    return `${singular}_id`;
  }

  public options_var(singular: string): string {
    return `${singular}_options`;
  }

  public label(singular: string): string {
    return ucwords(singular.replace(/_/g, " "));
  }

  /** Settings/display form of a record name (underscores -> spaces). */
  public display_name(record_name: string): string {
    return record_name.replace(/_/g, " ");
  }

  /** Column-safe form of a record name (spaces -> underscores). */
  public column_name(record_name: string): string {
    return record_name.replace(/ /g, "_");
  }

  public marker(fk: string): string {
    return `flo_relation: ${fk} `;
  }

  // ============================================
  // Module folders (generated modules first)
  // ============================================

  /**
   * Resolve a module's source folder: src/modules/generated/<module> first
   * (Flo output), then src/modules/<module> for a hand-written app module.
   * Returns null when neither contains the expected controller file.
   */
  public get_module_dir(module: string): string | null {
    if (!IDENTIFIER.test(module)) return null;

    const class_name = ucfirst(module);
    const candidates = [
      path.join(GENERATED_MODULES_DIR, module),
      path.join(MODULES_DIR, module),
    ];

    for (const dir of candidates) {
      if (fs.existsSync(path.join(/*turbopackIgnore: true*/ dir, `${class_name}.ts`))) {
        return dir;
      }
    }

    return null;
  }

  /** Relative path for diagnostics and plan items. */
  public relative_path(absolute: string): string {
    return path.relative(PROJECT_ROOT, absolute).replace(/\\/g, "/");
  }

  // ============================================
  // Eligibility
  // ============================================

  /** List every module/table eligible for a relation, sorted. */
  public get_relation_tables(): string[] {
    return this.db
      .get_tables()
      .filter((name) => this.is_eligible(name))
      .sort();
  }

  public is_relation_table(table: string): boolean {
    return this.get_relation_tables().includes(table);
  }

  private is_eligible(name: string): boolean {
    if (!IDENTIFIER.test(name)) return false;
    if (name.startsWith("trongate_")) return false;
    if (SYSTEM_TABLES.includes(name)) return false;
    if (name === "module_relations") return false;
    if (name.startsWith("associated_")) return false;

    // A module folder with the matching controller must exist.
    if (this.get_module_dir(name) === null) return false;

    // The table must have `id` as its primary key.
    const columns = this.describe(name);
    return columns.some(
      (column) => column.name === "id" && column.key === "PRI"
    );
  }

  /** PRAGMA table_info rows in a stable shape. */
  private describe(table: string): Array<{
    name: string;
    type: string;
    notnull: boolean;
    key: string;
    default: unknown;
  }> {
    if (!IDENTIFIER.test(table) || !this.db.table_exists(table)) return [];

    const rows = this.db.describe_table(table, false);
    if (!Array.isArray(rows)) return [];

    return rows.map((row) => ({
      name: String(row.name ?? ""),
      type: String(row.type ?? ""),
      notnull: row.null === false,
      key: String(row.key ?? ""),
      default: row.default,
    }));
  }

  /**
   * Derive a sensible default identifier column: the first textual column,
   * falling back to the first non-id column.
   */
  public get_default_identifier_column(table: string): string {
    const columns = this.describe(table);
    let fallback = "";

    for (const column of columns) {
      if (column.name === "id" || column.name === "") continue;
      if (fallback === "") fallback = column.name;
      if (TEXTUAL_TYPE.test(column.type)) return column.name;
    }

    return fallback;
  }

  /** Validate a comma-separated identifier against a table's real columns. */
  public identifier_columns_valid(identifier: string, table: string): boolean {
    const value = identifier.trim();
    if (value === "") return false;

    const columns = this.get_table_columns(table);
    if (columns.length === 0) return false;

    for (const part of value.split(",")) {
      const column = part.trim();
      if (column === "" || !columns.includes(column)) return false;
    }

    return true;
  }

  public get_table_columns(table: string): string[] {
    return this.describe(table)
      .map((column) => column.name)
      .filter((name) => name !== "");
  }

  public column_exists(table: string, column: string): boolean {
    return this.get_table_columns(table).includes(column);
  }

  public table_exists(table: string): boolean {
    if (!IDENTIFIER.test(table)) return false;
    return this.db.table_exists(table);
  }

  /** Whether a settings file already describes this unordered pair. */
  public relation_exists(module_a: string, module_b: string): boolean {
    for (const candidate of [
      `${module_a}_and_${module_b}.json`,
      `${module_b}_and_${module_a}.json`,
    ]) {
      if (fs.existsSync(path.join(/*turbopackIgnore: true*/ this.settings_dir, candidate))) return true;
    }
    return false;
  }

  /**
   * Complete eligibility preflight. Every check happens before any mutation;
   * the first failure throws with an actionable message.
   */
  public guard_relation_ready(wizard: RelationsWizard): void {
    const type = String(wizard.relation_type ?? "");
    const parent = String(wizard.parent_module ?? "");
    const child = String(wizard.child_module ?? "");

    if (!RELATION_TYPES.includes(type as RelationType)) {
      throw new Error("Please choose a valid relation type.");
    }
    if (parent === "" || child === "") {
      throw new Error(
        "Both modules must be selected before generating a relation."
      );
    }
    if (parent === child) {
      throw new Error("The two modules must be different.");
    }
    if (!this.is_relation_table(parent)) {
      throw new Error(
        `Module '${parent}' is not eligible for a module relation (no table, no id primary key, no controller, or it is a framework module).`
      );
    }
    if (!this.is_relation_table(child)) {
      throw new Error(
        `Module '${child}' is not eligible for a module relation (no table, no id primary key, no controller, or it is a framework module).`
      );
    }
    if (this.relation_exists(parent, child)) {
      throw new Error(
        `A relation already exists between '${parent}' and '${child}'.`
      );
    }

    const identifier_a = String(wizard.identifier_column_a ?? "").trim();
    const identifier_b = String(wizard.identifier_column_b ?? "").trim();

    if (!this.identifier_columns_valid(identifier_a, parent)) {
      throw new Error(
        `Identifier column '${identifier_a}' does not exist on the ${parent} table.`
      );
    }
    if (!this.identifier_columns_valid(identifier_b, child)) {
      throw new Error(
        `Identifier column '${identifier_b}' does not exist on the ${child} table.`
      );
    }

    const singular_a = this.column_name(
      String(wizard.singular_a ?? this.fallback_singular(parent))
    );
    const singular_b = this.column_name(
      String(wizard.singular_b ?? this.fallback_singular(child))
    );
    const bridging = Boolean(wizard.bridging_table ?? false);

    if (!IDENTIFIER.test(singular_a) || !IDENTIFIER.test(singular_b)) {
      throw new Error(
        "Singular module names may contain lowercase letters, numbers, and underscores only."
      );
    }

    if (type === "one to many") {
      this.guard_fk_free(child, `${singular_a}_id`);
      return;
    }

    if (type === "one to one" && !bridging) {
      this.guard_fk_free(parent, `${singular_b}_id`);
      this.guard_fk_free(child, `${singular_a}_id`);
      return;
    }

    const junction = `associated_${parent}_and_${child}`;
    if (junction.length > 64) {
      throw new Error(
        `The junction table name '${junction}' exceeds the 64-character identifier limit. Shorten the module names.`
      );
    }
    if (this.table_exists(junction)) {
      throw new Error(`A table named '${junction}' already exists.`);
    }
  }

  private guard_fk_free(table: string, fk: string): void {
    if (!IDENTIFIER.test(fk)) {
      throw new Error(`Foreign key column '${fk}' is not a valid column name.`);
    }
    if (this.column_exists(table, fk)) {
      throw new Error(`Column '${fk}' already exists on the ${table} table.`);
    }
  }

  // ============================================
  // Settings JSON (the runtime contract)
  // ============================================

  public write_settings_file(wizard: RelationsWizard): string {
    const parent = String(wizard.parent_module ?? "");
    const child = String(wizard.child_module ?? "");
    const type = String(wizard.relation_type ?? "");
    const bridging = Boolean(wizard.bridging_table ?? false);

    const settings = [
      {
        module_name: parent,
        record_name_singular: this.display_name(
          String(wizard.singular_a ?? this.fallback_singular(parent))
        ),
        record_name_plural: this.display_name(
          String(wizard.plural_a ?? parent)
        ),
        identifier_column: String(wizard.identifier_column_a ?? "").trim(),
      },
      {
        module_name: child,
        record_name_singular: this.display_name(
          String(wizard.singular_b ?? this.fallback_singular(child))
        ),
        record_name_plural: this.display_name(
          String(wizard.plural_b ?? child)
        ),
        identifier_column: String(wizard.identifier_column_b ?? "").trim(),
      },
      {
        relationship_type: type,
        bridging_table: bridging,
      },
    ];

    fs.mkdirSync(this.settings_dir, { recursive: true });
    this.assert_writable(this.settings_dir);

    const file_path = path.join(
      this.settings_dir,
      `${parent}_and_${child}.json`
    );

    fs.writeFileSync(file_path, JSON.stringify(settings, null, 2), "utf8");
    return file_path;
  }

  public delete_settings_file(wizard: RelationsWizard): void {
    const parent = String(wizard.parent_module ?? "");
    const child = String(wizard.child_module ?? "");
    if (parent === "" || child === "") return;

    const file_path = path.join(
      this.settings_dir,
      `${parent}_and_${child}.json`
    );

    try {
      if (fs.existsSync(file_path)) fs.unlinkSync(file_path);
    } catch {
      /* best effort, like PHP's @unlink */
    }
  }

  private assert_writable(dir: string): void {
    try {
      fs.accessSync(dir, fs.constants.W_OK);
    } catch {
      throw new Error(
        `The module_relations runtime settings directory is not writable: ${dir}`
      );
    }
  }

  // ============================================
  // Schema SQL (SQLite)
  // ============================================

  /**
   * Build the relation schema statements, in execution order.
   *
   * SQLite cannot combine ADD COLUMN and ADD INDEX, so every ALTER is followed
   * by a separate CREATE INDEX. Junction tables use INTEGER PRIMARY KEY
   * AUTOINCREMENT and separate UNIQUE indexes.
   */
  public build_relation_sql(wizard: RelationsWizard): string[] {
    const type = String(wizard.relation_type ?? "");
    const parent = String(wizard.parent_module ?? "");
    const child = String(wizard.child_module ?? "");
    const singular_a = this.column_name(
      String(wizard.singular_a ?? this.fallback_singular(parent))
    );
    const singular_b = this.column_name(
      String(wizard.singular_b ?? this.fallback_singular(child))
    );
    const bridging = Boolean(wizard.bridging_table ?? false);

    if (parent === "" || child === "") {
      throw new Error(
        "Relation could not be built because the parent and child modules were not provided."
      );
    }

    if (type === "one to many") {
      return this.build_alter_add_fk(child, `${singular_a}_id`);
    }

    if (type === "one to one" && !bridging) {
      return [
        ...this.build_alter_add_fk(parent, `${singular_b}_id`),
        ...this.build_alter_add_fk(child, `${singular_a}_id`),
      ];
    }

    return this.build_junction_sql(
      parent,
      child,
      singular_a,
      singular_b,
      type
    );
  }

  private build_alter_add_fk(table: string, fk: string): string[] {
    const index = truncateIdentifier(`idx_${table}_${fk}`);
    return [
      `ALTER TABLE \`${table}\` ADD COLUMN \`${fk}\` INTEGER DEFAULT 0;`,
      `CREATE INDEX IF NOT EXISTS \`${index}\` ON \`${table}\` (\`${fk}\`);`,
    ];
  }

  private build_junction_sql(
    parent: string,
    child: string,
    singular_a: string,
    singular_b: string,
    type: string
  ): string[] {
    const junction = `associated_${parent}_and_${child}`;
    const col_a = `${singular_a}_id`;
    const col_b = `${singular_b}_id`;

    const statements = [
      `CREATE TABLE \`${junction}\` (`,
      `  \`id\` INTEGER PRIMARY KEY AUTOINCREMENT,`,
      `  \`${col_a}\` INTEGER DEFAULT 0,`,
      `  \`${col_b}\` INTEGER DEFAULT 0`,
      `);`,
    ];

    const create_table = statements.join("\n");

    if (type === "many to many") {
      const index = truncateIdentifier(`uq_${junction}_pair`);
      return [
        create_table,
        `CREATE UNIQUE INDEX IF NOT EXISTS \`${index}\` ON \`${junction}\` (\`${col_a}\`, \`${col_b}\`);`,
      ];
    }

    // Bridged one-to-one: one link per record on each side.
    const index_a = truncateIdentifier(`uq_${junction}_${col_a}`);
    const index_b = truncateIdentifier(`uq_${junction}_${col_b}`);

    return [
      create_table,
      `CREATE UNIQUE INDEX IF NOT EXISTS \`${index_a}\` ON \`${junction}\` (\`${col_a}\`);`,
      `CREATE UNIQUE INDEX IF NOT EXISTS \`${index_b}\` ON \`${junction}\` (\`${col_b}\`);`,
    ];
  }

  private fallback_singular(table: string): string {
    if (table.endsWith("ies")) return `${table.slice(0, -3)}y`;
    if (table.endsWith("s")) return table.slice(0, -1);
    return table;
  }
}

export default Module_relations_builder_model;
