import * as fs from "node:fs";
import { Model } from "@/engine/model";
export class Eterc_control_model extends Model {
  constructor(moduleName: string | null = "eterc_control") {
    super(moduleName);
  }
  check_sql_safety(file_contents: string): boolean {
    const lower = file_contents.toLowerCase();
    const dangerous_patterns = ["drop ", "update ", "truncate ", "delete from"];

    for (const pattern of dangerous_patterns) {
      if (lower.includes(pattern)) {
        return false;
      }
    }

    return true;
  }
  execute_sql(sql: string): void {
    this.db.query(sql);
  }
  delete_sql_file(filepath: string): boolean {
    if (!fs.existsSync(filepath)) {
      return false;
    }

    try {
      fs.accessSync(filepath, fs.constants.W_OK);
    } catch {
      return false;
    }

    try {
      fs.unlinkSync(filepath);
    } catch {
      return false;
    }

    return true;
  }
}
