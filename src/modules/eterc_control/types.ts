/**
 * Shared, client-safe types for the eterc_control parent module.
 *
 * Kept separate from the controller so `views/main.tsx` can import the shapes
 * without pulling Node-only modules (fs, session, ...) into the client bundle.
 */

/** A SQL file discovered inside the target module directory. */
export interface SqlFileInfo {
  /** Absolute path of the file (used by the AJAX actions). */
  path: string;
  /** Basename shown in the file list. */
  filename: string;
  /** Size in kilobytes, rounded to two decimal places (PHP: round(..., 2)). */
  filesize_kb: number;
  /** Result of the model's check_sql_safety() scan. */
  safe: boolean;
  /** True when the file exceeds MAX_SQL_FILE_SIZE_KB. */
  too_big: boolean;
}

/** A link to one of the control panel's child modules. */
export interface ControlPanelLink {
  href: string;
  label: string;
  description: string;
}
