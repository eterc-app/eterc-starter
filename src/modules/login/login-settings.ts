import * as fs from "node:fs";
import * as path from "node:path";
import { DATA_DIR } from "@/engine/paths";
import type {
  LoginBackgroundSettings,
  LoginBackgroundType,
  LoginBrandSettings,
  LoginProviderId,
  LoginProviderRuntimeSettings,
  LoginProviderSettings,
  LoginPublicProvider,
  LoginPublicSettings,
  LoginRuntimeSettings,
  LoginSettingsFile,
} from "./login-types";

const SETTINGS_FILE = path.join(DATA_DIR, "settings", "login.json");
const SECRETS_FILE = path.join(DATA_DIR, "settings", "login.secrets.json");

export const LOGIN_PROVIDER_LABELS: Record<LoginProviderId, string> = {
  github: "GitHub",
  google: "Google",
};

const PROVIDER_IDS: LoginProviderId[] = ["github", "google"];
const BACKGROUND_TYPES: LoginBackgroundType[] = ["solid", "gradient", "image"];
const COLOR_PATTERN =
  /^(?:#[0-9a-f]{3,8}|rgba?\(\s*[\d.%\s,/]+\)|hsla?\(\s*[\d.%\s,/deg]+\)|oklch\([^)]+\)|[a-z]{3,24})$/i;

export const DEFAULT_LOGIN_SETTINGS: LoginSettingsFile = {
  version: 1,
  brand: {
    name: "Eterc",
    subtitle: "Private CMS workspace",
    logo: "/company-logo.png",
  },
  background: {
    type: "gradient",
    color: "rgb(17 53 93)",
    gradient: {
      from: "rgb(246 242 238)",
      to: "rgb(214 204 197)",
      angle: 135,
    },
    image: "",
    overlay: {
      color: "rgb(14 28 47)",
      opacity: 0.18,
    },
  },
  social: {
    link_by_email: true,
    github: { enabled: false, client_id: "" },
    google: { enabled: false, client_id: "" },
  },
  updated_at: null,
};

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function read_json(file: string): unknown {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function text(value: unknown, fallback: string, max: number): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.slice(0, max);
}

function required_text(value: unknown, fallback: string, max: number): string {
  return text(value, fallback, max) || fallback;
}

function optional_public_path(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return public_path(trimmed, "");
}

function public_path(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 300) return fallback;
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return fallback;
  if (
    trimmed.includes("..") ||
    trimmed.includes("//") ||
    trimmed.includes("\\") ||
    trimmed.includes("\0")
  ) {
    return fallback;
  }
  if (/[\s"'<>?#%]/.test(trimmed)) return fallback;
  return trimmed;
}

function color(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 120 || !COLOR_PATTERN.test(trimmed)) {
    return fallback;
  }
  return trimmed;
}

function number_in_range(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalize_brand(value: unknown): LoginBrandSettings {
  const record = is_record(value) ? value : {};
  return {
    name: required_text(record.name, DEFAULT_LOGIN_SETTINGS.brand.name, 80),
    subtitle: text(record.subtitle, DEFAULT_LOGIN_SETTINGS.brand.subtitle, 140),
    logo: public_path(record.logo, DEFAULT_LOGIN_SETTINGS.brand.logo),
  };
}

function normalize_background(value: unknown): LoginBackgroundSettings {
  const record = is_record(value) ? value : {};
  const gradient = is_record(record.gradient) ? record.gradient : {};
  const overlay = is_record(record.overlay) ? record.overlay : {};
  const type = BACKGROUND_TYPES.includes(record.type as LoginBackgroundType)
    ? (record.type as LoginBackgroundType)
    : DEFAULT_LOGIN_SETTINGS.background.type;

  return {
    type,
    color: color(record.color, DEFAULT_LOGIN_SETTINGS.background.color),
    gradient: {
      from: color(gradient.from, DEFAULT_LOGIN_SETTINGS.background.gradient.from),
      to: color(gradient.to, DEFAULT_LOGIN_SETTINGS.background.gradient.to),
      angle: Math.round(
        number_in_range(
          gradient.angle,
          DEFAULT_LOGIN_SETTINGS.background.gradient.angle,
          0,
          360
        )
      ),
    },
    image: optional_public_path(record.image),
    overlay: {
      color: color(overlay.color, DEFAULT_LOGIN_SETTINGS.background.overlay.color),
      opacity: number_in_range(
        overlay.opacity,
        DEFAULT_LOGIN_SETTINGS.background.overlay.opacity,
        0,
        1
      ),
    },
  };
}

function normalize_provider(value: unknown): LoginProviderSettings {
  const record = is_record(value) ? value : {};
  return {
    enabled: bool(record.enabled, false),
    client_id: text(record.client_id, "", 500),
  };
}

function normalize_settings(value: unknown): LoginSettingsFile {
  const record = is_record(value) ? value : {};
  const social = is_record(record.social) ? record.social : {};

  return {
    version: 1,
    brand: normalize_brand(record.brand),
    background: normalize_background(record.background),
    social: {
      link_by_email: bool(
        social.link_by_email,
        DEFAULT_LOGIN_SETTINGS.social.link_by_email
      ),
      github: normalize_provider(social.github),
      google: normalize_provider(social.google),
    },
    updated_at:
      typeof record.updated_at === "number" && Number.isFinite(record.updated_at)
        ? record.updated_at
        : null,
  };
}

function secret_text(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 2048);
}

function read_secrets(): Record<LoginProviderId, string> {
  const raw = read_json(SECRETS_FILE);
  const record = is_record(raw) ? raw : {};

  return {
    github: secret_text(record.github),
    google: secret_text(record.google),
  };
}

function runtime_provider(
  settings: LoginProviderSettings,
  secret: string
): LoginProviderRuntimeSettings {
  return {
    enabled: settings.enabled,
    client_id: settings.client_id,
    client_secret: secret,
  };
}

/** Server-only settings, including provider client secrets. */
export function get_login_settings(): LoginRuntimeSettings {
  const file = normalize_settings(read_json(SETTINGS_FILE));
  const secrets = read_secrets();

  return {
    version: 1,
    brand: file.brand,
    background: file.background,
    social: {
      link_by_email: file.social.link_by_email,
      github: runtime_provider(file.social.github, secrets.github),
      google: runtime_provider(file.social.google, secrets.google),
    },
    updated_at: file.updated_at,
  };
}

/** Whether a provider has everything needed to start an OAuth transaction. */
export function is_login_provider_configured(
  provider: LoginProviderId,
  settings: LoginRuntimeSettings
): boolean {
  const config = settings.social[provider];
  return Boolean(config.enabled && config.client_id && config.client_secret);
}

/** Safe login configuration for server-rendered login views. */
export function get_public_login_settings(): LoginPublicSettings {
  const settings = get_login_settings();
  const providers: LoginPublicProvider[] = [];

  for (const provider of PROVIDER_IDS) {
    if (is_login_provider_configured(provider, settings)) {
      providers.push({
        id: provider,
        label: LOGIN_PROVIDER_LABELS[provider],
      });
    }
  }

  return {
    brand: settings.brand,
    background: settings.background,
    providers,
  };
}
