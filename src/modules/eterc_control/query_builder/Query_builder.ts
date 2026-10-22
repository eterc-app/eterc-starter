import type { ReactNode } from "react";
import { Eterc } from "@/engine/controller";
import { ENV } from "@/engine/config";
import { EtHttpError } from "@/engine/signals";

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
  /** Convenience route: `/eterc_control-query_builder` → home. */
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
