import * as fs from "node:fs";
import { Model } from "@/engine/model";

/**
 * Trongate_control model - port of
 * modules/trongate_control/Trongate_control_model.php.
 *
 * Handles SQL file operations for the Module Import Wizard. The PHP model
 * used file_exists()/is_writable()/unlink(); the port uses the Node fs module
 * with the same outcomes.
 */
export class Trongate_control_model extends Model {
  constructor(moduleName: string | null = "trongate_control") {
    super(moduleName);
  }

  /**
   * Check if SQL contains potentially dangerous commands.
   *
   * PHP parity: the contents are lower-cased and searched for the same four
   * substrings. Anything containing one of them is reported as unsafe.
   */
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

  /**
   * Execute SQL code (PHP: $this->db->query($sql)).
   *
   * The controller reports the framework's "Finished." response after this
   * returns, mirroring the PHP model's echo.
   */
  execute_sql(sql: string): void {
    this.db.query(sql);
  }

  /**
   * Delete a SQL file safely.
   *
   * Returns false when the file does not exist or is not writable, exactly
   * like the PHP original (the controller turns that into a 403 response).
   */
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
