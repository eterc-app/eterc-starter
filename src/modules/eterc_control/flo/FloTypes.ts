
/** A single property definition as stored by the Properties Builder. */
export interface PropertyInput {
  propertyName?: string;
  propertyType?: string;
  onForm?: string;
  isSearchable?: string;
  onSummaryTable?: string;
  validationRules?: string[];
}
export interface PostedProperty {
  property_name: string;
  property_type: string;
  on_form: string;
  is_searchable: string;
  on_summary_table: string;
  validation_rules: string[];
  form_field_name: string;
}
export interface GenerationData extends Record<string, unknown> {
  module_folder_name?: string;
  record_name_singular?: string;
  record_name_plural?: string;
  nav_label?: string;
  urlColumn?: string;
  orderBy?: string;
  properties?: string | PropertyInput[];
  run_sql?: boolean;
  icon_id?: string;
  icon_code?: string;
}
export interface GenerationResult {
  status: "success" | "error";
  headline?: string;
  message: string;
  more_info_url?: string;
  module_name?: string;
  /** Files written relative to src/modules/generated/<module>/. */
  files?: string[];
}
export interface TemplateContext extends Record<string, unknown> {
  controller_name: string;
  /** Model class/file name, e.g. "Tasks_model". */
  model_name: string;
  module_folder_name: string;
  record_name_singular: string;
  record_name_plural: string;
  record_name_singular_lower: string;
  record_name_plural_lower: string;
  /** Navigation label; empty means no link is added. */
  nav_label: string;
  /** Lower-case labels used in generated docblocks. */
  singular_comment: string;
  plural_comment: string;
  has_searchable: boolean;
  has_callbacks: boolean;
  has_validation_tests: boolean;
  needs_date_constraint_js: boolean;
  /** Sanitised ORDER BY for the generated SQL ("id", "id DESC", "col DESC"). */
  order_by: string;
  /** Sanitised URL column (may be ""). */
  url_column: string;
  searchable_columns: string[];
  /** Rendered TS array literal, e.g. `"title", "body"`. */
  searchable_columns_literal: string;
  searchable_column_labels: Record<string, string>;
  /** Rendered <option> lines for the generated search views. */
  searchable_options: string;
  posted_properties: PostedProperty[];
  /** Properties that appear on the summary table. */
  table_properties: PostedProperty[];
  dynamic_validation_tests: string;
  dynamic_callback_methods: string;
  dynamic_posted_data: string;
  dynamic_prepared_record: string;
  dynamic_validation_methods: string;
  dynamic_form_fields: string;
  dynamic_table: string;
  dynamic_details: string;
  dynamic_date_constraint_js: string;
  /** JSON string literal for the date-constraint script (may be `""`). */
  date_constraint_js_literal: string;
  /** JSON string literals used by the generated controller. */
  created_flash_literal: string;
  updated_flash_literal: string;
  create_headline_literal: string;
  update_headline_literal: string;
  details_headline_literal: string;
  delete_headline_literal: string;
  not_found_headline_literal: string;
  not_found_message_literal: string;
  plural_lower_literal: string;
  /** Views that must be generated for this module. */
  view_files: string[];
  /** "use client"; (only when the generated view needs client behaviour). */
  client_directive: string;
}

/** Metadata stored in a generated module's manifest.json. */
export interface GeneratedModuleManifest {
  module_name: string;
  class_name: string;
  record_name_singular: string;
  record_name_plural: string;
  nav_label: string;
  url_column: string;
  order_by: string;
  has_searchable: boolean;
  view_files: string[];
  generated_by: "flo" | "site_builder";
  generated_at: string;
}

/** In-memory result of rendering a module (no filesystem writes). */
export interface FloArtifacts {
  context: TemplateContext;
  /** Relative path (inside the module folder) → generated source. */
  files: Map<string, string>;
  /** The SQLite schema (also present in `files`). */
  sql: string;
}
