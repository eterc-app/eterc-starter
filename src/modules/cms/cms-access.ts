import * as crypto from "node:crypto";
import { sqlite, type Row } from "@/engine/db";
import { Eterc_tokens, type EtercUserObj } from "@/engine/Eterc_tokens";
import { get_context } from "@/engine/request-context";
import { EtHttpError } from "@/engine/signals";
import { ensure_administrator_schema } from "@/modules/eterc_administrators/administrator-schema";
import { ensure_cms_schema, make_slug, quote_identifier } from "./cms-schema";
import { collection_fields, list_collections } from "./cms-store";
import {
  CMS_ACTIONS,
  CMS_RULE_OPERATORS,
  CMS_RULE_VARIABLES,
  type CmsApiKey,
  type CmsApiKeyWithSecret,
  type CmsField,
  type CmsPermission,
  type CmsPermissionAction,
  type CmsPermissionInput,
  type CmsPrincipal,
  type CmsProfileOverview,
  type CmsRole,
  type CmsRuleCondition,
  type CmsRuleGroup,
  type CmsRuleOperator,
  type CmsRulePreset,
  type CmsUserSummary,
} from "./cms-types";

const ADMIN_LEVEL_ID = 1;
const MAX_RULE_CONDITIONS = 24;
const MAX_RULE_PRESETS = 24;

function empty_rule_group(): CmsRuleGroup {
  return { match: "all", conditions: [] };
}

function parse_rule_group(value: unknown): CmsRuleGroup {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return empty_rule_group();
    }
  }
  if (Array.isArray(parsed)) {
    return {
      match: "all",
      conditions: parsed.filter(
        (entry): entry is CmsRuleCondition =>
          Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
      ),
    };
  }
  if (!parsed || typeof parsed !== "object") return empty_rule_group();
  const group = parsed as { match?: unknown; conditions?: unknown };
  const conditions = Array.isArray(group.conditions)
    ? group.conditions.filter(
        (entry): entry is CmsRuleCondition =>
          Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
      )
    : [];
  return {
    match: group.match === "any" ? "any" : "all",
    conditions: conditions.map((condition) => ({
      field: String(condition.field ?? ""),
      operator: String(condition.operator ?? "_eq") as CmsRuleOperator,
      value: condition.value,
    })),
  };
}

function parse_presets(value: unknown): CmsRulePreset[] {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(
      (entry): entry is CmsRulePreset =>
        Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
    )
    .map((preset) => ({
      field: String(preset.field ?? ""),
      value: String(preset.value ?? ""),
    }))
    .filter((preset) => preset.field !== "");
}

function normalize_fields(collection: string, value: unknown): string[] {
  if (!Array.isArray(value)) return ["*"];
  const names = value.map(String).filter(Boolean);
  if (names.includes("*")) return ["*"];
  if (collection === "*") return ["*"];
  const available = new Set(collection_fields(collection).map((field) => field.name));
  for (const name of names) {
    if (!available.has(name)) {
      throw new EtHttpError(400, `Field '${name}' was not found in '${collection}'.`);
    }
  }
  return [...new Set(names)];
}

function normalize_rule_value(value: unknown): unknown {
  if (typeof value === "string" && value.startsWith("$") && !value.startsWith("$$")) {
    if (!CMS_RULE_VARIABLES.some((variable) => variable.token === value)) {
      throw new EtHttpError(
        400,
        `Unknown rule variable '${value}'. Use '$$' to start a literal value with '$'.`
      );
    }
  }
  return value;
}

function normalize_rule_group(collection: string, value: unknown): CmsRuleGroup {
  const group = parse_rule_group(value);
  if (collection === "*") {
    if (group.conditions.length > 0) {
      throw new EtHttpError(400, "Wildcard permissions cannot use row conditions.");
    }
    return empty_rule_group();
  }
  if (group.conditions.length > MAX_RULE_CONDITIONS) {
    throw new EtHttpError(
      400,
      `A policy can contain at most ${MAX_RULE_CONDITIONS} conditions.`
    );
  }
  const fields = new Map(collection_fields(collection).map((field) => [field.name, field]));
  const conditions = group.conditions.map((condition) => {
    const field = fields.get(condition.field);
    if (!field) {
      throw new EtHttpError(
        400,
        `Condition field '${condition.field}' was not found in '${collection}'.`
      );
    }
    if (!CMS_RULE_OPERATORS.includes(condition.operator)) {
      throw new EtHttpError(400, `Unsupported condition operator '${condition.operator}'.`);
    }
    if (condition.operator === "_null") {
      return {
        field: condition.field,
        operator: condition.operator,
        value: Boolean(condition.value),
      };
    }
    if (condition.operator === "_in") {
      const values = Array.isArray(condition.value)
        ? condition.value
        : String(condition.value ?? "")
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean);
      if (values.length === 0) {
        throw new EtHttpError(
          400,
          `Condition on '${condition.field}' needs at least one value.`
        );
      }
      return {
        field: condition.field,
        operator: condition.operator,
        value: values.slice(0, 100).map(normalize_rule_value),
      };
    }
    return {
      field: condition.field,
      operator: condition.operator,
      value: normalize_rule_value(condition.value ?? ""),
    };
  });
  return { match: group.match, conditions };
}

function normalize_presets(collection: string, value: unknown): CmsRulePreset[] {
  if (!Array.isArray(value)) return [];
  if (collection === "*") {
    if (value.length > 0) {
      throw new EtHttpError(400, "Wildcard permissions cannot use presets.");
    }
    return [];
  }
  if (value.length > MAX_RULE_PRESETS) {
    throw new EtHttpError(400, `A policy can contain at most ${MAX_RULE_PRESETS} presets.`);
  }
  const fields = new Map(collection_fields(collection).map((field) => [field.name, field]));
  const presets: CmsRulePreset[] = [];
  const used = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const preset = entry as Record<string, unknown>;
    const fieldName = String(preset.field ?? "").trim();
    const field = fields.get(fieldName);
    if (!field) {
      throw new EtHttpError(400, `Preset field '${fieldName}' was not found in '${collection}'.`);
    }
    if (field.readonly || field.name === "id") {
      throw new EtHttpError(400, `Preset field '${fieldName}' is read-only.`);
    }
    if (used.has(fieldName)) {
      throw new EtHttpError(400, `Preset field '${fieldName}' is used more than once.`);
    }
    used.add(fieldName);
    presets.push({
      field: fieldName,
      value: String(normalize_rule_value(String(preset.value ?? ""))),
    });
  }
  return presets;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function bool(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

function roleFromRow(row: Row): CmsRole {
  return {
    id: Number(row.id),
    user_level_id: Number(row.user_level_id),
    name: String(row.name ?? ""),
    slug: String(row.slug ?? ""),
    description: String(row.description ?? ""),
    app_access: bool(row.app_access),
    api_access: bool(row.api_access),
    admin_access: bool(row.admin_access),
    is_system: bool(row.is_system),
    parent_role_id:
      row.parent_role_id === null || row.parent_role_id === undefined
        ? null
        : Number(row.parent_role_id),
    created_at: Number(row.created_at ?? 0),
    updated_at: Number(row.updated_at ?? 0),
  };
}

function permissionFromRow(row: Row): CmsPermission {
  let fields: string[] = [];
  try {
    const parsed = JSON.parse(String(row.fields ?? "[]")) as unknown;
    if (Array.isArray(parsed)) fields = parsed.map(String);
  } catch {
    fields = [];
  }
  return {
    id: Number(row.id),
    role_id: Number(row.role_id),
    collection: String(row.collection ?? ""),
    action: String(row.action ?? "read") as CmsPermissionAction,
    fields,
    filter: parse_rule_group(row.filter),
    validation: parse_rule_group(row.validation),
    presets: parse_presets(row.presets),
    created_at: Number(row.created_at ?? 0),
    updated_at: Number(row.updated_at ?? 0),
  };
}

function apiKeyFromRow(row: Row): CmsApiKey {
  return {
    id: Number(row.id),
    name: String(row.name ?? ""),
    key_prefix: String(row.key_prefix ?? ""),
    role_id: Number(row.role_id),
    role_name: String(row.role_name ?? ""),
    user_id: row.user_id === null || row.user_id === undefined ? null : Number(row.user_id),
    user_name: String(row.user_name ?? ""),
    user_email: String(row.user_email ?? ""),
    active: bool(row.active),
    expires_at: row.expires_at === null || row.expires_at === undefined ? null : Number(row.expires_at),
    last_used_at:
      row.last_used_at === null || row.last_used_at === undefined ? null : Number(row.last_used_at),
    created_at: Number(row.created_at ?? 0),
  };
}

export function get_role_by_level_id(levelId: number): CmsRole | null {
  ensure_cms_schema();
  const row = sqlite()
    .prepare("SELECT * FROM eterc_roles WHERE user_level_id = ? LIMIT 1")
    .get(levelId) as Row | undefined;
  return row ? roleFromRow(row) : null;
}

export function get_role_by_id(roleId: number): CmsRole | null {
  ensure_cms_schema();
  const row = sqlite()
    .prepare("SELECT * FROM eterc_roles WHERE id = ? LIMIT 1")
    .get(roleId) as Row | undefined;
  return row ? roleFromRow(row) : null;
}

export function get_role_by_slug(slug: string): CmsRole | null {
  ensure_cms_schema();
  const row = sqlite()
    .prepare("SELECT * FROM eterc_roles WHERE slug = ? LIMIT 1")
    .get(slug) as Row | undefined;
  return row ? roleFromRow(row) : null;
}

function validate_parent_role(roleId: number | null, parentId: number | null): number | null {
  if (parentId === null || parentId <= 0) return null;
  if (roleId !== null && parentId === roleId) {
    throw new EtHttpError(400, "A role cannot be its own parent.");
  }
  const parent = get_role_by_id(parentId);
  if (!parent) throw new EtHttpError(400, "The parent role was not found.");
  let cursor: CmsRole | null = parent;
  const seen = new Set<number>();
  while (cursor) {
    if (roleId !== null && cursor.id === roleId) {
      throw new EtHttpError(400, "That parent role would create a role inheritance cycle.");
    }
    if (seen.has(cursor.id)) {
      throw new EtHttpError(400, "The existing role hierarchy contains a cycle.");
    }
    seen.add(cursor.id);
    cursor =
      cursor.parent_role_id === null ? null : get_role_by_id(cursor.parent_role_id);
  }
  return parentId;
}

export function list_roles(): Array<CmsRole & { user_count: number }> {
  ensure_cms_schema();
  const rows = sqlite()
    .prepare(
      `SELECT r.*, (
         SELECT COUNT(*) FROM eterc_users u WHERE u.user_level_id = r.user_level_id
       ) AS user_count
       FROM eterc_roles r
       ORDER BY r.is_system DESC, r.name ASC`
    )
    .all() as Row[];
  return rows.map((row) => ({
    ...roleFromRow(row),
    user_count: Number(row.user_count ?? 0),
  }));
}

export function create_role(input: {
  name: string;
  description?: string;
  app_access?: boolean;
  api_access?: boolean;
  admin_access?: boolean;
  parent_role_id?: number | null;
}): CmsRole {
  ensure_cms_schema();
  const name = String(input.name ?? "").trim();
  if (name.length < 2 || name.length > 50) {
    throw new EtHttpError(400, "Role names must contain between 2 and 50 characters.");
  }
  const slug = make_slug(name);
  if (!slug) throw new EtHttpError(400, "Role name must contain letters or numbers.");
  const existing = sqlite()
    .prepare("SELECT id FROM eterc_roles WHERE name = ? OR slug = ? LIMIT 1")
    .get(name, slug) as { id: number } | undefined;
  if (existing) throw new EtHttpError(409, "A role with that name already exists.");
  const parentId = validate_parent_role(null, input.parent_role_id ?? null);

  const now = nowSeconds();
  const levelResult = sqlite()
    .prepare("INSERT INTO eterc_user_levels (level_title) VALUES (?)")
    .run(name);
  const levelId = Number(levelResult.lastInsertRowid);
  const result = sqlite()
    .prepare(
      `INSERT INTO eterc_roles
        (user_level_id, name, slug, description, app_access, api_access, admin_access, is_system, parent_role_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
    )
    .run(
      levelId,
      name,
      slug,
      String(input.description ?? ""),
      input.app_access === false ? 0 : 1,
      input.api_access === false ? 0 : 1,
      input.admin_access ? 1 : 0,
      parentId,
      now,
      now
    );
  return get_role_by_id(Number(result.lastInsertRowid)) as CmsRole;
}

export function update_role(
  roleId: number,
  patch: {
    name?: string;
    description?: string;
    app_access?: boolean;
    api_access?: boolean;
    admin_access?: boolean;
    parent_role_id?: number | null;
  }
): CmsRole {
  const role = get_role_by_id(roleId);
  if (!role) throw new EtHttpError(404, "Role not found.");

  let name = patch.name !== undefined ? String(patch.name).trim() : role.name;
  let slug = role.slug;
  if (role.is_system) {
    name = role.name;
    slug = role.slug;
  } else if (patch.name !== undefined) {
    if (name.length < 2 || name.length > 50) {
      throw new EtHttpError(400, "Role names must contain between 2 and 50 characters.");
    }
    slug = make_slug(name);
    const duplicate = sqlite()
      .prepare("SELECT id FROM eterc_roles WHERE (name = ? OR slug = ?) AND id != ? LIMIT 1")
      .get(name, slug, roleId) as { id: number } | undefined;
    if (duplicate) throw new EtHttpError(409, "A role with that name already exists.");
  }

  const appAccess = role.is_system ? true : patch.app_access ?? role.app_access;
  const apiAccess = role.is_system ? true : patch.api_access ?? role.api_access;
  const adminAccess = role.is_system ? true : patch.admin_access ?? role.admin_access;
  const parentId = role.is_system
    ? null
    : patch.parent_role_id !== undefined
      ? validate_parent_role(roleId, patch.parent_role_id)
      : role.parent_role_id;

  sqlite()
    .prepare(
      `UPDATE eterc_roles
       SET name = ?, slug = ?, description = ?, app_access = ?, api_access = ?, admin_access = ?, parent_role_id = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(
      name,
      slug,
      patch.description ?? role.description,
      appAccess ? 1 : 0,
      apiAccess ? 1 : 0,
      adminAccess ? 1 : 0,
      parentId,
      nowSeconds(),
      roleId
    );
  sqlite()
    .prepare("UPDATE eterc_user_levels SET level_title = ? WHERE id = ?")
    .run(name, role.user_level_id);
  return get_role_by_id(roleId) as CmsRole;
}

export function delete_role(roleId: number): void {
  const role = get_role_by_id(roleId);
  if (!role) throw new EtHttpError(404, "Role not found.");
  if (role.is_system || role.user_level_id === ADMIN_LEVEL_ID) {
    throw new EtHttpError(403, "The system admin role cannot be deleted.");
  }
  const users = sqlite()
    .prepare("SELECT COUNT(*) AS count FROM eterc_users WHERE user_level_id = ?")
    .get(role.user_level_id) as { count: number };
  if (Number(users.count) > 0) {
    throw new EtHttpError(409, "Move the users assigned to this role before deleting it.");
  }
  const children = sqlite()
    .prepare("SELECT COUNT(*) AS count FROM eterc_roles WHERE parent_role_id = ?")
    .get(roleId) as { count: number };
  if (Number(children.count) > 0) {
    throw new EtHttpError(409, "Move or delete the child roles before deleting this role.");
  }
  sqlite().prepare("DELETE FROM eterc_permissions WHERE role_id = ?").run(roleId);
  sqlite().prepare("DELETE FROM eterc_roles WHERE id = ?").run(roleId);
  sqlite().prepare("DELETE FROM eterc_user_levels WHERE id = ?").run(role.user_level_id);
}

export function list_permissions(roleId: number): CmsPermission[] {
  ensure_cms_schema();
  return (
    sqlite()
      .prepare("SELECT * FROM eterc_permissions WHERE role_id = ? ORDER BY collection, action")
      .all(roleId) as Row[]
  ).map(permissionFromRow);
}

export function replace_permissions(
  roleId: number,
  permissions: CmsPermissionInput[]
): CmsPermission[] {
  const role = get_role_by_id(roleId);
  if (!role) throw new EtHttpError(404, "Role not found.");
  if (role.is_system) {
    throw new EtHttpError(403, "The system admin role always has full access.");
  }
  const now = nowSeconds();
  const transaction = sqlite().transaction(() => {
    sqlite().prepare("DELETE FROM eterc_permissions WHERE role_id = ?").run(roleId);
    const insert = sqlite().prepare(
      `INSERT INTO eterc_permissions
        (role_id, collection, action, fields, filter, validation, presets, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const seen = new Set<string>();
    for (const permission of permissions) {
      const collection = String(permission.collection ?? "").trim();
      if (!collection) continue;
      if (collection !== "*") {
        const table = sqlite()
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
          .get(collection) as { name: string } | undefined;
        if (!table) throw new EtHttpError(400, `Collection '${collection}' was not found.`);
      }
      if (!CMS_ACTIONS.includes(permission.action)) {
        throw new EtHttpError(400, `Unknown permission action '${permission.action}'.`);
      }
      const key = `${collection}:${permission.action}`;
      if (seen.has(key)) {
        throw new EtHttpError(400, `Duplicate policy for '${collection}' (${permission.action}).`);
      }
      seen.add(key);
      const fields = normalize_fields(collection, permission.fields);
      const filter = normalize_rule_group(collection, permission.filter);
      const validation = normalize_rule_group(collection, permission.validation);
      const presets = normalize_presets(collection, permission.presets);
      insert.run(
        roleId,
        collection,
        permission.action,
        JSON.stringify(fields),
        JSON.stringify(filter),
        JSON.stringify(validation),
        JSON.stringify(presets),
        now,
        now
      );
    }
  });
  transaction();
  return list_permissions(roleId);
}

export function set_permission(
  roleId: number,
  input: CmsPermissionInput & { enabled: boolean }
): CmsPermission[] {
  const role = get_role_by_id(roleId);
  if (!role) throw new EtHttpError(404, "Role not found.");
  if (role.is_system) {
    throw new EtHttpError(403, "The system admin role always has full access.");
  }
  const collection = String(input.collection ?? "").trim();
  if (!collection) throw new EtHttpError(400, "A collection is required.");
  if (!CMS_ACTIONS.includes(input.action)) {
    throw new EtHttpError(400, "Unknown permission action.");
  }
  if (collection !== "*") {
    const table = sqlite()
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(collection) as { name: string } | undefined;
    if (!table) throw new EtHttpError(400, `Collection '${collection}' was not found.`);
  }
  if (input.enabled) {
    const now = nowSeconds();
    sqlite()
      .prepare(
        `INSERT INTO eterc_permissions
          (role_id, collection, action, fields, filter, validation, presets, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(role_id, collection, action)
         DO UPDATE SET
           fields = excluded.fields,
           filter = excluded.filter,
           validation = excluded.validation,
           presets = excluded.presets,
           updated_at = excluded.updated_at`
      )
      .run(
        roleId,
        collection,
        input.action,
        JSON.stringify(normalize_fields(collection, input.fields)),
        JSON.stringify(normalize_rule_group(collection, input.filter)),
        JSON.stringify(normalize_rule_group(collection, input.validation)),
        JSON.stringify(normalize_presets(collection, input.presets)),
        now,
        now
      );
  } else {
    sqlite()
      .prepare(
        "DELETE FROM eterc_permissions WHERE role_id = ? AND collection = ? AND action = ?"
      )
      .run(roleId, collection, input.action);
  }
  return list_permissions(roleId);
}

export function list_users(): CmsUserSummary[] {
  ensure_cms_schema();
  const rows = sqlite()
    .prepare(
      `SELECT
         a.id,
         COALESCE(a.username, '') AS username,
         COALESCE(a.email, '') AS email,
         a.active,
         a.eterc_user_id,
         u.user_level_id,
         r.id AS role_id,
         COALESCE(r.name, '') AS role_name,
         COALESCE(r.slug, '') AS role_slug
       FROM eterc_administrators a
       LEFT JOIN eterc_users u ON u.id = a.eterc_user_id
       LEFT JOIN eterc_roles r ON r.user_level_id = u.user_level_id
       ORDER BY a.id ASC`
    )
    .all() as Row[];
  return rows.map((row) => ({
    id: Number(row.id),
    username: String(row.username ?? ""),
    email: String(row.email ?? ""),
    active: bool(row.active),
    eterc_user_id: row.eterc_user_id === null ? null : Number(row.eterc_user_id),
    role_id: row.role_id === null || row.role_id === undefined ? null : Number(row.role_id),
    role_name: String(row.role_name ?? "Unassigned"),
    role_slug: String(row.role_slug ?? ""),
  }));
}

export function set_user_role(administratorId: number, roleId: number): CmsUserSummary {
  const role = get_role_by_id(roleId);
  if (!role) throw new EtHttpError(404, "Role not found.");
  const admin = sqlite()
    .prepare("SELECT * FROM eterc_administrators WHERE id = ? LIMIT 1")
    .get(administratorId) as Row | undefined;
  if (!admin) throw new EtHttpError(404, "User not found.");

  let userId = admin.eterc_user_id === null ? 0 : Number(admin.eterc_user_id);
  if (userId <= 0) {
    const result = sqlite()
      .prepare("INSERT INTO eterc_users (code, user_level_id) VALUES (?, ?)")
      .run(crypto.randomBytes(16).toString("hex"), role.user_level_id);
    userId = Number(result.lastInsertRowid);
    sqlite()
      .prepare("UPDATE eterc_administrators SET eterc_user_id = ? WHERE id = ?")
      .run(userId, administratorId);
  } else {
    sqlite()
      .prepare("UPDATE eterc_users SET user_level_id = ? WHERE id = ?")
      .run(role.user_level_id, userId);
  }

  const updated = list_users().find((user) => user.id === administratorId);
  if (!updated) throw new EtHttpError(500, "The user could not be updated.");
  return updated;
}

export function list_api_keys(): CmsApiKey[] {
  ensure_cms_schema();
  const rows = sqlite()
    .prepare(
      `SELECT k.*, COALESCE(r.name, '') AS role_name,
         COALESCE((SELECT a.username FROM eterc_administrators a
                   WHERE a.eterc_user_id = k.user_id LIMIT 1), '') AS user_name,
         COALESCE((SELECT a.email FROM eterc_administrators a
                   WHERE a.eterc_user_id = k.user_id LIMIT 1), '') AS user_email
       FROM eterc_api_keys k
       LEFT JOIN eterc_roles r ON r.id = k.role_id
       ORDER BY k.created_at DESC, k.id DESC`
    )
    .all() as Row[];
  return rows.map(apiKeyFromRow);
}

export function list_api_keys_for_user(userId: number): CmsApiKey[] {
  ensure_cms_schema();
  ensure_administrator_schema();
  const rows = sqlite()
    .prepare(
      `SELECT k.*, COALESCE(r.name, '') AS role_name,
         COALESCE((SELECT a.username FROM eterc_administrators a
                   WHERE a.eterc_user_id = k.user_id LIMIT 1), '') AS user_name,
         COALESCE((SELECT a.email FROM eterc_administrators a
                   WHERE a.eterc_user_id = k.user_id LIMIT 1), '') AS user_email
       FROM eterc_api_keys k
       LEFT JOIN eterc_roles r ON r.id = k.role_id
       WHERE k.user_id = ?
       ORDER BY k.created_at DESC, k.id DESC`
    )
    .all(userId) as Row[];
  return rows.map(apiKeyFromRow);
}

export function create_api_key(input: {
  name: string;
  roleId: number;
  userId?: number | null;
  expiresAt?: number | null;
}): CmsApiKeyWithSecret {
  ensure_cms_schema();
  const name = String(input.name ?? "").trim();
  if (name.length < 2 || name.length > 80) {
    throw new EtHttpError(400, "API key names must contain between 2 and 80 characters.");
  }
  const role = get_role_by_id(Number(input.roleId));
  if (!role) throw new EtHttpError(404, "Role not found.");
  if (!role.api_access) {
    throw new EtHttpError(403, "That role does not have API access.");
  }

  const expiresAt = input.expiresAt ?? null;
  if (expiresAt !== null) {
    if (!Number.isFinite(expiresAt)) {
      throw new EtHttpError(400, "The API key expiry date is invalid.");
    }
    if (expiresAt <= nowSeconds()) {
      throw new EtHttpError(400, "The API key expiry date must be in the future.");
    }
  }

  let userId: number | null = null;
  if (input.userId !== null && input.userId !== undefined) {
    const candidate = Number(input.userId);
    const user = sqlite()
      .prepare("SELECT id FROM eterc_users WHERE id = ? LIMIT 1")
      .get(candidate) as { id: number } | undefined;
    if (!user) throw new EtHttpError(404, "The selected user was not found.");
    userId = candidate;
  }

  const prefix = crypto.randomBytes(6).toString("hex");
  const secret = crypto.randomBytes(24).toString("base64url");
  const raw = `etk_${prefix}_${secret}`;
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  const now = nowSeconds();
  const result = sqlite()
    .prepare(
      `INSERT INTO eterc_api_keys
        (name, key_prefix, key_hash, role_id, user_id, active, expires_at, last_used_at, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, NULL, ?)`
    )
    .run(
      name,
      prefix,
      hash,
      role.id,
      userId,
      expiresAt,
      now
    );
  const row = sqlite()
    .prepare(
      `SELECT k.*, COALESCE(r.name, '') AS role_name,
         COALESCE((SELECT a.username FROM eterc_administrators a
                   WHERE a.eterc_user_id = k.user_id LIMIT 1), '') AS user_name,
         COALESCE((SELECT a.email FROM eterc_administrators a
                   WHERE a.eterc_user_id = k.user_id LIMIT 1), '') AS user_email
       FROM eterc_api_keys k LEFT JOIN eterc_roles r ON r.id = k.role_id
       WHERE k.id = ?`
    )
    .get(result.lastInsertRowid) as Row;
  return { ...apiKeyFromRow(row), secret: raw };
}

/**
 * Create a key for the signed-in user. The key inherits the user's current
 * role; callers cannot choose a different role or bind another account.
 */
export function create_self_api_key(
  principal: CmsPrincipal,
  input: { name: string; expiresAt?: number | null }
): CmsApiKeyWithSecret {
  if (principal.kind !== "user" || principal.user_id === null) {
    throw new EtHttpError(403, "API keys cannot create other API keys.");
  }
  if (!principal.role.api_access) {
    throw new EtHttpError(403, "Your role does not have API access.");
  }
  return create_api_key({
    name: input.name,
    roleId: principal.role.id,
    userId: principal.user_id,
    expiresAt: input.expiresAt ?? null,
  });
}

/** Revoke one key, but only when it belongs to the signed-in user. */
export function revoke_self_api_key(principal: CmsPrincipal, keyId: number): void {
  if (principal.kind !== "user" || principal.user_id === null) {
    throw new EtHttpError(403, "API keys cannot revoke profile keys.");
  }
  ensure_cms_schema();
  const row = sqlite()
    .prepare("SELECT user_id FROM eterc_api_keys WHERE id = ? LIMIT 1")
    .get(keyId) as Row | undefined;
  if (!row) throw new EtHttpError(404, "API key not found.");
  if (Number(row.user_id ?? 0) !== principal.user_id) {
    throw new EtHttpError(404, "API key not found.");
  }
  revoke_api_key(keyId);
}

export function revoke_api_key(keyId: number): void {
  ensure_cms_schema();
  const result = sqlite()
    .prepare("UPDATE eterc_api_keys SET active = 0 WHERE id = ?")
    .run(keyId);
  if (result.changes === 0) throw new EtHttpError(404, "API key not found.");
}

export function delete_api_key(keyId: number): void {
  ensure_cms_schema();
  const result = sqlite().prepare("DELETE FROM eterc_api_keys WHERE id = ?").run(keyId);
  if (result.changes === 0) throw new EtHttpError(404, "API key not found.");
}

function timing_safe_equal(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function verify_api_key(raw: string): CmsPrincipal | null {
  ensure_cms_schema();
  const match = /^etk_([a-f0-9]{12})_([A-Za-z0-9_-]+)$/.exec(raw.trim());
  if (!match) return null;
  const [, prefix, secret] = match;
  const row = sqlite()
    .prepare(
      `SELECT k.*, COALESCE(r.name, '') AS role_name,
         COALESCE((SELECT a.username FROM eterc_administrators a
                   WHERE a.eterc_user_id = k.user_id LIMIT 1), '') AS user_name,
         COALESCE((SELECT a.email FROM eterc_administrators a
                   WHERE a.eterc_user_id = k.user_id LIMIT 1), '') AS user_email
       FROM eterc_api_keys k LEFT JOIN eterc_roles r ON r.id = k.role_id
       WHERE k.key_prefix = ? LIMIT 1`
    )
    .get(prefix) as Row | undefined;
  if (!row || !bool(row.active)) return null;
  const expiresAt = row.expires_at === null ? null : Number(row.expires_at);
  if (expiresAt !== null && expiresAt <= nowSeconds()) return null;
  const rawKey = `etk_${prefix}_${secret}`;
  const hash = crypto.createHash("sha256").update(rawKey).digest("hex");
  if (!timing_safe_equal(String(row.key_hash), hash)) return null;

  const role = get_role_by_id(Number(row.role_id));
  if (!role || !role.api_access) return null;
  sqlite()
    .prepare("UPDATE eterc_api_keys SET last_used_at = ? WHERE id = ?")
    .run(nowSeconds(), row.id);

  return {
    kind: "api_key",
    role,
    user_id: row.user_id === null || row.user_id === undefined ? null : Number(row.user_id),
    user_email: String(row.user_email ?? ""),
    user_username: String(row.user_name ?? ""),
    api_key_id: Number(row.id),
    label: String(row.name ?? "API key"),
  };
}

function principal_from_user(user: EtercUserObj): CmsPrincipal {
  const role = get_role_by_level_id(Number(user.user_level_id));
  if (!role) {
    throw new EtHttpError(403, "Your account has no role assigned.");
  }
  const administrator = sqlite()
    .prepare(
      `SELECT username, email FROM eterc_administrators
       WHERE eterc_user_id = ? LIMIT 1`
    )
    .get(Number(user.eterc_user_id)) as { username: string; email: string } | undefined;
  return {
    kind: "user",
    role,
    user_id: Number(user.eterc_user_id),
    user_email: String(administrator?.email ?? ""),
    user_username: String(administrator?.username ?? ""),
    api_key_id: null,
    label: user.user_level ?? role.name,
  };
}

export function resolve_principal(options: { requireApiAccess?: boolean } = {}): CmsPrincipal {
  const context = get_context();
  const authorization = context.headers.get("authorization") ?? "";
  const bearer = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
  const headerKey = context.headers.get("x-api-key") ?? "";
  const rawKey = bearer.startsWith("etk_") ? bearer : headerKey;

  if (rawKey) {
    const principal = verify_api_key(rawKey);
    if (!principal) {
      throw new EtHttpError(401, "The API key is invalid, expired or disabled.");
    }
    if (options.requireApiAccess !== false && !principal.role.api_access) {
      throw new EtHttpError(403, "This role does not have API access.");
    }
    return principal;
  }

  const tokens = new Eterc_tokens();
  const token = tokens.attempt_get_valid_token();
  if (token === false) {
    throw new EtHttpError(
      401,
      "Authentication required. Send an API key with the Authorization: Bearer header or an EtercToken header."
    );
  }
  const user = tokens.get_user_obj(token);
  if (user === false) {
    throw new EtHttpError(401, "The supplied token is not valid.");
  }
  const principal = principal_from_user(user);
  if (options.requireApiAccess !== false && !principal.role.api_access) {
    throw new EtHttpError(403, "This role does not have API access.");
  }
  return principal;
}

export function require_admin_user(): CmsPrincipal {
  const principal = resolve_principal({ requireApiAccess: false });
  if (!principal.role.admin_access) {
    throw new EtHttpError(403, "You need the Admin role to open this area.");
  }
  return principal;
}

/**
 * Require a signed-in person (not an API key) for self-service account work.
 * App access is checked separately so an API-only role cannot open profile.
 */
export function require_human_user(options: { requireAppAccess?: boolean } = {}): CmsPrincipal {
  const principal = resolve_principal({ requireApiAccess: false });
  if (principal.kind !== "user" || principal.user_id === null) {
    throw new EtHttpError(403, "API keys cannot manage profile settings.");
  }
  if (options.requireAppAccess !== false && !principal.role.app_access) {
    throw new EtHttpError(403, "Your role does not have app access.");
  }
  return principal;
}

/** Schema, role and API-key management require a signed-in administrator. */
export function require_human_admin(): CmsPrincipal {
  const principal = require_admin_user();
  if (principal.kind !== "user") {
    throw new EtHttpError(403, "API keys cannot manage the project schema or access control.");
  }
  return principal;
}

function direct_permission(
  roleId: number,
  collection: string,
  action: CmsPermissionAction
): CmsPermission | null {
  const row = sqlite()
    .prepare(
      `SELECT * FROM eterc_permissions
       WHERE role_id = ? AND (collection = ? OR collection = '*') AND action = ?
       ORDER BY CASE WHEN collection = '*' THEN 1 ELSE 0 END
       LIMIT 1`
    )
    .get(roleId, collection, action) as Row | undefined;
  return row ? permissionFromRow(row) : null;
}

export function find_permission(
  roleId: number,
  collection: string,
  action: CmsPermissionAction,
  seen: Set<number> = new Set()
): CmsPermission | null {
  if (seen.has(roleId)) return null;
  seen.add(roleId);
  const permission = direct_permission(roleId, collection, action);
  if (permission) return permission;
  const role = get_role_by_id(roleId);
  if (!role || role.parent_role_id === null) return null;
  return find_permission(role.parent_role_id, collection, action, seen);
}

function full_permission(
  principal: CmsPrincipal,
  collection: string,
  action: CmsPermissionAction
): CmsPermission {
  return {
    id: 0,
    role_id: principal.role.id,
    collection,
    action,
    fields: ["*"],
    filter: empty_rule_group(),
    validation: empty_rule_group(),
    presets: [],
    created_at: 0,
    updated_at: 0,
  };
}

export function authorize(
  principal: CmsPrincipal,
  collection: string,
  action: CmsPermissionAction
): CmsPermission {
  if (principal.role.admin_access) return full_permission(principal, collection, action);
  const permission = find_permission(principal.role.id, collection, action);
  if (!permission) {
    throw new EtHttpError(
      403,
      `The role '${principal.role.name}' cannot ${action} '${collection}'.`
    );
  }
  return permission;
}

export function can_use_collection(
  principal: CmsPrincipal,
  collection: string
): boolean {
  if (principal.role.admin_access) return true;
  return CMS_ACTIONS.some(
    (action) => find_permission(principal.role.id, collection, action) !== null
  );
}

export function accessible_collections(principal: CmsPrincipal): string[] {
  const all = list_collections({ include_hidden: true }).map((collection) => collection.name);
  if (principal.role.admin_access) return all;
  return all.filter((name) => can_use_collection(principal, name));
}

export function filter_fields(
  fields: string[],
  row: Record<string, unknown>
): Record<string, unknown> {
  if (fields.includes("*")) return row;
  const allowed = new Set(["id", ...fields]);
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => allowed.has(key))
  );
}

export function assert_field_access(
  principal: CmsPrincipal,
  collection: string,
  action: CmsPermissionAction,
  input: Record<string, unknown>,
  policy?: CmsPermission
): void {
  const permission = policy ?? authorize(principal, collection, action);
  if (permission.fields.includes("*")) return;
  const allowed = new Set(permission.fields);
  const presetFields =
    action === "create" ? new Set(permission.presets.map((preset) => preset.field)) : new Set<string>();
  for (const key of Object.keys(input)) {
    if (key === "id") continue;
    if (presetFields.has(key)) continue;
    if (!allowed.has(key)) {
      throw new EtHttpError(
        403,
        `The role '${principal.role.name}' cannot write the field '${key}'.`
      );
    }
  }
}

interface ResolvedVariable {
  ok: boolean;
  value?: unknown;
  message?: string;
}

function resolve_rule_variable(value: unknown, principal: CmsPrincipal): ResolvedVariable {
  if (typeof value !== "string" || !value.startsWith("$")) {
    return { ok: true, value };
  }
  if (value.startsWith("$$")) {
    return { ok: true, value: value.slice(1) };
  }
  switch (value) {
    case "$user.id":
      if (principal.user_id === null || principal.user_id <= 0) {
        return { ok: false, message: "This policy requires a signed-in user." };
      }
      return { ok: true, value: principal.user_id };
    case "$user.email":
      if (!principal.user_email) {
        return {
          ok: false,
          message: "This policy requires a user with an email address.",
        };
      }
      return { ok: true, value: principal.user_email };
    case "$user.username":
      if (!principal.user_username) {
        return {
          ok: false,
          message: "This policy requires a user with a username.",
        };
      }
      return { ok: true, value: principal.user_username };
    case "$user.role":
      return { ok: true, value: principal.role.name };
    case "$user.role_slug":
      return { ok: true, value: principal.role.slug };
    default:
      return {
        ok: false,
        message: `The policy uses an unknown variable '${value}'.`,
      };
  }
}

function resolve_rule_group(
  group: CmsRuleGroup,
  principal: CmsPrincipal,
  collection: string
): CmsRuleGroup {
  if (group.conditions.length === 0) return empty_rule_group();
  if (collection === "*") {
    throw new EtHttpError(403, "Wildcard policies cannot evaluate row conditions.");
  }
  const fields = new Set(collection_fields(collection).map((field) => field.name));
  const conditions: CmsRuleCondition[] = [];
  for (const condition of group.conditions) {
    if (!fields.has(condition.field)) {
      throw new EtHttpError(
        403,
        `The access policy references the missing field '${condition.field}'.`
      );
    }
    if (!CMS_RULE_OPERATORS.includes(condition.operator)) {
      throw new EtHttpError(403, "The access policy uses an unsupported condition operator.");
    }
    if (condition.operator === "_null") {
      conditions.push({
        field: condition.field,
        operator: condition.operator,
        value: Boolean(condition.value),
      });
      continue;
    }
    if (condition.operator === "_in") {
      const raw = Array.isArray(condition.value) ? condition.value : [condition.value];
      const values: unknown[] = [];
      for (const entry of raw) {
        const resolved = resolve_rule_variable(entry, principal);
        if (!resolved.ok) {
          throw new EtHttpError(403, resolved.message ?? "The policy could not resolve a value.");
        }
        values.push(resolved.value);
      }
      conditions.push({
        field: condition.field,
        operator: condition.operator,
        value: values,
      });
      continue;
    }
    const resolved = resolve_rule_variable(condition.value, principal);
    if (!resolved.ok) {
      throw new EtHttpError(403, resolved.message ?? "The policy could not resolve a value.");
    }
    conditions.push({
      field: condition.field,
      operator: condition.operator,
      value: resolved.value,
    });
  }
  return { match: group.match, conditions };
}

export function rule_group_to_filter(
  group: CmsRuleGroup,
  principal: CmsPrincipal,
  collection: string
): Record<string, unknown> | undefined {
  const resolved = resolve_rule_group(group, principal, collection);
  if (resolved.conditions.length === 0) return undefined;
  const clauses = resolved.conditions.map((condition) => ({
    [condition.field]: { [condition.operator]: condition.value },
  }));
  return resolved.match === "any" ? { _or: clauses } : { _and: clauses };
}

function is_empty_value(value: unknown): boolean {
  return value === null || value === undefined;
}

function as_number(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function as_boolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return null;
}

function values_equal(left: unknown, right: unknown): boolean {
  if (is_empty_value(left) || is_empty_value(right)) {
    return is_empty_value(left) && is_empty_value(right);
  }
  if (typeof left === "boolean" || typeof right === "boolean") {
    const leftBool = as_boolean(left);
    const rightBool = as_boolean(right);
    if (leftBool === null || rightBool === null) return false;
    return leftBool === rightBool;
  }
  const leftNumber = as_number(left);
  const rightNumber = as_number(right);
  if (leftNumber !== null && rightNumber !== null) return leftNumber === rightNumber;
  return String(left) === String(right);
}

function ordered_compare(left: unknown, right: unknown): number | null {
  const leftNumber = as_number(left);
  const rightNumber = as_number(right);
  if (leftNumber !== null && rightNumber !== null) {
    return leftNumber === rightNumber ? 0 : leftNumber < rightNumber ? -1 : 1;
  }
  if (is_empty_value(left) || is_empty_value(right)) return null;
  const leftText = String(left);
  const rightText = String(right);
  return leftText === rightText ? 0 : leftText < rightText ? -1 : 1;
}

function condition_matches(
  row: Record<string, unknown>,
  condition: CmsRuleCondition
): boolean {
  const actual = row[condition.field];
  const expected = condition.value;
  switch (condition.operator) {
    case "_eq":
      return values_equal(actual, expected);
    case "_neq":
      return !values_equal(actual, expected);
    case "_contains":
      return !is_empty_value(actual) &&
        String(actual).toLowerCase().includes(String(expected ?? "").toLowerCase());
    case "_not_contains":
      return is_empty_value(actual) ||
        !String(actual).toLowerCase().includes(String(expected ?? "").toLowerCase());
    case "_starts_with":
      return !is_empty_value(actual) &&
        String(actual).toLowerCase().startsWith(String(expected ?? "").toLowerCase());
    case "_ends_with":
      return !is_empty_value(actual) &&
        String(actual).toLowerCase().endsWith(String(expected ?? "").toLowerCase());
    case "_gt": {
      const order = ordered_compare(actual, expected);
      return order !== null && order > 0;
    }
    case "_gte": {
      const order = ordered_compare(actual, expected);
      return order !== null && order >= 0;
    }
    case "_lt": {
      const order = ordered_compare(actual, expected);
      return order !== null && order < 0;
    }
    case "_lte": {
      const order = ordered_compare(actual, expected);
      return order !== null && order <= 0;
    }
    case "_null":
      return Boolean(expected) ? is_empty_value(actual) : !is_empty_value(actual);
    case "_in": {
      const values = Array.isArray(expected) ? expected : [expected];
      return values.some((value) => values_equal(actual, value));
    }
    default:
      return false;
  }
}

export function row_matches_rule_group(
  row: Record<string, unknown>,
  group: CmsRuleGroup,
  principal: CmsPrincipal,
  collection: string
): boolean {
  const resolved = resolve_rule_group(group, principal, collection);
  if (resolved.conditions.length === 0) return true;
  const matches = resolved.conditions.map((condition) => condition_matches(row, condition));
  return resolved.match === "any" ? matches.some(Boolean) : matches.every(Boolean);
}

export function apply_presets(
  input: Record<string, unknown>,
  presets: CmsRulePreset[],
  principal: CmsPrincipal,
  collection: string
): Record<string, unknown> {
  if (presets.length === 0) return { ...input };
  const fields = new Set(collection_fields(collection).map((field) => field.name));
  const values = { ...input };
  for (const preset of presets) {
    if (!fields.has(preset.field)) {
      throw new EtHttpError(
        403,
        `The policy preset references the missing field '${preset.field}'.`
      );
    }
    const resolved = resolve_rule_variable(preset.value, principal);
    if (!resolved.ok) {
      throw new EtHttpError(403, resolved.message ?? "The policy preset could not resolve a value.");
    }
    values[preset.field] = resolved.value;
  }
  return values;
}

export function assert_rule_group(
  row: Record<string, unknown>,
  group: CmsRuleGroup,
  principal: CmsPrincipal,
  collection: string,
  label: string
): void {
  if (!row_matches_rule_group(row, group, principal, collection)) {
    throw new EtHttpError(
      403,
      `The ${label} policy for '${collection}' rejected this record.`
    );
  }
}

export function app_access_for_user_level(levelId: number): boolean {
  const role = get_role_by_level_id(levelId);
  return role ? role.app_access : false;
}

/** Account, role, policies, and keys for the signed-in user's profile page. */
export function get_profile_overview(principal: CmsPrincipal): CmsProfileOverview {
  ensure_cms_schema();
  ensure_administrator_schema();
  if (principal.kind !== "user" || principal.user_id === null) {
    throw new EtHttpError(403, "Profile data is only available to signed-in users.");
  }

  const row = sqlite()
    .prepare(
      `SELECT id, username, email, first_name, last_name, title, active, eterc_user_id
         FROM eterc_administrators
        WHERE eterc_user_id = ?
        LIMIT 1`
    )
    .get(principal.user_id) as Row | undefined;
  if (!row) throw new EtHttpError(404, "Your account was not found.");

  const parent = principal.role.parent_role_id
    ? get_role_by_id(principal.role.parent_role_id)
    : null;

  return {
    account: {
      id: Number(row.id),
      username: String(row.username ?? ""),
      email: String(row.email ?? ""),
      first_name: String(row.first_name ?? ""),
      last_name: String(row.last_name ?? ""),
      title: String(row.title ?? ""),
      active: bool(row.active),
      eterc_user_id:
        row.eterc_user_id === null || row.eterc_user_id === undefined
          ? null
          : Number(row.eterc_user_id),
    },
    role: principal.role,
    parent_role_name: parent ? parent.name : null,
    permissions: list_permissions(principal.role.id),
    api_keys: list_api_keys_for_user(principal.user_id),
  };
}

export function get_access_overview(): {
  roles: Array<CmsRole & { user_count: number }>;
  users: CmsUserSummary[];
  api_keys: CmsApiKey[];
  permissions: Record<number, CmsPermission[]>;
  collections: Array<{
    name: string;
    label: string;
    fields: Array<Pick<CmsField, "name" | "label" | "type" | "required" | "hidden" | "readonly">>;
  }>;
} {
  const roles = list_roles();
  const permissions: Record<number, CmsPermission[]> = {};
  for (const role of roles) permissions[role.id] = list_permissions(role.id);
  return {
    roles,
    users: list_users(),
    api_keys: list_api_keys(),
    permissions,
    collections: list_collections({ include_hidden: true }).map((collection) => ({
      name: collection.name,
      label: collection.label || collection.name,
      fields: collection.fields.map((field) => ({
        name: field.name,
        label: field.label || field.name,
        type: field.type,
        required: field.required,
        hidden: field.hidden,
        readonly: field.readonly,
      })),
    })),
  };
}

export function role_collection_matrix(roleId: number): Record<string, Record<CmsPermissionAction, boolean>> {
  const matrix: Record<string, Record<CmsPermissionAction, boolean>> = {};
  for (const permission of list_permissions(roleId)) {
    matrix[permission.collection] ??= {
      read: false,
      create: false,
      update: false,
      delete: false,
    };
    matrix[permission.collection][permission.action] = true;
  }
  return matrix;
}

export function quote_table(name: string): string {
  return quote_identifier(name);
}
