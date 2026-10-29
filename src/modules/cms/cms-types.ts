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
  | "relation";

export type CmsFieldInterface =
  | "input"
  | "textarea"
  | "number"
  | "toggle"
  | "datetime"
  | "json"
  | "select"
  | "image"
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
  sort: number;
  created_at: number;
  updated_at: number;
}

export interface CmsCollection {
  id: number;
  name: string;
  label: string;
  icon: string;
  note: string;
  primary_key: string;
  singleton: boolean;
  hidden: boolean;
  system: boolean;
  created_at: number;
  updated_at: number;
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
}

export interface CmsCollectionInput {
  name: string;
  label?: string;
  icon?: string;
  note?: string;
  singleton?: boolean;
  fields?: CmsFieldInput[];
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
    default:
      return "input";
  }
}
