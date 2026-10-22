import type { ReactNode } from "react";
import { Eterc } from "@/engine/controller";
import { ENV } from "@/engine/config";
import { EtHttpError } from "@/engine/signals";

/**
 * Query_builder — Child module of eterc_control (port of
 * modules/eterc_control/query_builder/Query_builder.php).
 *
 * Visual SQL query builder for constructing SELECT queries with JOINs.
 * Users drag database tables onto a canvas, click columns to define
 * join relationships, and select join types via a visual menu.
 *
 * Port notes:
 *  - the original was served as a standalone document inside a Flo iframe;
 *    here `home()` renders the same full-page UI at
 *    /eterc_control-query_builder/home (the postMessage protocol with the
 *    parent window is preserved by the React view);
 *  - table/column discovery uses the ported Db helpers (`get_tables()` +
 *    `describe_table()`, i.e. sqlite_master/PRAGMA table_info) instead of
 *    MySQL's information_schema;
 *  - the dev-only gate mirrors the PHP constructor (which called
 *    eterc_control-evo::render_disabled_response() and die()d). The port
 *    raises the equivalent 403 response instead of rendering HTML into a JSON
 *    API call.
 */

/** Shape of the table/column payload handed to the React view. */
export interface QueryBuilderTable {
  id: string;
  columns: string[];
}

export default class Query_builder extends Eterc {
  constructor(moduleName?: string | null) {
    super(moduleName);

    if (ENV.toLowerCase() !== "dev") {
      throw new EtHttpError(
        403,
        "The query builder is not available outside of dev mode."
      );
    }
  }

  /**
   * Entry point: serve the Query Builder UI with live table data.
   */
  /** Port convenience: `/eterc_control-query_builder` → home. */
  async index() {
    return this.home();
  }

  async home(): Promise<ReactNode> {
    const tables = this.get_tables();

    const data = {
      tables: tables,
      tables_json: JSON.stringify(tables),
      viewModule: "query_builder",
      viewFile: "query_builder",
    };

    return this.view("query_builder/query_builder", data);
  }

  // ─── Private Helpers ───────────────────────────────────────

  /**
   * Fetch all database tables and their columns.
   *
   * PHP original: information_schema.TABLES + information_schema.COLUMNS.
   * Port: the Db service's sqlite_master/PRAGMA equivalents.
   *
   * @returns Each element: { id: 'table_name', columns: ['col1', 'col2', ...] }
   */
  private get_tables(): QueryBuilderTable[] {
    const table_names = this.db.get_tables();
    const tables: QueryBuilderTable[] = [];

    for (const table_name of table_names) {
      const description = this.db.describe_table(table_name, true);
      const col_rows = Array.isArray(description) ? description : [];

      const columns: string[] = [];
      for (const col of col_rows) {
        columns.push(String(col.name ?? ""));
      }

      tables.push({
        id: table_name,
        columns: columns,
      });
    }

    return tables;
  }
}
