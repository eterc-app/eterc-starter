import { api_response, type EtApiResponse } from "@/engine/api";
import { Eterc } from "@/engine/controller";
import { get_context } from "@/engine/request-context";
import { EtHttpError } from "@/engine/signals";
import {
  accessible_collections,
  apply_presets,
  assert_field_access,
  assert_rule_group,
  authorize,
  create_api_key,
  create_role,
  delete_api_key,
  delete_role,
  filter_fields,
  find_permission,
  get_access_overview,
  list_api_keys,
  list_permissions,
  list_roles,
  list_users,
  replace_permissions,
  require_human_admin,
  resolve_principal,
  revoke_api_key,
  row_matches_rule_group,
  rule_group_to_filter,
  set_user_role,
  update_role,
} from "@/modules/cms/cms-access";
import { get_public_runtime_config } from "@/modules/cms/cms-runtime";
import {
  add_field,
  collection_fields,
  create_collection,
  create_record,
  create_starter_collection,
  delete_collection,
  delete_field,
  delete_record,
  format_record_for_api,
  get_collection,
  get_record,
  list_collections,
  list_records,
  update_collection,
  update_field,
  update_record,
} from "@/modules/cms/cms-store";
import { refresh_cms_schema } from "@/modules/cms/cms-schema";
import type {
  CmsCollectionInput,
  CmsFieldInput,
  CmsPermissionInput,
  CmsPrincipal,
} from "@/modules/cms/cms-types";

interface JsonObject {
  [key: string]: unknown;
}

function context() {
  return get_context();
}

function method(): string {
  return String(context().httpMethod ?? "GET").toUpperCase();
}

function params(): string[] {
  return context().segments.slice(2).filter(Boolean);
}

function query_value(name: string): string | undefined {
  const value = context().query[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function body(): JsonObject {
  const json = context().json;
  if (json && typeof json === "object" && !Array.isArray(json)) {
    return json as JsonObject;
  }
  const formData = context().formData;
  if (formData) {
    return Object.fromEntries(formData.entries()) as JsonObject;
  }
  return {};
}

function require_body(allow_empty = false): JsonObject {
  const value = body();
  if (!allow_empty && Object.keys(value).length === 0) {
    throw new EtHttpError(400, "A JSON object body is required.");
  }
  return value;
}

function parse_int(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

function parse_filter(): Record<string, unknown> | undefined {
  const raw = query_value("filter");
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Filter must be a JSON object.");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new EtHttpError(
      400,
      error instanceof Error ? `Invalid filter: ${error.message}` : "Invalid filter."
    );
  }
}

function response_fields(
  principal: CmsPrincipal,
  collection: string,
  fallback: string[]
): string[] {
  if (principal.role.admin_access) return ["*"];
  const read = find_permission(principal.role.id, collection, "read");
  return read ? read.fields : fallback;
}

function filter_row(
  principal: CmsPrincipal,
  collection: string,
  row: Record<string, unknown>,
  fallbackFields: string[] = ["*"]
) {
  return filter_fields(
    response_fields(principal, collection, fallbackFields),
    row,
    get_collection(collection).primary_key
  );
}

function readable_field_names(
  principal: CmsPrincipal,
  collection: string
): Set<string> | null {
  if (principal.role.admin_access) return null;
  const read = find_permission(principal.role.id, collection, "read");
  if (!read || read.fields.includes("*")) return null;
  return new Set([get_collection(collection).primary_key, ...read.fields]);
}

function collection_payload(principal: CmsPrincipal, name: string) {
  const collection = get_collection(name);
  const readable = readable_field_names(principal, name);
  const fields =
    principal.role.admin_access
      ? collection.fields
      : collection.fields.filter(
          (field) =>
            (!field.hidden || field.name === collection.primary_key) &&
            (readable === null || readable.has(field.name))
        );
  return { ...collection, fields };
}

function not_found(): never {
  throw new EtHttpError(404, "Use /api/v1/cms/{resource}/{method}. See /api/openapi for the full reference.");
}

/**
 * Content service API.
 *
 * Examples:
 *   GET    /api/v1/cms/collections
 *   POST   /api/v1/cms/collections
 *   GET    /api/v1/cms/collections/posts
 *   PATCH  /api/v1/cms/collections/posts
 *   DELETE /api/v1/cms/collections/posts
 *   GET    /api/v1/cms/items/posts?limit=25&page=1&sort=id&direction=desc
 *   POST   /api/v1/cms/items/posts
 *   GET    /api/v1/cms/items/posts/1
 *   PATCH  /api/v1/cms/items/posts/1
 *   DELETE /api/v1/cms/items/posts/1
 *
 * Every request is private by default. Send an API key with
 * `Authorization: Bearer etk_...` or sign in and send an EtercToken header.
 */
export default class Cms_api extends Eterc {
  health(): EtApiResponse {
    const principal = resolve_principal();
    return api_response({
      data: {
        status: "ok",
        service: "cms",
        auth: principal.kind,
        role: principal.role.name,
        time: new Date().toISOString(),
      },
    });
  }

  me(): EtApiResponse {
    const principal = resolve_principal();
    return api_response({
      data: {
        kind: principal.kind,
        label: principal.label,
        role: principal.role,
        permissions: list_permissions(principal.role.id),
        collections: accessible_collections(principal),
      },
    });
  }

  collections(): EtApiResponse {
    const principal = resolve_principal();
    const parts = params();
    const verb = method();

    if (parts.length === 0 && verb === "GET") {
      const all = list_collections({ include_hidden: principal.role.admin_access });
      const allowed = new Set(accessible_collections(principal));
      return api_response({
        data: all
          .filter((collection) => allowed.has(collection.name))
          .map((collection) => {
            const readable = readable_field_names(principal, collection.name);
            return {
              name: collection.name,
              label: collection.label,
              icon: collection.icon,
              note: collection.note,
              singleton: collection.singleton,
              item_count: collection.item_count,
              fields: collection.fields
                .filter(
                  (field) =>
                    (!field.hidden || field.name === "id") &&
                    (readable === null || readable.has(field.name))
                )
                .map((field) => ({
                  name: field.name,
                  label: field.label,
                  type: field.type,
                  interface: field.interface,
                  required: field.required,
                  hidden: field.hidden,
                  readonly: field.readonly,
                })),
            };
          }),
      });
    }

    if (parts.length === 0 && verb === "POST") {
      require_human_admin();
      const created = create_collection(require_body() as unknown as CmsCollectionInput);
      return api_response({ data: created }, 201);
    }

    const name = parts[0];
    if (!name) not_found();

    if (verb === "GET") {
      if (!principal.role.admin_access) authorize(principal, name, "read");
      return api_response({ data: collection_payload(principal, name) });
    }
    if (verb === "PATCH" || verb === "PUT") {
      require_human_admin();
      const payload = require_body();
      return api_response({
        data: update_collection(name, {
          label: typeof payload.label === "string" ? payload.label : undefined,
          icon: typeof payload.icon === "string" ? payload.icon : undefined,
          note: typeof payload.note === "string" ? payload.note : undefined,
          singleton: typeof payload.singleton === "boolean" ? payload.singleton : undefined,
          hidden: typeof payload.hidden === "boolean" ? payload.hidden : undefined,
        }),
      });
    }
    if (verb === "DELETE") {
      require_human_admin();
      delete_collection(name);
      return api_response({ data: { deleted: true } });
    }
    not_found();
  }

  fields(): EtApiResponse {
    require_human_admin();
    const parts = params();
    const collection = parts[0];
    if (!collection) not_found();
    const verb = method();

    if (parts.length === 1 && verb === "POST") {
      return api_response(
        { data: add_field(collection, require_body() as unknown as CmsFieldInput) },
        201
      );
    }
    const field = parts[1];
    if (!field) not_found();
    if (verb === "PATCH" || verb === "PUT") {
      const payload = require_body();
      return api_response({
        data: update_field(collection, field, {
          label: typeof payload.label === "string" ? payload.label : undefined,
          type:
            typeof payload.type === "string"
              ? (payload.type as CmsFieldInput["type"])
              : undefined,
          interface:
            typeof payload.interface === "string"
              ? (payload.interface as CmsFieldInput["interface"])
              : undefined,
          options:
            payload.options && typeof payload.options === "object" && !Array.isArray(payload.options)
              ? (payload.options as Record<string, unknown>)
              : undefined,
          required: typeof payload.required === "boolean" ? payload.required : undefined,
          unique: typeof payload.unique === "boolean" ? payload.unique : undefined,
          hidden: typeof payload.hidden === "boolean" ? payload.hidden : undefined,
          readonly: typeof payload.readonly === "boolean" ? payload.readonly : undefined,
        }),
      });
    }
    if (verb === "DELETE") {
      delete_field(collection, field);
      return api_response({ data: { deleted: true } });
    }
    not_found();
  }

  items(): EtApiResponse {
    const principal = resolve_principal();
    const parts = params();
    const collection = parts[0];
    if (!collection) not_found();
    const primaryKey = get_collection(collection).primary_key;
    const id = parts[1] ?? null;
    const verb = method();

    if (verb === "GET" && id === null) {
      const policy = authorize(principal, collection, "read");
      const access_filter = rule_group_to_filter(policy.filter, principal, collection);
      const result = list_records(collection, {
        page: parse_int(query_value("page"), 1),
        limit: parse_int(query_value("limit"), 25),
        sort: query_value("sort"),
        direction: query_value("direction") === "asc" ? "asc" : "desc",
        search: query_value("search"),
        filter: parse_filter(),
        access_filter,
      });
      return api_response({
        data: result.rows
          .map((row) => format_record_for_api(row, collection_fields(collection)))
          .map((row) => filter_fields(policy.fields, row, primaryKey)),
        meta: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          pages: result.pages,
        },
      });
    }

    if (verb === "GET" && id !== null) {
      const policy = authorize(principal, collection, "read");
      const row = format_record_for_api(
        get_record(collection, id),
        collection_fields(collection)
      );
      if (!row_matches_rule_group(row, policy.filter, principal, collection)) {
        throw new EtHttpError(403, "This record is outside the role's read policy.");
      }
      return api_response({ data: filter_fields(policy.fields, row, primaryKey) });
    }

    if (verb === "POST" && id === null) {
      const policy = authorize(principal, collection, "create");
      const payload = require_body(true);
      assert_field_access(principal, collection, "create", payload, policy);
      const values = apply_presets(payload, policy.presets, principal, collection);
      assert_rule_group(values, policy.filter, principal, collection, "create");
      assert_rule_group(values, policy.validation, principal, collection, "field validation");
      const row = create_record(collection, values);
      const formatted = format_record_for_api(row, collection_fields(collection));
      return api_response(
        { data: filter_row(principal, collection, formatted, policy.fields) },
        201
      );
    }

    if ((verb === "PATCH" || verb === "PUT") && id !== null) {
      const policy = authorize(principal, collection, "update");
      const existing = get_record(collection, id);
      if (!row_matches_rule_group(existing, policy.filter, principal, collection)) {
        throw new EtHttpError(403, "This record is outside the role's update policy.");
      }
      const payload = require_body();
      assert_field_access(principal, collection, "update", payload, policy);
      const merged = { ...existing, ...payload };
      assert_rule_group(merged, policy.filter, principal, collection, "update");
      assert_rule_group(merged, policy.validation, principal, collection, "field validation");
      const row = update_record(collection, id, payload);
      const formatted = format_record_for_api(row, collection_fields(collection));
      return api_response({
        data: filter_row(principal, collection, formatted, policy.fields),
      });
    }

    if (verb === "DELETE" && id !== null) {
      const policy = authorize(principal, collection, "delete");
      const existing = get_record(collection, id);
      if (!row_matches_rule_group(existing, policy.filter, principal, collection)) {
        throw new EtHttpError(403, "This record is outside the role's delete policy.");
      }
      delete_record(collection, id);
      return api_response({ data: { deleted: true } });
    }

    not_found();
  }

  roles(): EtApiResponse {
    require_human_admin();
    const parts = params();
    const verb = method();
    if (parts.length === 0 && verb === "GET") {
      return api_response({ data: list_roles() });
    }
    if (parts.length === 0 && verb === "POST") {
      const payload = require_body();
      return api_response(
        {
          data: create_role({
            name: String(payload.name ?? ""),
            description: typeof payload.description === "string" ? payload.description : "",
            app_access: typeof payload.app_access === "boolean" ? payload.app_access : undefined,
            api_access: typeof payload.api_access === "boolean" ? payload.api_access : undefined,
            admin_access: typeof payload.admin_access === "boolean" ? payload.admin_access : undefined,
            parent_role_id:
              payload.parent_role_id === null || payload.parent_role_id === undefined
                ? null
                : Number(payload.parent_role_id),
          }),
        },
        201
      );
    }
    const roleId = Number(parts[0]);
    if (!Number.isFinite(roleId)) not_found();
    if ((verb === "PATCH" || verb === "PUT") && parts.length === 1) {
      const payload = require_body();
      return api_response({
        data: update_role(roleId, {
          name: typeof payload.name === "string" ? payload.name : undefined,
          description:
            typeof payload.description === "string" ? payload.description : undefined,
          app_access: typeof payload.app_access === "boolean" ? payload.app_access : undefined,
          api_access: typeof payload.api_access === "boolean" ? payload.api_access : undefined,
          admin_access: typeof payload.admin_access === "boolean" ? payload.admin_access : undefined,
          parent_role_id:
            payload.parent_role_id === undefined
              ? undefined
              : payload.parent_role_id === null
                ? null
                : Number(payload.parent_role_id),
        }),
      });
    }
    if (verb === "DELETE" && parts.length === 1) {
      delete_role(roleId);
      return api_response({ data: { deleted: true } });
    }
    not_found();
  }

  permissions(): EtApiResponse {
    require_human_admin();
    const parts = params();
    const verb = method();
    const roleId = Number(parts[0] ?? query_value("role_id"));
    if (!Number.isFinite(roleId)) not_found();
    if (verb === "GET") {
      return api_response({ data: list_permissions(roleId) });
    }
    if (verb === "PUT" || verb === "POST") {
      const payload = body();
      const list = Array.isArray(payload.permissions)
        ? (payload.permissions as CmsPermissionInput[])
        : Array.isArray(payload)
          ? (payload as CmsPermissionInput[])
          : [];
      return api_response({ data: replace_permissions(roleId, list) });
    }
    not_found();
  }

  users(): EtApiResponse {
    require_human_admin();
    const parts = params();
    const verb = method();
    if (parts.length === 0 && verb === "GET") {
      return api_response({ data: list_users() });
    }
    const userId = Number(parts[0]);
    if (verb === "PATCH" || verb === "PUT") {
      const payload = require_body();
      return api_response({
        data: set_user_role(userId, Number(payload.role_id)),
      });
    }
    not_found();
  }

  keys(): EtApiResponse {
    require_human_admin();
    const parts = params();
    const verb = method();
    if (parts.length === 0 && verb === "GET") {
      return api_response({ data: list_api_keys() });
    }
    if (parts.length === 0 && verb === "POST") {
      const payload = require_body();
      const expires =
        typeof payload.expires_at === "number"
          ? payload.expires_at
          : typeof payload.expires_at === "string" && payload.expires_at
            ? Math.floor(new Date(payload.expires_at).getTime() / 1000)
            : null;
      return api_response(
        {
          data: create_api_key({
            name: String(payload.name ?? ""),
            roleId: Number(payload.role_id),
            userId: typeof payload.user_id === "number" ? payload.user_id : null,
            expiresAt: expires && Number.isFinite(expires) ? expires : null,
          }),
        },
        201
      );
    }
    const keyId = Number(parts[0]);
    if (!Number.isFinite(keyId)) not_found();
    if (verb === "DELETE") {
      if (query_value("permanent") === "true") delete_api_key(keyId);
      else revoke_api_key(keyId);
      return api_response({ data: { revoked: true } });
    }
    not_found();
  }

  access(): EtApiResponse {
    require_human_admin();
    return api_response({ data: get_access_overview() });
  }

  settings(): EtApiResponse {
    require_human_admin();
    if (method() !== "GET") not_found();
    return api_response({ data: { runtime: get_public_runtime_config() } });
  }

  bootstrap(): EtApiResponse {
    require_human_admin();
    return api_response({ data: create_starter_collection() }, 201);
  }

  refresh(): EtApiResponse {
    require_human_admin();
    refresh_cms_schema();
    return api_response({ data: { refreshed: true } });
  }
}
