/**
 * Shared view types for the module_relations runtime panel.
 *
 * These mirror the arrays Module_relations_model produces:
 *   associated_rows    — {id, foreign_key, value}
 *   available_options  — {key, value}
 * plus the panel context Module_relations::panel_data() assembles.
 */

export interface PanelOption {
  key: number;
  value: string;
}

export interface PanelRow {
  id: number;
  foreign_key: number;
  value: string;
}

export interface PanelBodyData {
  view_module?: string;
  calling_module: string;
  alt_module: string;
  update_id: number;
  relation_name: string;
  associated_singular: string;
  associated_plural: string;
  calling_singular: string;
  panel_id: string;
  panel_selector: string;
  csrf_token: string;
  associated_rows: PanelRow[];
  available_options: PanelOption[];
  form_visible: boolean;
}
