import { admin_login_path } from "@/engine/config";
import { Eterc } from "@/engine/controller";
import { set_flashdata } from "@/engine/Flashdata";
import { get_context } from "@/engine/request-context";
import { EtHttpError } from "@/engine/signals";
import { redirect, site_url } from "@/engine/Url";
import {
  create_api_key,
  create_role,
  create_self_api_key,
  delete_api_key,
  delete_role,
  get_access_overview,
  get_profile_overview,
  list_api_keys,
  list_permissions,
  list_roles,
  list_users,
  replace_permissions,
  require_admin_user,
  require_human_user,
  revoke_api_key,
  revoke_self_api_key,
  set_user_role,
  update_role,
} from "@/modules/cms/cms-access";
import {
  get_public_runtime_config,
  save_cms_settings,
} from "@/modules/cms/cms-runtime";
import {
  add_field,
  create_collection,
  create_record,
  create_starter_collection,
  delete_collection,
  delete_field,
  delete_record,
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

function context() {
  return get_context();
}

function query_string(name: string): string | undefined {
  const value = context().query[name];
  return Array.isArray(value) ? value[0] : value;
}

function body(): Record<string, unknown> {
  const json = context().json;
  if (json && typeof json === "object" && !Array.isArray(json)) {
    return json as Record<string, unknown>;
  }
  const formData = context().formData;
  if (formData) return Object.fromEntries(formData.entries()) as Record<string, unknown>;
  return {};
}

function number_value(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool_value(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return fallback;
}

function text_value(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function object_value(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function array_value<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** Parse an API-key expiry from a date input or Unix-seconds value. */
function expiry_value(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Math.floor(new Date(value).getTime() / 1000);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * Production CMS administration area.
 *
 * This module is the deployable content and access-management surface.
 */
export default class Cms_admin extends Eterc {
  private principal(): CmsPrincipal {
    try {
      return require_admin_user();
    } catch (error) {
      if (error instanceof EtHttpError && error.status === 401) {
        set_flashdata("Please sign in with an administrator account.");
        redirect(admin_login_path());
      }
      throw error;
    }
  }

  private app_principal(): CmsPrincipal {
    try {
      return require_human_user({ requireAppAccess: true });
    } catch (error) {
      if (error instanceof EtHttpError && error.status === 401) {
        set_flashdata("Please sign in to open your profile.");
        redirect(admin_login_path());
      }
      throw error;
    }
  }

  private origin(): string {
    try {
      return new URL(context().url).origin;
    } catch {
      return "";
    }
  }

  private admin_view(
    viewFile: string,
    pageTitle: string,
    data: Record<string, unknown>
  ) {
    return this.templates.admin({
      viewModule: "cms_admin",
      viewFile,
      pageTitle,
      ...data,
    });
  }

  private data_snapshot(collectionName?: string, page = 1, search = ""): Record<string, unknown> {
    const collections = list_collections({ include_hidden: true });
    const selected =
      collections.find((collection) => collection.name === collectionName) ??
      collections[0] ??
      null;
    if (!selected) {
      return {
        collections,
        selected: null,
        fields: [],
        records: [],
        total: 0,
        page: 1,
        pages: 1,
        limit: 20,
        search,
      };
    }
    const result = list_records(selected.name, {
      page,
      limit: 20,
      search: search.trim() || undefined,
      sort: "id",
      direction: "desc",
    });
    return {
      collections,
      selected,
      fields: selected.fields,
      records: result.rows,
      total: result.total,
      page: result.page,
      pages: result.pages,
      limit: result.limit,
      search,
    };
  }

  async index() {
    const principal = this.principal();
    const collections = list_collections({ include_hidden: true });
    const roles = list_roles();
    const users = list_users();
    const keys = list_api_keys();
    const totalRecords = collections.reduce((sum, collection) => sum + collection.item_count, 0);
    return this.admin_view("dashboard", "Content overview", {
      principal,
      collections,
      roles,
      users,
      keys,
      totalRecords,
      apiBase: `${this.origin()}/api/v1/cms`,
      runtime: get_public_runtime_config(),
    });
  }

  async data() {
    const principal = this.principal();
    const snapshot = this.data_snapshot(
      query_string("collection"),
      number_value(query_string("page"), 1),
      query_string("search") ?? ""
    );
    return this.admin_view("data", "Data Studio", {
      principal,
      apiBase: `${this.origin()}/api/v1/cms`,
      create: query_string("new") === "1",
      ...snapshot,
    });
  }

  async access() {
    const principal = this.principal();
    return this.admin_view("access", "Access & API keys", {
      principal,
      overview: get_access_overview(),
      runtime: get_public_runtime_config(),
    });
  }

  async settings() {
    const principal = this.principal();
    return this.admin_view("settings", "Project settings", {
      principal,
      runtime: get_public_runtime_config(),
    });
  }

  // -------------------------------------------------------------------------
  // Data Studio
  // -------------------------------------------------------------------------

  data_state() {
    this.principal();
    const payload = body();
    return this.data_snapshot(
      text_value(payload.collection) || undefined,
      Math.max(1, number_value(payload.page, 1)),
      text_value(payload.search)
    );
  }

  data_collection_create() {
    this.principal();
    const payload = body();
    return create_collection({
      name: text_value(payload.name),
      label: text_value(payload.label) || undefined,
      icon: text_value(payload.icon) || undefined,
      note: text_value(payload.note) || undefined,
      singleton: bool_value(payload.singleton),
      fields: array_value<CmsFieldInput>(payload.fields),
    } as CmsCollectionInput);
  }

  data_collection_update() {
    this.principal();
    const payload = body();
    const name = text_value(payload.name);
    return update_collection(name, {
      label: typeof payload.label === "string" ? payload.label : undefined,
      icon: typeof payload.icon === "string" ? payload.icon : undefined,
      note: typeof payload.note === "string" ? payload.note : undefined,
      singleton:
        typeof payload.singleton === "boolean" ? payload.singleton : undefined,
      hidden: typeof payload.hidden === "boolean" ? payload.hidden : undefined,
    });
  }

  data_collection_delete() {
    this.principal();
    const payload = body();
    delete_collection(text_value(payload.name));
    return { deleted: true };
  }

  data_field_create() {
    this.principal();
    const payload = body();
    return add_field(text_value(payload.collection), payload as unknown as CmsFieldInput);
  }

  data_field_update() {
    this.principal();
    const payload = body();
    return update_field(text_value(payload.collection), text_value(payload.field), {
      label: typeof payload.label === "string" ? payload.label : undefined,
      type: typeof payload.type === "string" ? (payload.type as CmsFieldInput["type"]) : undefined,
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
    });
  }

  data_field_delete() {
    this.principal();
    const payload = body();
    delete_field(text_value(payload.collection), text_value(payload.field));
    return { deleted: true };
  }

  data_record_create() {
    this.principal();
    const payload = body();
    return create_record(text_value(payload.collection), object_value(payload.values));
  }

  data_record_update() {
    this.principal();
    const payload = body();
    return update_record(
      text_value(payload.collection),
      number_value(payload.id),
      object_value(payload.values)
    );
  }

  data_record_delete() {
    this.principal();
    const payload = body();
    delete_record(text_value(payload.collection), number_value(payload.id));
    return { deleted: true };
  }

  data_bootstrap() {
    this.principal();
    return create_starter_collection();
  }

  data_refresh() {
    this.principal();
    refresh_cms_schema();
    return this.data_snapshot();
  }

  // -------------------------------------------------------------------------
  // Access
  // -------------------------------------------------------------------------

  access_state() {
    this.principal();
    return {
      overview: get_access_overview(),
      runtime: get_public_runtime_config(),
    };
  }

  access_role_save() {
    this.principal();
    const payload = body();
    const id = number_value(payload.id);
    const parentRoleId =
      payload.parent_role_id === null ||
      payload.parent_role_id === undefined ||
      payload.parent_role_id === ""
        ? null
        : number_value(payload.parent_role_id);
    const input = {
      name: text_value(payload.name),
      description: text_value(payload.description),
      app_access: bool_value(payload.app_access, true),
      api_access: bool_value(payload.api_access, true),
      admin_access: bool_value(payload.admin_access),
      parent_role_id: parentRoleId,
    };
    return id > 0 ? update_role(id, input) : create_role(input);
  }

  access_role_delete() {
    this.principal();
    delete_role(number_value(body().id));
    return { deleted: true };
  }

  access_permissions_save() {
    this.principal();
    const payload = body();
    return replace_permissions(
      number_value(payload.role_id),
      array_value<CmsPermissionInput>(payload.permissions)
    );
  }

  access_permissions_state() {
    this.principal();
    return list_permissions(number_value(body().role_id));
  }

  access_user_role() {
    this.principal();
    const payload = body();
    return set_user_role(number_value(payload.user_id), number_value(payload.role_id));
  }

  access_key_create() {
    this.principal();
    const payload = body();
    const expiresAt = expiry_value(payload.expires_at);
    const rawUserId = payload.user_id;
    const userId =
      rawUserId === null || rawUserId === undefined || rawUserId === ""
        ? null
        : number_value(rawUserId);
    return create_api_key({
      name: text_value(payload.name),
      roleId: number_value(payload.role_id),
      userId,
      expiresAt,
    });
  }

  access_key_revoke() {
    this.principal();
    revoke_api_key(number_value(body().id));
    return { revoked: true };
  }

  access_key_delete() {
    this.principal();
    delete_api_key(number_value(body().id));
    return { deleted: true };
  }

  // -------------------------------------------------------------------------
  // Self-service profile
  // -------------------------------------------------------------------------

  async profile() {
    const principal = this.app_principal();
    const overview = get_profile_overview(principal);
    return this.admin_view("profile", "Profile & API keys", {
      overview,
      api_base: `${this.origin()}/api/v1/cms`,
      update_password_url: site_url(
        `eterc_administrators/update_password/${overview.account.id}`
      ),
    });
  }

  profile_state() {
    const principal = this.app_principal();
    return {
      overview: get_profile_overview(principal),
      api_base: `${this.origin()}/api/v1/cms`,
    };
  }

  profile_key_create() {
    const principal = this.app_principal();
    const payload = body();
    return create_self_api_key(principal, {
      name: text_value(payload.name),
      expiresAt: expiry_value(payload.expires_at),
    });
  }

  profile_key_revoke() {
    const principal = this.app_principal();
    revoke_self_api_key(principal, number_value(body().id));
    return { revoked: true };
  }

  // -------------------------------------------------------------------------
  // Project settings
  // -------------------------------------------------------------------------

  settings_state() {
    this.principal();
    return { runtime: get_public_runtime_config() };
  }

  settings_save() {
    this.principal();
    const payload = body();
    const cms = object_value(payload.cms);
    save_cms_settings({
      max_page_size: Math.max(
        1,
        Math.min(500, number_value(cms.max_page_size, 200))
      ),
      seed_member_role: bool_value(cms.seed_member_role, true),
    });
    return { runtime: get_public_runtime_config() };
  }

  settings_bootstrap() {
    this.principal();
    return create_starter_collection();
  }

  settings_refresh() {
    this.principal();
    refresh_cms_schema();
    return { refreshed: true };
  }

  async api_reference() {
    redirect(site_url("api-reference"));
  }
}
