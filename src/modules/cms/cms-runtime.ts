import * as fs from "node:fs";
import * as path from "node:path";
import { DATA_DIR } from "@/engine/paths";
import type { CmsRuntimeConfig } from "./cms-types";

const RUNTIME_FILE = path.join(DATA_DIR, "settings", "runtime.json");

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
    const parsed = JSON.parse(
      fs.readFileSync(RUNTIME_FILE, "utf8")
    ) as Partial<CmsRuntimeConfig>;
    const base = defaults();
    return {
      database: {
        ...base.database,
        ...(parsed.database ?? {}),
        values: {
          ...base.database.values,
          ...(parsed.database?.values ?? {}),
        },
      },
      auth: {
        ...base.auth,
        ...(parsed.auth ?? {}),
        values: {
          ...base.auth.values,
          ...(parsed.auth?.values ?? {}),
        },
      },
      cms: {
        ...base.cms,
        ...(parsed.cms ?? {}),
        api_private: true,
      },
      updated_at: Number(parsed.updated_at ?? base.updated_at),
    };
  } catch {
    return defaults();
  }
}

/** Full runtime configuration for server-side consumers. */
export function get_runtime_config(): CmsRuntimeConfig {
  return read_raw();
}

/**
 * Runtime details for the admin UI. Provider values may contain secrets, so
 * only the provider identity and status are exposed.
 */
export function get_public_runtime_config(): CmsRuntimeConfig {
  const config = read_raw();
  return {
    ...config,
    database: { ...config.database, values: {} },
    auth: { ...config.auth, values: {} },
  };
}

/**
 * Persist CMS defaults. Database and auth providers are configured by the
 * desktop onboarding flow and are never changed from the web admin.
 */
export function save_cms_settings(
  patch: Partial<CmsRuntimeConfig["cms"]>
): CmsRuntimeConfig {
  const current = read_raw();
  const requestedPageSize = Number(
    patch.max_page_size ?? current.cms.max_page_size
  );
  const maxPageSize = Number.isFinite(requestedPageSize)
    ? Math.max(1, Math.min(500, requestedPageSize))
    : current.cms.max_page_size;
  const next: CmsRuntimeConfig = {
    ...current,
    cms: {
      ...current.cms,
      ...patch,
      api_private: true,
      max_page_size: maxPageSize,
      seed_member_role:
        patch.seed_member_role ?? current.cms.seed_member_role,
    },
    updated_at: Math.floor(Date.now() / 1000),
  };
  ensure_dir();
  fs.writeFileSync(RUNTIME_FILE, JSON.stringify(next, null, 2), "utf8");
  return next;
}
