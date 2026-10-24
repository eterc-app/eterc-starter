
/** Base URL prefix. On Next.js the app is served from the site root. */
export const BASE_URL = process.env.ET_BASE_URL ?? "/";
export const ENV = process.env.NODE_ENV === "production" ? "production" : "dev";

/** Default module when no module segment is present. */
export const DEFAULT_MODULE = "setup";

/** Default method when no method segment is present. */
export const DEFAULT_METHOD = "index";

/** Asset trigger for module assets (`<module>_module`). */
export const MODULE_ASSETS_TRIGGER = "_module";

/** 404 handler in "module/method" form. */
export const ERROR_404 = "templates/error_404";


export const WEBSITE_NAME = "Eterc";
export const OUR_NAME = "Your Company Name";
export const OUR_TELNUM = "";
export const OUR_ADDRESS = "";
export const OUR_EMAIL_ADDRESS = "";

// ---------------------------------------------------------------------------
// Public Eterc URLs
// ---------------------------------------------------------------------------
//
// Keep every outbound project link in one place so a future domain change is
// a one-file edit.

export const ETERC_HOME_URL = "https://www.eterc.app";
export const ETERC_DOCS_URL = "https://eterc-docs.eterc.app";
export const ETERC_FORUM_URL = "https://eterc-forum.eterc.app";
export const ETERC_API_URL = "https://eterc-api.eterc.app/";
export const ETERC_GITHUB_URL = "https://github.com/eterc-app/eterc-starter";


export const FLASHDATA_OPEN = "";
export const FLASHDATA_CLOSE = "";


export interface LoginIdentifier {
  column: string;
  label: string;
}

export interface LoginUserLevel {
  target_table: string;
  user_ref_field: string;
  secret_login_word?: string;
  redirect_on_success: string;
  allow_remember: 0 | 1;
  remember_days: number;
  enable_forgot_password: boolean;
  view_file: string;
  fields: {
    identifiers: Record<string, LoginIdentifier>;
    password: { column: string; label: string };
  };
}

export interface LoginConfig {
  default_view_file: string;
  max_failed_attempts: number;
  block_duration: number;
  password_hash_cost: number;
  reset_token_lifespan: number;
  user_levels: Record<number, LoginUserLevel>;
}

export const LOGIN_CONFIG: LoginConfig = {
  default_view_file: "login_default",
  max_failed_attempts: 3,
  block_duration: 900,
  password_hash_cost: 11,
  reset_token_lifespan: 3600,
  user_levels: {
    1: {
      target_table: "eterc_administrators",
      user_ref_field: "eterc_user_id",
      secret_login_word: "et-admin",
      redirect_on_success: "admin",
      allow_remember: 0,
      remember_days: 0,
      enable_forgot_password: false,
      view_file: "login_default",
      fields: {
        identifiers: {
          username: { column: "username", label: "Username" },
          email: { column: "email", label: "Email" },
        },
        password: { column: "password", label: "Password" },
      },
    },
  },
};

/** Canonical login path for the administrator level. */
export function admin_login_path(): string {
  const secret = LOGIN_CONFIG.user_levels[1]?.secret_login_word?.trim();
  return secret ? `login/login/${secret}` : "login/login";
}

export const EMAIL_CONFIG = {
  smtp_host: process.env.ET_SMTP_HOST ?? "",
  smtp_port: Number(process.env.ET_SMTP_PORT ?? 465),
  smtp_user: process.env.ET_SMTP_USER ?? "",
  smtp_pass: process.env.ET_SMTP_PASS ?? "",
  smtp_secure: (process.env.ET_SMTP_SECURE ?? "ssl") as "ssl" | "tls" | "",
  smtp_from_name: process.env.ET_SMTP_FROM_NAME ?? "Eterc Support",
};


export type CustomRoutes = Record<string, string>;
export const CUSTOM_ROUTES: CustomRoutes = {};

export type Interceptors = Record<string, string>;
export const INTERCEPTORS: Interceptors = {};

// ---------------------------------------------------------------------------
// Cookies / session
// ---------------------------------------------------------------------------

export const SESSION_COOKIE = "et_session";
export const CSRF_COOKIE = "et_csrf";
export const CSRF_HEADER = "x-et-csrf";
export const CSRF_FIELD = "csrf_token";
export const FLASH_COOKIE = "et_flash";
export const FLASH_HEADER = "x-et-flash";
export const AUTH_TOKEN_COOKIE = "eterctoken";
export const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days
