import { Eterc } from "@/engine/controller";
import { set_flashdata } from "@/engine/Flashdata";
import { post } from "@/engine/post";
import { session_get, session_set } from "@/engine/session";
import type { EtTemplateData } from "@/engine/Templates";
import { redirect, segment, site_url } from "@/engine/Url";
import type { Eterc_security } from "@/modules/eterc_security/Eterc_security";
import {
  Db_model,
  type ColumnInfo,
  type FormField,
  type Row,
} from "./Db_model";
export default class Db extends Eterc {
  private admin_theme = "";
  private default_limit = 20;
  private per_page_options = [10, 20, 50, 100];

  constructor(moduleName?: string | null) {
    super(moduleName);
    this.model = new Db_model(this.module_name || "db");
  }

  private dbModel(): Db_model {
    return this.model as Db_model;
  }

  // -------------------------------------------------------------------------
  // Table list
  // -------------------------------------------------------------------------

  /** Table list with record counts and the per-table actions. */
  async index() {
    (
      this as unknown as { eterc_security: Eterc_security }
    ).eterc_security.make_sure_allowed();

    const data: EtTemplateData = {
      theme: this.admin_theme,
      pageTitle: "Database Tables",
      headline: "Database Tables",
      subheading:
        "Browse table contents, forge new records and run SQL queries directly against the SQLite database.",
      tables: this.dbModel().get_tables_with_counts(),
      browse_url_root: site_url(`${this.module_name}/browse`),
      forger_url_root: site_url(`${this.module_name}/forger`),
      sql_console_url: site_url(`${this.module_name}/sql_console`),
      viewModule: this.module_name,
      viewFile: "table_list",
    };

    return this.templates.admin(data);
  }

  // -------------------------------------------------------------------------
  // Record browser
  // -------------------------------------------------------------------------

  /** Paginated browser for one table: db/browse/{table}/{page}. */
  async browse() {
    (
      this as unknown as { eterc_security: Eterc_security }
    ).eterc_security.make_sure_allowed();

    const table = this.resolve_table(3);
    if (table === false) {
      return this.not_found("The requested table does not exist.");
    }

    const columns = this.dbModel().describe_columns(table);
    const limit = this.getLimit();
    const total_rows = this.dbModel().count_rows(table);
    const total_pages = limit > 0 ? Math.max(1, Math.ceil(total_rows / limit)) : 1;
    const requested_page = Number(segment(4, "int"));
    const current_page = Math.min(Math.max(1, requested_page), total_pages);
    const offset = (current_page - 1) * limit;
    const order_by = this.dbModel().default_order_by(columns);

    const rows = this.dbModel().get_page_rows(table, order_by, "ASC", limit, offset);
    const primary_key = columns.find((column) => column.is_primary_key)?.name ?? "";

    const data: EtTemplateData = {
      theme: this.admin_theme,
      pageTitle: `Browse ${table}`,
      headline: `Browse Table: ${table}`,
      table: table,
      columns: columns,
      rows: rows,
      primary_key: primary_key,
      total_rows: total_rows,
      pagination_data: {
        total_rows: total_rows,
        limit: limit,
        current_page: current_page,
        total_pages: total_pages,
        page_num_segment: 4,
        pagination_root: `${this.module_name}/browse/${table}`,
        record_name_plural: "records",
        include_showing_statement: true,
      },
      per_page_options: this.per_page_options,
      selected_per_page: this.getSelectedPerPage(),
      tables_url: site_url(this.module_name),
      forger_url: site_url(`${this.module_name}/forger/${table}`),
      sql_console_url: site_url(`${this.module_name}/sql_console`),
      viewModule: this.module_name,
      viewFile: "browse",
    };

    return this.templates.admin(data);
  }

  /** "Records Per Page" selector: db/set_per_page/{index}/{table}. */
  async set_per_page() {
    (
      this as unknown as { eterc_security: Eterc_security }
    ).eterc_security.make_sure_allowed();

    let selected_index = Number(segment(3, "int"));

    const table = this.resolve_table(4);
    if (table === false) {
      return this.not_found("The requested table does not exist.");
    }

    if (selected_index < 0 || selected_index >= this.per_page_options.length) {
      selected_index = 1;
    }

    session_set("db_selected_per_page", selected_index);
    redirect(`${this.module_name}/browse/${table}`);
  }

  // -------------------------------------------------------------------------
  // The forger (record editor)
  // -------------------------------------------------------------------------

  /** Forge a new record or edit an existing one: db/forger/{table}/{id}. */
  async forger() {
    (
      this as unknown as { eterc_security: Eterc_security }
    ).eterc_security.make_sure_allowed();

    const table = this.resolve_table(3);
    if (table === false) {
      return this.not_found("The requested table does not exist.");
    }

    const update_id = Number(segment(4, "int"));
    const columns = this.dbModel().describe_columns(table);

    let record: Row | false = false;
    if (update_id > 0) {
      record = this.dbModel().get_record(table, update_id);
      if (record === false) {
        return this.not_found(
          `Record #${update_id} was not found in table '${table}'.`
        );
      }
    }

    return this.templates.admin(
      this.buildForgerViewData(table, update_id, columns, record)
    );
  }

  /** Handle the forger form submission (insert or update). */
  async submit_forge() {
    (
      this as unknown as { eterc_security: Eterc_security }
    ).eterc_security.make_sure_allowed();

    const table = this.resolve_table(3);
    if (table === false) {
      return this.not_found("The requested table does not exist.");
    }

    const update_id = Number(segment(4, "int"));

    const submit = String(post("submit", true) ?? "");
    if (submit !== "Submit") {
      redirect(`${this.module_name}/browse/${table}`);
    }

    const columns = this.dbModel().describe_columns(table);
    const fields = this.dbModel().build_form_fields(columns);

    for (const field of fields) {
      if (!field.submit) continue;

      const rules: string[] = [];
      if (field.required) rules.push("required");
      if (field.affinity === "integer") rules.push("integer");
      else if (field.affinity === "real" || field.affinity === "numeric") {
        rules.push("numeric");
      }

      if (rules.length > 0) {
        await this.validation.set_rules(
          field.name,
          field.label.toLowerCase(),
          rules.join("|")
        );
      }
    }

    if ((await this.validation.run()) !== true) {
      const record: Row | false =
        update_id > 0 ? this.dbModel().get_record(table, update_id) : this.dbModel().posted_record(columns);

      if (update_id > 0 && record === false) {
        redirect(`${this.module_name}/browse/${table}`);
      }

      return this.view(
        "db/forger",
        this.buildForgerViewData(table, update_id, columns, record) as unknown as Record<string, unknown>
      );
    }

    const data = this.dbModel().collect_posted_data(fields);

    if (update_id > 0) {
      const existing = this.dbModel().get_record(table, update_id);
      if (existing === false) {
        redirect(`${this.module_name}/browse/${table}`);
      }

      this.dbModel().update_record(table, update_id, data);
      set_flashdata(`Record #${update_id} was updated in '${table}'`);
    } else {
      if (Object.keys(data).length > 0) {
        this.dbModel().insert_record(table, data);
      } else {
        this.dbModel().insert_empty_row(table);
      }
      set_flashdata(`A new record was forged in '${table}'`);
    }

    redirect(`${this.module_name}/browse/${table}`);
  }

  /** Confirmation page before deleting a record. */
  async delete_conf() {
    (
      this as unknown as { eterc_security: Eterc_security }
    ).eterc_security.make_sure_allowed();

    const table = this.resolve_table(3);
    if (table === false) {
      return this.not_found("The requested table does not exist.");
    }

    const update_id = Number(segment(4, "int"));
    if (update_id === 0) {
      return this.not_found("No record was specified.");
    }

    const record = this.dbModel().get_record(table, update_id);
    if (record === false) {
      return this.not_found(
        `Record #${update_id} was not found in table '${table}'.`
      );
    }

    // A short, read-only preview of the record being deleted.
    const columns = this.dbModel().describe_columns(table);
    const preview = columns.slice(0, 12).map((column) => ({
      label: column.name,
      value: record[column.name] === null ? "NULL" : input_preview(record[column.name]),
    }));

    const data: EtTemplateData = {
      theme: this.admin_theme,
      pageTitle: `Delete Record: ${table} #${update_id}`,
      headline: "Delete Record",
      table: table,
      update_id: update_id,
      preview: preview,
      cancel_url: site_url(`${this.module_name}/browse/${table}`),
      viewModule: this.module_name,
      viewFile: "delete_conf",
    };

    return this.templates.admin(data);
  }

  /** Delete the record after confirmation. */
  async submit_delete() {
    (
      this as unknown as { eterc_security: Eterc_security }
    ).eterc_security.make_sure_allowed();

    const table = this.resolve_table(3);
    if (table === false) {
      return this.not_found("The requested table does not exist.");
    }

    const submit = String(post("submit", true) ?? "");
    if (submit !== "Yes - Delete Now") {
      redirect(`${this.module_name}/browse/${table}`);
    }

    const update_id = Number(segment(4, "int"));
    if (update_id === 0) {
      redirect(`${this.module_name}/browse/${table}`);
    }

    const record = this.dbModel().get_record(table, update_id);
    if (record === false) {
      redirect(`${this.module_name}/browse/${table}`);
    }

    this.dbModel().delete_record(table, update_id);
    set_flashdata(`Record #${update_id} was deleted from '${table}'`);
    redirect(`${this.module_name}/browse/${table}`);
  }

  // -------------------------------------------------------------------------
  // Table maintenance (XHR)
  // -------------------------------------------------------------------------

  /** POST /api/xhr/db/truncate — empty a table. */
  async truncate() {
    (
      this as unknown as { eterc_security: Eterc_security }
    ).eterc_security.make_sure_allowed();

    if ((await this.validation.run()) !== true) {
      return { ok: false, message: "CSRF token validation failed." };
    }

    const table = this.resolve_table(3);
    if (table === false) {
      return { ok: false, message: "The requested table does not exist." };
    }

    try {
      const truncated = this.dbModel().truncate_table(table);
      return truncated
        ? { ok: true, message: `Table '${table}' was truncated.` }
        : { ok: false, message: `Table '${table}' could not be truncated.` };
    } catch (error) {
      return { ok: false, message: errorMessage(error) };
    }
  }

  /** POST /api/xhr/db/resequence — renumber the id column from 1. */
  async resequence() {
    (
      this as unknown as { eterc_security: Eterc_security }
    ).eterc_security.make_sure_allowed();

    if ((await this.validation.run()) !== true) {
      return { ok: false, message: "CSRF token validation failed." };
    }

    const table = this.resolve_table(3);
    if (table === false) {
      return { ok: false, message: "The requested table does not exist." };
    }

    try {
      this.dbModel().resequence_ids(table);
      return { ok: true, message: `IDs in '${table}' were resequenced.` };
    } catch (error) {
      return { ok: false, message: errorMessage(error) };
    }
  }

  // -------------------------------------------------------------------------
  // SQL console
  // -------------------------------------------------------------------------

  /** The SQL console view. */
  async sql_console() {
    (
      this as unknown as { eterc_security: Eterc_security }
    ).eterc_security.make_sure_allowed();

    const data: EtTemplateData = {
      theme: this.admin_theme,
      pageTitle: "SQL Console",
      headline: "SQL Console",
      tables: this.dbModel().get_tables_with_counts(),
      browse_url_root: site_url(`${this.module_name}/browse`),
      tables_url: site_url(this.module_name),
      sample_sql: "SELECT * FROM sqlite_master WHERE type = 'table' ORDER BY name;",
      viewModule: this.module_name,
      viewFile: "sql_console",
    };

    return this.templates.admin(data);
  }

  /** POST /api/xhr/db/run_sql — execute one SQL statement. */
  async run_sql() {
    (
      this as unknown as { eterc_security: Eterc_security }
    ).eterc_security.make_sure_allowed();

    if ((await this.validation.run()) !== true) {
      return {
        ok: false,
        message: "CSRF token validation failed.",
        columns: [],
        rows: [],
        affected_rows: 0,
        last_insert_id: 0,
      };
    }

    return this.dbModel().run_sql(String(post("sql") ?? ""));
  }

  // -------------------------------------------------------------------------
  // Not found
  // -------------------------------------------------------------------------

  /** Generic not-found page for missing tables/records. */
  async not_found(
    message = "The requested database resource could not be found."
  ) {
    (
      this as unknown as { eterc_security: Eterc_security }
    ).eterc_security.make_sure_allowed();

    const data: EtTemplateData = {
      theme: this.admin_theme,
      pageTitle: "Not Found",
      headline: "Not Found",
      message: message,
      back_url: site_url(this.module_name),
      back_label: "Back to Database Tables",
      viewModule: this.module_name,
      viewFile: "not_found",
    };

    return this.templates.admin(data);
  }

  // -------------------------------------------------------------------------
  // Private helpers (camelCase so they cannot collide with URL segments)
  // -------------------------------------------------------------------------

  /**
   * Resolve a URL segment to an existing table name. Returns false for invalid
   * identifiers or unknown tables (the caller renders not_found()).
   */
  private resolve_table(segment_index: number): string | false {
    const raw = String(segment(segment_index) ?? "");
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(raw)) return false;
    return this.dbModel().table_exists(raw) ? raw : false;
  }
  private buildForgerViewData(
    table: string,
    update_id: number,
    columns: ColumnInfo[],
    record: Row | false
  ): EtTemplateData {
    const fields: FormField[] = this.dbModel().build_form_fields(columns, record);

    return {
      theme: this.admin_theme,
      pageTitle:
        update_id > 0 ? `Update Record: ${table} #${update_id}` : `Forge New Record: ${table}`,
      headline:
        update_id > 0 ? `Update Record: ${table} #${update_id}` : `Forge New Record: ${table}`,
      table: table,
      update_id: update_id,
      fields: fields,
      primary_key: columns.find((column) => column.is_primary_key)?.name ?? "",
      cancel_url: site_url(`${this.module_name}/browse/${table}`),
      viewModule: this.module_name,
      viewFile: "forger",
    };
  }
  private getLimit(): number {
    const selected = session_get<number>("db_selected_per_page");

    if (selected !== undefined && this.per_page_options[selected] !== undefined) {
      return this.per_page_options[selected];
    }

    return this.default_limit;
  }

  /** Selected per-page index from the session. */
  private getSelectedPerPage(): number {
    return session_get<number>("db_selected_per_page") ?? 1;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** One-line, read-only preview of a record value. */
function input_preview(value: unknown): string {
  const text = typeof value === "string" ? value : String(value ?? "");
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}
