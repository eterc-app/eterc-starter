import * as fs from "node:fs";
import * as path from "node:path";
import { DATA_DIR } from "@/engine/paths";
import type {
  CmsRuntimeAuthConfig,
  CmsRuntimeConfig,
  CmsRuntimeDatabaseConfig,
} from "./cms-types";
import {
  AUTH_PROVIDERS,
  DATABASE_PROVIDERS,
  get_auth_provider_definition,
  get_database_provider,
  sanitize_provider_values,
} from "./cms-providers";

const RUNTIME_FILE = path.join(DATA_DIR, "settings", "runtime.json");
const SECRET_SENTINEL = "__stored__";

function defaults(): CmsRuntimeConfig {
  return {
    database: {
      provider: "sqlite",
      label: "SQLite",
      values: { file: "prisma/dev.db" },
      status: "verified",
      message: "Bundled SQLite database.",
      verified_at: null,
    },
    auth: {
      provider: "builtin",
      label: "Built-in accounts",
      values: {},
      status: "verified",
      message: "Email and password accounts are managed by Eterc.",
      verified_at: null,
    },
    cms: {
      api_private: true,
      max_page_size: 200,
      seed_member_role: true,
    },
    updated_at: Math.floor(Date.now() / 1000),
  };
}

function ensure_dir(): void {
  fs.mkdirSync(path.dirname(RUNTIME_FILE), { recursive: true });
}

function read_raw(): CmsRuntimeConfig {
  ensure_dir();
  if (!fs.existsSync(RUNTIME_FILE)) {
    const initial = defaults();
    fs.writeFileSync(RUNTIME_FILE, JSON.stringify(initial, null, 2), "utf8");
    return initial;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(RUNTIME_FILE, "utf8")) as Partial<CmsRuntimeConfig>;
    const base = defaults();
    const database = {
      ...base.database,
      ...(parsed.database ?? {}),
      values: {
        ...base.database.values,
        ...(parsed.database?.values ?? {}),
      },
    };
    const auth = {
      ...base.auth,
      ...(parsed.auth ?? {}),
      values: {
        ...base.auth.values,
        ...(parsed.auth?.values ?? {}),
      },
    };
    const cms = {
      ...base.cms,
      ...(parsed.cms ?? {}),
    };
    return {
      database,
      auth,
      cms,
      updated_at: Number(parsed.updated_at ?? base.updated_at),
    };
  } catch {
    return defaults();
  }
}

function mask_config(config: CmsRuntimeConfig): CmsRuntimeConfig {
  const databaseProvider = get_database_provider(config.database.provider);
  const authProvider = get_auth_provider_definition(config.auth.provider);
  const mask = (
    provider: typeof databaseProvider,
    values: Record<string, string>
  ): Record<string, string> => {
    const result: Record<string, string> = { ...values };
    for (const field of provider.fields) {
      if (field.secret && result[field.key]) {
        result[field.key] = SECRET_SENTINEL;
      }
    }
    return result;
  };
  return {
    ...config,
    database: {
      ...config.database,
      values: mask(databaseProvider, config.database.values),
    },
    auth: {
      ...config.auth,
      values: mask(authProvider, config.auth.values),
    },
  };
}

function merge_secret_values(
  provider: ReturnType<typeof get_database_provider>,
  incoming: Record<string, string> | undefined,
  existing: Record<string, string> | undefined
): Record<string, string> {
  const clean = sanitize_provider_values(provider, incoming);
  for (const field of provider.fields) {
    if (field.secret && clean[field.key] === SECRET_SENTINEL) {
      clean[field.key] = existing?.[field.key] ?? "";
    }
  }
  return clean;
}

export function get_runtime_config(): CmsRuntimeConfig {
  return read_raw();
}

export function get_public_runtime_config(): CmsRuntimeConfig {
  return mask_config(read_raw());
}

export function save_runtime_config(
  patch: Partial<CmsRuntimeConfig>
): CmsRuntimeConfig {
  const current = read_raw();
  const databaseProvider = get_database_provider(
    patch.database?.provider ?? current.database.provider
  );
  const authProvider = get_auth_provider_definition(
    patch.auth?.provider ?? current.auth.provider
  );

  const nextDatabase: CmsRuntimeDatabaseConfig = {
    provider: databaseProvider.id,
    label: databaseProvider.name,
    values: merge_secret_values(
      databaseProvider,
      patch.database?.values ?? current.database.values,
      current.database.values
    ),
    status: patch.database?.status ?? current.database.status,
    message: patch.database?.message ?? current.database.message,
    verified_at: patch.database?.verified_at ?? current.database.verified_at ?? null,
  };

  const nextAuth: CmsRuntimeAuthConfig = {
    provider: authProvider.id,
    label: authProvider.name,
    values: merge_secret_values(
      authProvider,
      patch.auth?.values ?? current.auth.values,
      current.auth.values
    ),
    status: patch.auth?.status ?? current.auth.status,
    message: patch.auth?.message ?? current.auth.message,
    verified_at: patch.auth?.verified_at ?? current.auth.verified_at ?? null,
  };

  const next: CmsRuntimeConfig = {
    database: nextDatabase,
    auth: nextAuth,
    cms: {
      ...current.cms,
      ...(patch.cms ?? {}),
      api_private: true,
    },
    updated_at: Math.floor(Date.now() / 1000),
  };

  ensure_dir();
  fs.writeFileSync(RUNTIME_FILE, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function set_database_status(
  provider: string,
  status: CmsRuntimeConfig["database"]["status"],
  message: string
): CmsRuntimeConfig {
  return save_runtime_config({
    database: {
      provider,
      values: get_runtime_config().database.values,
      status,
      message,
      verified_at: status === "verified" ? Math.floor(Date.now() / 1000) : null,
    },
  });
}

export function set_auth_status(
  provider: string,
  status: CmsRuntimeConfig["auth"]["status"],
  message: string
): CmsRuntimeConfig {
  return save_runtime_config({
    auth: {
      provider,
      values: get_runtime_config().auth.values,
      status,
      message,
      verified_at: status === "verified" ? Math.floor(Date.now() / 1000) : null,
    },
  });
}

export function get_database_config(): CmsRuntimeDatabaseConfig {
  return read_raw().database;
}

export function get_auth_config(): CmsRuntimeAuthConfig {
  return read_raw().auth;
}

export function provider_catalog(): {
  databases: typeof DATABASE_PROVIDERS;
  auth: typeof AUTH_PROVIDERS;
} {
  return {
    databases: DATABASE_PROVIDERS,
    auth: AUTH_PROVIDERS,
  };
}

export function write_env_preview(values: Record<string, string>): void {
  ensure_dir();
  const envPath = path.join(process.cwd(), ".env");
  let existing = "";
  if (fs.existsSync(envPath)) existing = fs.readFileSync(envPath, "utf8");
  const lines = existing.split(/\r?\n/);
  const managed = new Set(Object.keys(values));
  const kept = lines.filter((line) => {
    const key = line.split("=")[0]?.trim();
    return !key || !managed.has(key);
  });
  const appended = Object.entries(values)
    .filter(([, value]) => value !== "")
    .map(([key, value]) => `${key}=${value}`);
  fs.writeFileSync(envPath, [...kept.filter((line) => line !== ""), ...appended].join("\n") + "\n", "utf8");
}

export { SECRET_SENTINEL };
