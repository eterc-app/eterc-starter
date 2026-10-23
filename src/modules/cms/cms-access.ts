import * as crypto from "node:crypto";
import { sqlite, type Row } from "@/engine/db";
import { Eterc_tokens, type EtercUserObj } from "@/engine/Eterc_tokens";
import { get_context } from "@/engine/request-context";
import { EtHttpError } from "@/engine/signals";
import { ensure_cms_schema, make_slug, quote_identifier } from "./cms-schema";
import { list_collections } from "./cms-store";
import {
  CMS_ACTIONS,
  type CmsApiKey,
  type CmsApiKeyWithSecret,
  type CmsPermission,
  type CmsPermissionAction,
  type CmsPermissionInput,
  type CmsPrincipal,
  type CmsRole,
  type CmsUserSummary,
} from "./cms-types";

const ADMIN_LEVEL_ID = 1;

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

  const now = nowSeconds();
  const levelResult = sqlite()
    .prepare("INSERT INTO eterc_user_levels (level_title) VALUES (?)")
    .run(name);
  const levelId = Number(levelResult.lastInsertRowid);
  const result = sqlite()
    .prepare(
      `INSERT INTO eterc_roles
        (user_level_id, name, slug, description, app_access, api_access, admin_access, is_system, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
    )
    .run(
      levelId,
      name,
      slug,
      String(input.description ?? ""),
      input.app_access === false ? 0 : 1,
      input.api_access === false ? 0 : 1,
      input.admin_access ? 1 : 0,
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

  sqlite()
    .prepare(
      `UPDATE eterc_roles
       SET name = ?, slug = ?, description = ?, app_access = ?, api_access = ?, admin_access = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(
      name,
      slug,
      patch.description ?? role.description,
      appAccess ? 1 : 0,
      apiAccess ? 1 : 0,
      adminAccess ? 1 : 0,
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
        (role_id, collection, action, fields, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
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
      const fields = Array.isArray(permission.fields)
        ? permission.fields.map(String).filter(Boolean)
        : [];
      insert.run(
        roleId,
        collection,
        permission.action,
        JSON.stringify(fields),
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
  if (input.enabled) {
    const now = nowSeconds();
    sqlite()
      .prepare(
        `INSERT INTO eterc_permissions
          (role_id, collection, action, fields, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(role_id, collection, action)
         DO UPDATE SET fields = excluded.fields, updated_at = excluded.updated_at`
      )
      .run(
        roleId,
        collection,
        input.action,
        JSON.stringify(input.fields ?? []),
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
      `SELECT k.*, COALESCE(r.name, '') AS role_name
       FROM eterc_api_keys k
       LEFT JOIN eterc_roles r ON r.id = k.role_id
       ORDER BY k.created_at DESC, k.id DESC`
    )
    .all() as Row[];
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
      input.userId ?? null,
      input.expiresAt ?? null,
      now
    );
  const row = sqlite()
    .prepare(
      `SELECT k.*, COALESCE(r.name, '') AS role_name
       FROM eterc_api_keys k LEFT JOIN eterc_roles r ON r.id = k.role_id
       WHERE k.id = ?`
    )
    .get(result.lastInsertRowid) as Row;
  return { ...apiKeyFromRow(row), secret: raw };
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
      `SELECT k.*, COALESCE(r.name, '') AS role_name
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
    user_id: null,
    api_key_id: Number(row.id),
    label: String(row.name ?? "API key"),
  };
}

function principal_from_user(user: EtercUserObj): CmsPrincipal {
  const role = get_role_by_level_id(Number(user.user_level_id));
  if (!role) {
    throw new EtHttpError(403, "Your account has no role assigned.");
  }
  return {
    kind: "user",
    role,
    user_id: Number(user.eterc_user_id),
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

/** Schema, role and API-key management require a signed-in administrator. */
export function require_human_admin(): CmsPrincipal {
  const principal = require_admin_user();
  if (principal.kind !== "user") {
    throw new EtHttpError(403, "API keys cannot manage the project schema or access control.");
  }
  return principal;
}

export function authorize(
  principal: CmsPrincipal,
  collection: string,
  action: CmsPermissionAction
): string[] {
  if (principal.role.admin_access) return [];
  const permission = sqlite()
    .prepare(
      `SELECT * FROM eterc_permissions
       WHERE role_id = ? AND (collection = ? OR collection = '*') AND action = ?
       ORDER BY CASE WHEN collection = '*' THEN 1 ELSE 0 END
       LIMIT 1`
    )
    .get(principal.role.id, collection, action) as Row | undefined;
  if (!permission) {
    throw new EtHttpError(
      403,
      `The role '${principal.role.name}' cannot ${action} '${collection}'.`
    );
  }
  return permissionFromRow(permission).fields;
}

export function can_use_collection(
  principal: CmsPrincipal,
  collection: string
): boolean {
  if (principal.role.admin_access) return true;
  const row = sqlite()
    .prepare(
      `SELECT id FROM eterc_permissions
       WHERE role_id = ? AND (collection = ? OR collection = '*')
       LIMIT 1`
    )
    .get(principal.role.id, collection) as { id: number } | undefined;
  return row !== undefined;
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
  if (fields.length === 0) return row;
  const allowed = new Set(["id", ...fields]);
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => allowed.has(key))
  );
}

export function assert_field_access(
  principal: CmsPrincipal,
  collection: string,
  action: CmsPermissionAction,
  input: Record<string, unknown>
): void {
  const fields = authorize(principal, collection, action);
  if (fields.length === 0) return;
  const allowed = new Set(fields);
  for (const key of Object.keys(input)) {
    if (key === "id") continue;
    if (!allowed.has(key)) {
      throw new EtHttpError(
        403,
        `The role '${principal.role.name}' cannot write the field '${key}'.`
      );
    }
  }
}

export function app_access_for_user_level(levelId: number): boolean {
  const role = get_role_by_level_id(levelId);
  return role ? role.app_access : false;
}

export function get_access_overview(): {
  roles: Array<CmsRole & { user_count: number }>;
  users: CmsUserSummary[];
  api_keys: CmsApiKey[];
  permissions: Record<number, CmsPermission[]>;
  collections: Array<{ name: string; label: string }>;
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
