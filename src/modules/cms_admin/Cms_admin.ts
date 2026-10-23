import { Eterc } from "@/engine/controller";
import { ENV } from "@/engine/config";
import { set_flashdata } from "@/engine/Flashdata";
import { get_context } from "@/engine/request-context";
import { EtHttpError } from "@/engine/signals";
import { redirect, site_url } from "@/engine/Url";
import {
  create_api_key,
  create_role,
  delete_api_key,
  delete_role,
  get_access_overview,
  list_api_keys,
  list_permissions,
  list_roles,
  list_users,
  replace_permissions,
  require_admin_user,
  revoke_api_key,
  set_user_role,
  update_role,
} from "@/modules/cms/cms-access";
import {
  get_public_runtime_config,
  provider_catalog,
  save_runtime_config,
  write_env_preview,
} from "@/modules/cms/cms-runtime";
import {
  env_preview,
  test_auth_connection,
  test_database_connection,
} from "@/modules/cms/cms-providers";
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

function status_value(value: unknown): "unconfigured" | "verified" | "error" {
  return value === "verified" || value === "error" ? value : "unconfigured";
}

/**
 * Production-ready CMS administration area.
 *
 * The original control panel remains the development-only builder workspace.
 * This module is the deployable content and access-management surface.
 */
export default class Cms_admin extends Eterc {
  private principal(): CmsPrincipal {
    try {
      return require_admin_user();
    } catch (error) {
      if (error instanceof EtHttpError && error.status === 401) {
        set_flashdata("Please sign in with an administrator account.");
        redirect("login/login");
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
    const runtime = get_public_runtime_config();
    return this.admin_view("settings", "Project settings", {
      principal,
      runtime,
      providers: provider_catalog(),
      envPreview: env_preview(runtime.database, runtime.auth),
      allowEnvWrite: ENV === "dev" || process.env.ET_ALLOW_ENV_WRITE === "1",
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
    const input = {
      name: text_value(payload.name),
      description: text_value(payload.description),
      app_access: bool_value(payload.app_access, true),
      api_access: bool_value(payload.api_access, true),
      admin_access: bool_value(payload.admin_access),
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
    const rawExpiry = payload.expires_at;
    let expiresAt: number | null = null;
    if (typeof rawExpiry === "number" && Number.isFinite(rawExpiry)) {
      expiresAt = rawExpiry;
    } else if (typeof rawExpiry === "string" && rawExpiry.trim() !== "") {
      const parsed = Math.floor(new Date(rawExpiry).getTime() / 1000);
      if (Number.isFinite(parsed)) expiresAt = parsed;
    }
    return create_api_key({
      name: text_value(payload.name),
      roleId: number_value(payload.role_id),
      userId: payload.user_id === undefined ? null : number_value(payload.user_id),
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
  // Project settings
  // -------------------------------------------------------------------------

  settings_state() {
    this.principal();
    const runtime = get_public_runtime_config();
    return {
      runtime,
      providers: provider_catalog(),
      envPreview: env_preview(runtime.database, runtime.auth),
      allowEnvWrite: ENV === "dev" || process.env.ET_ALLOW_ENV_WRITE === "1",
    };
  }

  async settings_test() {
    this.principal();
    const payload = body();
    const kind = text_value(payload.kind);
    const provider = text_value(payload.provider);
    const values = Object.fromEntries(
      Object.entries(object_value(payload.values)).map(([key, value]) => [key, String(value ?? "")])
    );
    if (kind === "database") {
      return test_database_connection(provider, values);
    }
    if (kind === "auth") {
      return test_auth_connection(provider, values);
    }
    throw new EtHttpError(400, "Provider kind must be 'database' or 'auth'.");
  }

  settings_save() {
    this.principal();
    const payload = body();
    const database = object_value(payload.database);
    const auth = object_value(payload.auth);
    const cms = object_value(payload.cms);
    const saved = save_runtime_config({
      database: {
        provider: text_value(database.provider, "sqlite"),
        values: Object.fromEntries(
          Object.entries(object_value(database.values)).map(([key, value]) => [
            key,
            String(value ?? ""),
          ])
        ),
        status: status_value(database.status),
        message:
          text_value(database.message) ||
          (status_value(database.status) === "verified"
            ? "Connection verified."
            : "Saved. Run Test connection to verify these settings."),
        verified_at:
          status_value(database.status) === "verified"
            ? number_value(database.verified_at, Math.floor(Date.now() / 1000))
            : null,
      },
      auth: {
        provider: text_value(auth.provider, "builtin"),
        values: Object.fromEntries(
          Object.entries(object_value(auth.values)).map(([key, value]) => [
            key,
            String(value ?? ""),
          ])
        ),
        status: status_value(auth.status),
        message:
          text_value(auth.message) ||
          (status_value(auth.status) === "verified"
            ? "Provider verified."
            : "Saved. Run Test provider to verify these settings."),
        verified_at:
          status_value(auth.status) === "verified"
            ? number_value(auth.verified_at, Math.floor(Date.now() / 1000))
            : null,
      },
      cms: {
        api_private: true,
        max_page_size: Math.max(1, Math.min(500, number_value(cms.max_page_size, 200))),
        seed_member_role: bool_value(cms.seed_member_role, true),
      },
    });
    return {
      runtime: saved,
      envPreview: env_preview(saved.database, saved.auth),
    };
  }

  settings_write_env() {
    this.principal();
    if (!(ENV === "dev" || process.env.ET_ALLOW_ENV_WRITE === "1")) {
      throw new EtHttpError(
        403,
        "Writing .env is disabled in production. Set ET_ALLOW_ENV_WRITE=1 to allow it."
      );
    }
    const runtime = get_public_runtime_config();
    const values = env_preview(runtime.database, runtime.auth);
    write_env_preview(values);
    return { written: true, values };
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
