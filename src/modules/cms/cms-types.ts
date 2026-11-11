/**
 * Shared types for the Eterc content service.
 *
 * The content service is intentionally database-shaped: a collection is a
 * table, a field is a column, and an item is a row. That keeps existing
 * databases useful while giving the CMS and API a Directus-style
 * layer for metadata, roles, permissions and API keys.
 */

export type CmsFieldType =
  | "string"
  | "text"
  | "integer"
  | "decimal"
  | "boolean"
  | "datetime"
  | "json"
  | "select"
  | "image"
  | "relation"
  | "alias";

export type CmsFieldInterface =
  | "input"
  | "input_autocomplete_api"
  | "block_editor"
  | "code"
  | "textarea"
  | "wysiwyg"
  | "markdown"
  | "tags"
  | "toggle"
  | "datetime"
  | "repeater"
  | "map"
  | "color"
  | "dropdown"
  | "icon"
  | "checkboxes"
  | "checkboxes_tree"
  | "dropdown_multiselect"
  | "radio"
  | "file"
  | "image"
  | "files"
  | "builder_m2a"
  | "many_to_many"
  | "one_to_many"
  | "tree_view"
  | "many_to_one"
  | "translations"
  | "header"
  | "divider"
  | "buttons"
  | "notice"
  | "accordion"
  | "detail_group"
  | "raw_group"
  | "collection_item_dropdown"
  | "collection_item_dropdown_multiple"
  | "hash"
  | "slider"
  | "number"
  | "json"
  | "select"
  | "relation";

export interface CmsField {
  id: number;
  collection_id: number;
  name: string;
  label: string;
  type: CmsFieldType;
  interface: CmsFieldInterface;
  options: Record<string, unknown>;
  required: boolean;
  unique: boolean;
  hidden: boolean;
  readonly: boolean;
  validation: CmsFieldRuleGroup;
  validation_message: string;
  conditions: CmsFieldCondition[];
  display_options: CmsFieldDisplayOptions;
  clear_hidden_value_on_save: boolean;
  /** Name of the parent group field, if this field is inside a group. */
  group: string | null;
  sort: number;
  created_at: number;
  updated_at: number;
}

export type CmsFieldRuleOperator = CmsRuleOperator;

export interface CmsFieldRuleCondition {
  field: string;
  operator: CmsFieldRuleOperator;
  value?: unknown;
}

export interface CmsFieldRuleGroup {
  match: "all" | "any";
  conditions: Array<CmsFieldRuleGroup | CmsFieldRuleCondition>;
}

export interface CmsFieldCondition {
  name: string;
  rule: CmsFieldRuleGroup;
  hidden?: boolean;
  required?: boolean;
  readonly?: boolean;
  clear_hidden_value_on_save?: boolean;
}

export interface CmsFieldDisplayOptions {
  prefix?: string;
  suffix?: string;
}

/** A Directus-style choice used by dropdown, radio and checkbox interfaces. */
export interface CmsChoice {
  text: string;
  value: string | number | boolean;
  icon?: string;
  color?: string;
  /** Parent value for tree choices. */
  parent?: string | number | boolean;
}

/** A sub-field definition used by the repeater interface. */
export interface CmsRepeaterField {
  field: string;
  name?: string;
  type?: CmsFieldType;
  interface?: CmsFieldInterface;
  options?: Record<string, unknown>;
  required?: boolean;
  width?: "half" | "full";
}

/** A presentation button configured by the buttons interface. */
export interface CmsLink {
  label: string;
  icon?: string;
  type?: "normal" | "primary" | "info" | "success" | "warning" | "danger";
  actionType?: "url" | "flow";
  url?: string;
}

export interface CmsCollection {
  id: number;
  name: string;
  label: string;
  icon: string;
  color?: string;
  display_template?: string;
  ordering_mode: CmsCollectionOrderingMode | null;
  default_order: CmsCollectionSort[];
  note: string;
  primary_key: string;
  singleton: boolean;
  hidden: boolean;
  system: boolean;
  created_at: number;
  updated_at: number;
}

export type CmsCollectionOrderingMode = "default" | "manual" | "fields";

export interface CmsCollectionSort {
  field: string;
  direction: "asc" | "desc";
}

export interface CmsCollectionWithFields extends CmsCollection {
  fields: CmsField[];
  item_count: number;
}

export interface CmsFieldInput {
  name: string;
  label?: string;
  type?: CmsFieldType;
  interface?: CmsFieldInterface;
  options?: Record<string, unknown>;
  required?: boolean;
  unique?: boolean;
  hidden?: boolean;
  readonly?: boolean;
  group?: string | null;
  validation?: CmsFieldRuleGroup;
  validation_message?: string;
  conditions?: CmsFieldCondition[];
  display_options?: CmsFieldDisplayOptions;
}

export type CmsPrimaryKeyType = "integer" | "bigInteger" | "uuid" | "string";

export interface CmsOptionalFieldsConfig {
  status?: { enabled: boolean; name: string };
  sort?: { enabled: boolean; name: string };
  date_created?: { enabled: boolean; name: string };
  user_created?: { enabled: boolean; name: string };
  date_updated?: { enabled: boolean; name: string };
  user_updated?: { enabled: boolean; name: string };
}

export interface CmsCollectionInput {
  name: string;
  label?: string;
  icon?: string;
  color?: string;
  display_template?: string;
  ordering_mode?: CmsCollectionOrderingMode;
  default_order?: CmsCollectionSort[];
  note?: string;
  singleton?: boolean;
  hidden?: boolean;
  primary_key?: string;
  primary_key_type?: CmsPrimaryKeyType;
  fields?: CmsFieldInput[];
  optional_fields?: CmsOptionalFieldsConfig;
}

export type CmsPermissionAction = "read" | "create" | "update" | "delete";

export type CmsRuleOperator =
  | "_eq"
  | "_neq"
  | "_contains"
  | "_not_contains"
  | "_starts_with"
  | "_ends_with"
  | "_gt"
  | "_gte"
  | "_lt"
  | "_lte"
  | "_null"
  | "_in";

export interface CmsRuleCondition {
  field: string;
  operator: CmsRuleOperator;
  value?: unknown;
}

export interface CmsRuleGroup {
  match: "all" | "any";
  conditions: CmsRuleCondition[];
}

export interface CmsRulePreset {
  field: string;
  value: string;
}

export interface CmsRole {
  id: number;
  user_level_id: number;
  name: string;
  slug: string;
  description: string;
  app_access: boolean;
  api_access: boolean;
  admin_access: boolean;
  is_system: boolean;
  parent_role_id: number | null;
  created_at: number;
  updated_at: number;
}

export interface CmsPermission {
  id: number;
  role_id: number;
  collection: string;
  action: CmsPermissionAction;
  fields: string[];
  filter: CmsRuleGroup;
  validation: CmsRuleGroup;
  presets: CmsRulePreset[];
  created_at: number;
  updated_at: number;
}

export interface CmsPermissionInput {
  collection: string;
  action: CmsPermissionAction;
  /** `["*"]` grants every field. An empty list grants only the primary key. */
  fields?: string[];
  filter?: CmsRuleGroup;
  validation?: CmsRuleGroup;
  presets?: CmsRulePreset[];
}

export interface CmsApiKey {
  id: number;
  name: string;
  key_prefix: string;
  role_id: number;
  role_name: string;
  user_id: number | null;
  user_name: string;
  user_email: string;
  active: boolean;
  expires_at: number | null;
  last_used_at: number | null;
  created_at: number;
}

export interface CmsApiKeyWithSecret extends CmsApiKey {
  secret: string;
}

export interface CmsUserSummary {
  id: number;
  username: string;
  email: string;
  active: boolean;
  eterc_user_id: number | null;
  role_id: number | null;
  role_name: string;
  role_slug: string;
}

export interface CmsPrincipal {
  kind: "user" | "api_key";
  role: CmsRole;
  user_id: number | null;
  user_email: string;
  user_username: string;
  api_key_id: number | null;
  label: string;
}

/** The signed-in administrator's own account summary. */
export interface CmsProfileAccount {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  title: string;
  active: boolean;
  eterc_user_id: number | null;
}

/** Self-service profile data. API keys are scoped to the current user. */
export interface CmsProfileOverview {
  account: CmsProfileAccount;
  role: CmsRole;
  parent_role_name: string | null;
  permissions: CmsPermission[];
  api_keys: CmsApiKey[];
}

export type CmsBootstrapTableStatus = "new" | "update" | "ready" | "skipped";

export interface CmsBootstrapTable {
  name: string;
  label: string;
  status: CmsBootstrapTableStatus;
  reason: string | null;
  primary_key: string | null;
  field_count: number;
  added_fields: string[];
  updated_fields: string[];
  removed_fields: string[];
}

export interface CmsBootstrapReport {
  /** True when the report describes a bootstrap that has already been applied. */
  applied: boolean;
  tables: CmsBootstrapTable[];
  summary: {
    scanned: number;
    new: number;
    update: number;
    ready: number;
    skipped: number;
  };
}

export interface CmsRecordListOptions {
  page?: number;
  limit?: number;
  sort?: string;
  direction?: "asc" | "desc";
  search?: string;
  filter?: Record<string, unknown>;
  /** Server-side row policy. It is combined with `filter` using AND. */
  access_filter?: Record<string, unknown>;
}

export interface CmsRecordListResult {
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface CmsRuntimeDatabaseConfig {
  provider: string;
  label?: string;
  values: Record<string, string>;
  status?: "unconfigured" | "verified" | "error";
  message?: string;
  verified_at?: number | null;
}

export interface CmsRuntimeAuthConfig {
  provider: string;
  label?: string;
  values: Record<string, string>;
  status?: "unconfigured" | "verified" | "error";
  message?: string;
  verified_at?: number | null;
}

export interface CmsRuntimeConfig {
  database: CmsRuntimeDatabaseConfig;
  auth: CmsRuntimeAuthConfig;
  cms: {
    api_private: boolean;
    max_page_size: number;
    seed_member_role: boolean;
  };
  updated_at: number;
}

export const CMS_ACTIONS: CmsPermissionAction[] = [
  "read",
  "create",
  "update",
  "delete",
];

export const CMS_RULE_OPERATORS: CmsRuleOperator[] = [
  "_eq",
  "_neq",
  "_contains",
  "_not_contains",
  "_starts_with",
  "_ends_with",
  "_gt",
  "_gte",
  "_lt",
  "_lte",
  "_null",
  "_in",
];

export const CMS_RULE_VARIABLES = [
  { token: "$user.id", label: "Current user ID" },
  { token: "$user.email", label: "Current user email" },
  { token: "$user.username", label: "Current username" },
  { token: "$user.role", label: "Current role name" },
  { token: "$user.role_slug", label: "Current role slug" },
] as const;

export const CMS_FIELD_TYPES: CmsFieldType[] = [
  "string",
  "text",
  "integer",
  "decimal",
  "boolean",
  "datetime",
  "json",
  "select",
  "image",
  "relation",
  "alias",
];

export function cms_field_interface(type: CmsFieldType): CmsFieldInterface {
  switch (type) {
    case "text":
      return "textarea";
    case "integer":
    case "decimal":
      return "number";
    case "boolean":
      return "toggle";
    case "datetime":
      return "datetime";
    case "json":
      return "json";
    case "select":
      return "select";
    case "image":
      return "image";
    case "relation":
      return "relation";
    case "alias":
      return "raw_group";
    default:
      return "input";
  }
}
