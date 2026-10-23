/**
 * Shared types for the Eterc content service.
 *
 * The content service is intentionally database-shaped: a collection is a
 * table, a field is a column, and an item is a row. That keeps existing
 * databases useful while giving the control panel and API a Directus-style
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
  created_at: number;
  updated_at: number;
}

export interface CmsPermission {
  id: number;
  role_id: number;
  collection: string;
  action: CmsPermissionAction;
  fields: string[];
  created_at: number;
  updated_at: number;
}

export interface CmsPermissionInput {
  collection: string;
  action: CmsPermissionAction;
  fields?: string[];
}

export interface CmsApiKey {
  id: number;
  name: string;
  key_prefix: string;
  role_id: number;
  role_name: string;
  user_id: number | null;
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
  api_key_id: number | null;
  label: string;
}

export interface CmsRecordListOptions {
  page?: number;
  limit?: number;
  sort?: string;
  direction?: "asc" | "desc";
  search?: string;
  filter?: Record<string, unknown>;
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

export interface CmsProviderField {
  key: string;
  label: string;
  placeholder?: string;
  help?: string;
  secret?: boolean;
  required?: boolean;
}

export interface CmsProviderDefinition {
  id: string;
  name: string;
  description: string;
  badge?: string;
  fields: CmsProviderField[];
  notes?: string[];
}

export const CMS_ACTIONS: CmsPermissionAction[] = [
  "read",
  "create",
  "update",
  "delete",
];

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
