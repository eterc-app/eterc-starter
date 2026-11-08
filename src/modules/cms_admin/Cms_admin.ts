import { admin_login_path } from "@/engine/config";
import { Eterc } from "@/engine/controller";
import { csrf_token } from "@/engine/csrf";
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
  list_permissions,
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
  reorder_fields,
  create_collection,
  create_record,
  create_starter_collection,
  delete_collection,
  delete_field,
  delete_record,
  get_collection,
  list_collections,
  list_records,
  reorder_records,
  update_collection,
  update_field,
  update_record,
} from "@/modules/cms/cms-store";
import {
  bootstrap_database,
  refresh_cms_schema,
  scan_database_schema,
} from "@/modules/cms/cms-schema";
import type {
  CmsCollectionOrderingMode,
  CmsCollectionSort,
  CmsFieldInput,
  CmsOptionalFieldsConfig,
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

function ordering_mode_value(value: unknown): CmsCollectionOrderingMode | undefined {
  if (value === undefined) return undefined;
  if (value === "default" || value === "manual" || value === "fields") {
    return value;
  }
  throw new EtHttpError(400, "Choose a valid collection ordering mode.");
}

function default_order_value(value: unknown): CmsCollectionSort[] | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value as CmsCollectionSort[];
  throw new EtHttpError(400, "Default ordering must be a list of fields.");
}

/** Preserve UUID/text primary keys while keeping numeric keys numeric. */
function record_id_value(value: unknown): string | number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new EtHttpError(400, "A record id is required.");
  return text;
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

  private data_snapshot(
    collectionName?: string,
    page = 1,
    search = "",
    selectFirst = true
  ): Record<string, unknown> {
    const collections = list_collections({ include_hidden: true });
    const selected =
      collections.find((collection) => collection.name === collectionName) ??
      (selectFirst ? collections[0] : null) ??
      null;
    if (!selected) {
      return {
        collections,
        selected: null,
        fields: [],
        records: [],
        user_labels: {},
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
    });
    const hasUserAuditField = selected.fields.some(
      (field) =>
        field.options?._eterc_system_field === "user_created" ||
        field.options?._eterc_system_field === "user_updated" ||
        field.name === "user_created" ||
        field.name === "user_updated"
    );
    const user_labels = hasUserAuditField
      ? Object.fromEntries(
          list_users()
            .filter((user) => user.eterc_user_id !== null)
            .map((user) => [
              String(user.eterc_user_id),
              user.username || user.email || `User #${user.eterc_user_id}`,
            ])
        )
      : {};
    return {
      collections,
      selected,
      fields: selected.fields,
      records: result.rows,
      user_labels,
      total: result.total,
      page: result.page,
      pages: result.pages,
      limit: result.limit,
      search,
    };
  }

  async index() {
    this.principal();
    redirect("admin/data");
  }

  async content() {
    const principal = this.principal();
    const snapshot = this.data_snapshot(
      query_string("collection"),
      number_value(query_string("page"), 1),
      query_string("search") ?? ""
    );
    return this.admin_view("content", "Content", {
      principal,
      apiBase: `${this.origin()}/api/v1/cms`,
      ...snapshot,
      csrf_token: csrf_token(),
      media_upload_url: "/api/media/upload",
      media_api_root: "/api/xhr/media",
    });
  }

  async data() {
    const principal = this.principal();
    const snapshot = this.data_snapshot(
      query_string("collection"),
      1,
      "",
      false
    );
    return this.admin_view("data", "Data Studio", {
      principal,
      apiBase: `${this.origin()}/api/v1/cms`,
      ...snapshot,
      csrf_token: csrf_token(),
      media_upload_url: "/api/media/upload",
      media_api_root: "/api/xhr/media",
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
      collections: list_collections({ include_hidden: true }),
      runtime: get_public_runtime_config(),
    });
  }

  async appearance() {
    const principal = this.principal();
    return this.admin_view("appearance", "Appearance", { principal });
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
      text_value(payload.search),
      false
    );
  }

  data_collection_create() {
    this.principal();
    const payload = body();
    return create_collection({
      name: text_value(payload.name),
      label: text_value(payload.label) || undefined,
      icon: text_value(payload.icon) || undefined,
      color: text_value(payload.color) || undefined,
      display_template: text_value(payload.display_template) || undefined,
      ordering_mode: ordering_mode_value(payload.ordering_mode),
      default_order: default_order_value(payload.default_order),
      note: text_value(payload.note) || undefined,
      singleton: bool_value(payload.singleton),
      hidden: bool_value(payload.hidden),
      primary_key: text_value(payload.primary_key) || undefined,
      primary_key_type:
        payload.primary_key_type === "uuid" ||
        payload.primary_key_type === "string" ||
        payload.primary_key_type === "bigInteger"
          ? payload.primary_key_type
          : "integer",
      fields: array_value<CmsFieldInput>(payload.fields),
      optional_fields:
        payload.optional_fields && typeof payload.optional_fields === "object"
          ? (payload.optional_fields as CmsOptionalFieldsConfig)
          : undefined,
    });
  }

  data_collection_update() {
    this.principal();
    const payload = body();
    const name = text_value(payload.name);
    return update_collection(name, {
      label: typeof payload.label === "string" ? payload.label : undefined,
      icon: typeof payload.icon === "string" ? payload.icon : undefined,
      color: typeof payload.color === "string" ? payload.color : undefined,
      display_template:
        typeof payload.display_template === "string"
          ? payload.display_template
          : undefined,
      ordering_mode: ordering_mode_value(payload.ordering_mode),
      default_order: default_order_value(payload.default_order),
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

  data_field_add() {
    this.principal();
    const payload = body();
    return add_field(text_value(payload.collection), payload as unknown as CmsFieldInput);
  }

  data_field_update() {
    this.principal();
    const payload = body();
    return update_field(
      text_value(payload.collection),
      text_value(payload.field) || text_value(payload.name),
      {
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
        group:
          payload.group === null || typeof payload.group === "string"
            ? (payload.group as string | null)
            : undefined,
      }
    );
  }

  data_fields_reorder() {
    this.principal();
    const payload = body();
    return reorder_fields(
      text_value(payload.collection),
      array_value<string>(payload.fields).map(String)
    );
  }

  data_records_reorder() {
    this.principal();
    const payload = body();
    const page = number_value(payload.page, 0);
    const recordIds = array_value<string | number>(payload.record_ids);
    if (recordIds.some((id) => typeof id !== "string" && typeof id !== "number")) {
      throw new EtHttpError(400, "The ordered record ids are invalid.");
    }
    const collection = text_value(payload.collection);
    const { limit } = list_records(collection, { page, limit: 20 });
    reorder_records(collection, page, recordIds, limit);
    return { reordered: true };
  }

  data_field_delete() {
    this.principal();
    const payload = body();
    delete_field(
      text_value(payload.collection),
      text_value(payload.field) || text_value(payload.name)
    );
    return { deleted: true };
  }

  /**
   * Return a small page of items for relation, dropdown and builder pickers.
   * The admin UI uses this instead of exposing the private CMS API to the browser.
   */
  data_relation_options() {
    this.principal();
    const payload = body();
    const collectionName = text_value(payload.collection);
    if (!collectionName) {
      throw new EtHttpError(400, "Choose a related collection first.");
    }
    const collection = get_collection(collectionName);
    const limit = Math.min(50, Math.max(1, number_value(payload.limit, 25)));
    const sortField = collection.fields.find(
      (field) =>
        field.options._eterc_system_field === "sort" ||
        (field.name === "sort" &&
          field.type === "integer" &&
          field.interface === "number")
    );
    const usesCollectionOrdering = collection.ordering_mode === "fields";
    const result = list_records(collectionName, {
      page: 1,
      limit,
      search: text_value(payload.search) || undefined,
      sort: usesCollectionOrdering
        ? undefined
        : sortField?.name ?? collection.primary_key,
      direction: usesCollectionOrdering ? undefined : "asc",
    });
    return {
      collection: {
        name: collection.name,
        label: collection.label,
        primary_key: collection.primary_key,
        display_template: collection.display_template,
        fields: collection.fields.filter((field) => field.type !== "alias"),
      },
      rows: result.rows,
      total: result.total,
    };
  }

  data_record_create() {
    const principal = this.principal();
    const payload = body();
    return create_record(
      text_value(payload.collection),
      object_value(payload.values),
      principal.user_id
    );
  }

  data_record_update() {
    const principal = this.principal();
    const payload = body();
    return update_record(
      text_value(payload.collection),
      record_id_value(payload.id),
      object_value(payload.values),
      principal.user_id
    );
  }

  data_record_delete() {
    this.principal();
    const payload = body();
    delete_record(text_value(payload.collection), record_id_value(payload.id));
    return { deleted: true };
  }

  data_bootstrap() {
    this.principal();
    return create_starter_collection();
  }

  data_bootstrap_scan() {
    this.principal();
    return scan_database_schema();
  }

  data_bootstrap_apply() {
    this.principal();
    return bootstrap_database();
  }

  data_refresh() {
    this.principal();
    refresh_cms_schema();
    const payload = body();
    return this.data_snapshot(text_value(payload.collection) || undefined, 1, "", false);
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
    return {
      runtime: get_public_runtime_config(),
      collections: list_collections({ include_hidden: true }),
    };
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
