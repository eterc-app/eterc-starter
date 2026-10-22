/**
 * Shared types for the site_builder child module (port of
 * modules/eterc_control/site_builder).
 */

/** Result contract preserved from PHP Site_builder::submit_generate_mod(). */
export interface GenerateModuleResult {
  status: "success" | "error";
  message: string;
  headline?: string;
  more_info_url?: string;
  module_name?: string;
  /** Absolute paths of the files written by the generator (port-only). */
  files?: string[];
}

/** A property record as posted by the Properties Builder / wizard. */
export interface PropertyInput {
  propertyName?: string;
  propertyType?: string;
  onForm?: string;
  isSearchable?: string;
  onSummaryTable?: string;
  validationRules?: string[];
  [key: string]: unknown;
}

/** A flattened property (date/time ranges are split into start/end). */
export interface PostedProperty {
  property_name: string;
  property_type: string;
  on_form: string;
  is_searchable: string;
  on_summary_table: string;
  validation_rules: string[];
  form_field_name: string;
}

/** Values accepted by submit_generate_mod(). */
export interface GenerateModuleInput {
  module_folder_name?: string;
  record_name_singular?: string;
  record_name_plural?: string;
  nav_label?: string;
  urlColumn?: string;
  orderBy?: string;
  properties?: string | PropertyInput[];
  icon_id?: string;
  icon_code?: string;
  tempParams?: string;
  run_sql?: boolean | string;
  [key: string]: unknown;
}

/** Normalized generation context used by the emitters. */
export interface GeneratorContext {
  module_folder_name: string;
  module_folder_path: string;
  class_name: string;
  record_name_singular: string;
  record_name_plural: string;
  nav_label: string;
  url_column: string;
  order_by: string;
  properties_json: string;
  properties: PropertyInput[];
  posted_properties: PostedProperty[];
  has_searchable: boolean;
  searchable_columns: string[];
  searchable_column_options: Array<{ value: string; label: string }>;
  table_properties: PostedProperty[];
}
