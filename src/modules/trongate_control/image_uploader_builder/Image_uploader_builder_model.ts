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
  ensureDirectory,
  moduleAssetsDir,
} from "@/modules/file/upload-paths";
import {
  UPLOADER_DEFAULTS,
  type UploaderModuleChoice,
  type UploaderSettings,
  type UploaderWizard,
} from "./types";

/**
 * Image_uploader_builder_model - data layer for the uploader wizard.
 *
 * Port of modules/trongate_control/image_uploader_builder/Image_uploader_
 * builder_model.php adapted to the port's SQLite database, generated-module
 * layout and public module-assets folders.
 *
 * SQLite adaptations:
 *   - information_schema is replaced by PRAGMA table_info;
 *   - a compatible column accepts VARCHAR(255) or TEXT, NOT NULL DEFAULT '';
 *   - the ALTER TABLE statement adds VARCHAR(255) NOT NULL DEFAULT ''.
 *
 * Settings are written to data/settings/image_uploader/{module}.json - the
 * runtime's first lookup location. The destination root is created beneath
 * public/{module}_module/{destination}.
 */

const IDENTIFIER = /^[a-z0-9_]+$/;

/** Framework/system module folders never offered as uploader targets. */
const SYSTEM_MODULES = [
  "db",
  "file",
  "image",
  "image_uploader",
  "language",
  "login",
  "module_relations",
  "pagination",
  "setup",
  "trongate_administrators",
  "trongate_control",
  "trongate_email",
  "trongate_security",
  "utilities",
  "welcome",
];

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

export class Image_uploader_builder_model extends Model {
  /** Port-only settings directory (the runtime searches this first). */
  private readonly settings_dir = path.join(
    DATA_DIR,
    "settings",
    "image_uploader"
  );

  // ============================================
  // Module folders (generated modules first)
  // ============================================

  /**
   * Resolve a module's source folder: src/modules/generated/<module> first
   * (Flo output), then src/modules/<module> for a hand-written app module.
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

  public relative_path(absolute: string): string {
    return path.relative(PROJECT_ROOT, absolute).replace(/\\/g, "/");
  }

  // ============================================
  // Module chooser (CRUD preflight)
  // ============================================

  /**
   * List candidate modules with their CRUD preflight status.
   *
   * A module is ready when the controller, model, show view and a
   * submit_delete flow all exist. Top-level app modules and generated
   * modules are both scanned; framework folders are never offered.
   */
  public get_crud_modules(): UploaderModuleChoice[] {
    const modules = new Map<string, string>();

    for (const [module, dir] of this.top_level_folders()) {
      modules.set(module, dir);
    }

    // Generated modules override a same-named top-level folder.
    for (const [module, dir] of this.generated_folders()) {
      modules.set(module, dir);
    }

    const rows: UploaderModuleChoice[] = [];

    for (const [module, dir] of modules) {
      const reasons = this.crud_shortfalls(module, dir);
      rows.push({
        module,
        label: ucwords(module.replace(/_/g, " ")),
        ready: reasons.length === 0,
        reasons,
      });
    }

    // Ready modules first, then blocked ones - alphabetical within each.
    rows.sort((a, b) => {
      if (a.ready !== b.ready) return a.ready ? -1 : 1;
      return a.module.localeCompare(b.module);
    });

    return rows;
  }

  private top_level_folders(): Array<[string, string]> {
    return this.scan_folders(MODULES_DIR, (name) => {
      if (name === "generated") return false;
      if (name.startsWith("trongate_")) return false;
      if (SYSTEM_MODULES.includes(name)) return false;
      return true;
    });
  }

  private generated_folders(): Array<[string, string]> {
    return this.scan_folders(GENERATED_MODULES_DIR, () => true);
  }

  private scan_folders(
    root: string,
    accept: (name: string) => boolean
  ): Array<[string, string]> {
    const rows: Array<[string, string]> = [];

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      return rows;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      if (!IDENTIFIER.test(name) || !accept(name)) continue;
      rows.push([name, path.join(root, name)]);
    }

    return rows;
  }

  /** Resolve a posted selection to a ready module name. */
  public get_eligible_module(selected: string): string | null {
    const value = selected.toLowerCase().trim();
    if (!IDENTIFIER.test(value)) return null;

    const row = this.get_crud_modules().find(
      (candidate) => candidate.module === value
    );

    return row && row.ready ? row.module : null;
  }

  private crud_shortfalls(module: string, dir: string): string[] {
    const reasons: string[] = [];
    const class_name = ucfirst(module);

    if (!fs.existsSync(path.join(/*turbopackIgnore: true*/ dir, `${class_name}.ts`))) {
      reasons.push(`no controller file (${class_name}.ts)`);
    }

    if (!fs.existsSync(path.join(/*turbopackIgnore: true*/ dir, `${class_name}_model.ts`))) {
      reasons.push(`no model file (${class_name}_model.ts)`);
    }

    if (!fs.existsSync(path.join(/*turbopackIgnore: true*/ dir, "views", "show.tsx"))) {
      reasons.push("no show view (views/show.tsx)");
    }

    if (this.has_delete_flow(path.join(/*turbopackIgnore: true*/ dir, `${class_name}.ts`)) === false) {
      reasons.push("no delete flow (submit_delete method)");
    }

    return reasons;
  }

  private has_delete_flow(controller_path: string): boolean {
    try {
      if (!fs.statSync(controller_path).isFile()) return false;
      return fs.readFileSync(controller_path, "utf8").includes("submit_delete");
    } catch {
      return false;
    }
  }

  // ============================================
  // Marker (settings file = 'already has an uploader')
  // ============================================

  public uploader_exists(module: string): boolean {
    if (!IDENTIFIER.test(module)) return false;
    return fs.existsSync(this.settings_path(module));
  }

  public delete_settings_file(module: string): void {
    if (!IDENTIFIER.test(module)) return;

    try {
      const file_path = this.settings_path(module);
      if (fs.existsSync(file_path)) fs.unlinkSync(file_path);
    } catch {
      /* best effort, like PHP's @unlink */
    }
  }

  // ============================================
  // Preflight guards (fail loudly, write nothing)
  // ============================================

  public guard_uploader_ready(wizard: UploaderWizard): void {
    const module_name = String(wizard.module ?? "");
    const table = String(wizard.table ?? "");
    const column = String(wizard.column ?? "");
    const destination = String(wizard.destination ?? "");

    for (const [key, value] of Object.entries({
      module: module_name,
      table,
      column,
      destination,
    })) {
      if (!IDENTIFIER.test(value)) {
        throw new Error(
          `The ${key} name '${value}' may contain lowercase letters, numbers, and underscores only.`
        );
      }
    }

    if (this.get_module_dir(module_name) === null) {
      throw new Error(
        `The '${module_name}' module folder no longer exists. Start again from the Module Manager.`
      );
    }

    if (!this.table_exists(table)) {
      throw new Error(
        `The table '${table}' does not exist in the database. Check the table name (it defaults to the module name but can differ).`
      );
    }

    this.ensure_settings_dir_writable();
    this.ensure_destination_writable(module_name, destination);
  }

  private ensure_settings_dir_writable(): void {
    try {
      fs.mkdirSync(this.settings_dir, { recursive: true });
      fs.accessSync(this.settings_dir, fs.constants.W_OK);
    } catch {
      throw new Error(
        `The image_uploader settings directory is not writable: ${this.settings_dir}`
      );
    }
  }

  /**
   * Ensure the target module's public destination root can be created and
   * written. The runtime creates per-record subfolders beneath it.
   */
  private ensure_destination_writable(
    module: string,
    destination: string
  ): void {
    let root: string;

    try {
      root = moduleAssetsDir(module);
    } catch {
      throw new Error(`The '${module}' module has an invalid name.`);
    }

    const dir = path.join(root, destination);

    try {
      ensureDirectory(dir);
      fs.accessSync(dir, fs.constants.W_OK);
    } catch {
      throw new Error(
        `The destination folder could not be created or is not writable: ${dir}`
      );
    }
  }

  // ============================================
  // Idempotent ALTER TABLE
  // ============================================

  /**
   * Apply the schema change idempotently:
   *   - column absent            -> ADD COLUMN;
   *   - present + compatible     -> skip, clear message;
   *   - present + incompatible   -> fail loudly, never silently alter.
   */
  public apply_column(wizard: UploaderWizard): string {
    const table = String(wizard.table ?? "");
    const column = String(wizard.column ?? "");
    const state = this.get_column_state(table, column);

    if (state === "compatible") {
      return `Column \`${column}\` already exists on \`${table}\` with a compatible definition (VARCHAR(255) or TEXT NOT NULL DEFAULT '') - no schema change was needed.`;
    }

    if (state === "incompatible") {
      const found = this.describe_column(table, column);
      throw new Error(
        `Column '${column}' already exists on the ${table} table with an incompatible definition: ${found}. Expected VARCHAR(255) NOT NULL DEFAULT '' (empty string = no picture). Nothing was changed - drop or rename the existing column, or choose a different column name in the wizard.`
      );
    }

    this.db.query(this.build_alter_sql(wizard));

    return `Column \`${column}\` was added to \`${table}\` (VARCHAR(255) NOT NULL DEFAULT '').`;
  }

  public build_alter_sql(wizard: UploaderWizard): string {
    const table = String(wizard.table ?? "");
    const column = String(wizard.column ?? "");
    return `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` VARCHAR(255) NOT NULL DEFAULT '';`;
  }

  private get_column_state(
    table: string,
    column: string
  ): "absent" | "compatible" | "incompatible" {
    const row = this.column_row(table, column);
    if (row === null) return "absent";

    const type = String(row.type ?? "").toUpperCase().replace(/\s+/g, "");
    const type_ok = type === "VARCHAR(255)" || type === "TEXT";
    const nullable_ok = row.null === false;
    const default_ok = this.default_value(row.default) === "''";

    return type_ok && nullable_ok && default_ok
      ? "compatible"
      : "incompatible";
  }

  private describe_column(table: string, column: string): string {
    const row = this.column_row(table, column);
    if (row === null) return "column not found";

    const type = String(row.type ?? "").toUpperCase() || "UNKNOWN";
    const nullable = row.null === false ? "NOT NULL" : "NULL";
    const default_value =
      row.default === null || row.default === undefined
        ? "DEFAULT NULL"
        : `DEFAULT ${this.default_value(row.default)}`;

    return `${type} ${nullable} ${default_value}`;
  }

  /** SQLite reports the default as SQL text (DEFAULT '' -> "''"). */
  private default_value(value: unknown): string {
    return String(value ?? "").trim();
  }

  private column_row(
    table: string,
    column: string
  ): Record<string, unknown> | null {
    if (!IDENTIFIER.test(table) || !IDENTIFIER.test(column)) return null;
    if (!this.table_exists(table)) return null;

    const rows = this.db.describe_table(table, false);
    if (!Array.isArray(rows)) return null;

    const found = rows.find((row) => String(row.name ?? "") === column);
    return found ? (found as Record<string, unknown>) : null;
  }

  public table_exists(table: string): boolean {
    if (!IDENTIFIER.test(table)) return false;
    return this.db.table_exists(table);
  }

  // ============================================
  // Settings JSON (the runtime contract)
  // ============================================

  public write_settings_file(wizard: UploaderWizard): string {
    const module_name = String(wizard.module ?? "");

    const settings: UploaderSettings = {
      module: module_name,
      column: String(wizard.column ?? UPLOADER_DEFAULTS.column),
      destination: String(
        wizard.destination ?? UPLOADER_DEFAULTS.destination
      ),
      max_size: this.int_value(wizard.max_size, UPLOADER_DEFAULTS.max_size),
      max_width: this.int_value(wizard.max_width, UPLOADER_DEFAULTS.max_width),
      max_height: this.int_value(
        wizard.max_height,
        UPLOADER_DEFAULTS.max_height
      ),
      resize_max_width: this.int_value(
        wizard.resize_max_width,
        UPLOADER_DEFAULTS.resize_max_width
      ),
      resize_max_height: this.int_value(
        wizard.resize_max_height,
        UPLOADER_DEFAULTS.resize_max_height
      ),
      thumbnails: Boolean(wizard.thumbnails ?? UPLOADER_DEFAULTS.thumbnails),
      thumbnail_max_width: this.int_value(
        wizard.thumbnail_max_width,
        UPLOADER_DEFAULTS.thumbnail_max_width
      ),
      thumbnail_max_height: this.int_value(
        wizard.thumbnail_max_height,
        UPLOADER_DEFAULTS.thumbnail_max_height
      ),
    };

    this.ensure_settings_dir_writable();

    const file_path = this.settings_path(module_name);
    fs.writeFileSync(
      file_path,
      JSON.stringify(settings, null, 2) + "\n",
      "utf8"
    );

    return file_path;
  }

  private int_value(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
  }

  public settings_path(module: string): string {
    return path.join(this.settings_dir, `${module}.json`);
  }
}

export default Image_uploader_builder_model;
