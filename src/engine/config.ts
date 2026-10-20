/**
 * Eterc - framework configuration.
 *
 * Mirrors: config/config.php, config/site_owner.php and parts of
 * config/login.php + config/trongate_email.php from the PHP original.
 */

/** Base URL prefix. On Next.js the app is served from the site root. */
export const BASE_URL = process.env.TG_BASE_URL ?? "/";

/** Environment: 'dev' or 'production'. Mirrors config.php ENV. */
export const ENV = process.env.NODE_ENV === "production" ? "production" : "dev";

/** Default module when no module segment is present. */
export const DEFAULT_MODULE = "setup";

/** Default method when no method segment is present. */
export const DEFAULT_METHOD = "index";

/** Legacy asset trigger for module assets (kept for URL compatibility). */
export const MODULE_ASSETS_TRIGGER = "_module";

/** 404 handler in "module/method" form. */
export const ERROR_404 = "templates/error_404";

// ---------------------------------------------------------------------------
// Site owner settings (config/site_owner.php)
// ---------------------------------------------------------------------------

export const WEBSITE_NAME = "Eterc";
export const OUR_NAME = "Your Company Name";
export const OUR_TELNUM = "";
export const OUR_ADDRESS = "";
export const OUR_EMAIL_ADDRESS = "";

// ---------------------------------------------------------------------------
// Public Eterc URLs
// ---------------------------------------------------------------------------
//
// The original Trongate app linked to https://trongate.io. Eterc keeps the
// same information architecture but uses the eterc.app domain:
//
//   https://trongate.io                    -> https://www.eterc.app
//   https://trongate.io/documentation      -> https://eterc-docs.eterc.app
//   https://trongate.io/forums...          -> https://eterc-forum.eterc.app
//   https://trongate.io/ (API base)        -> https://eterc-api.eterc.app/
//
// Keep every outbound project link in one place so a future domain change is
// a one-file edit.

export const ETERC_HOME_URL = "https://www.eterc.app";
export const ETERC_DOCS_URL = "https://eterc-docs.eterc.app";
export const ETERC_FORUM_URL = "https://eterc-forum.eterc.app";
export const ETERC_API_URL = "https://eterc-api.eterc.app/";
export const ETERC_GITHUB_URL = "https://github.com/etercjs/eterc";

// ---------------------------------------------------------------------------
// Flashdata rendering wrappers (config/config.php: FLASHDATA_OPEN/CLOSE)
// ---------------------------------------------------------------------------

export const FLASHDATA_OPEN = "";
export const FLASHDATA_CLOSE = "";

// ---------------------------------------------------------------------------
// Login configuration (config/login.php)
// ---------------------------------------------------------------------------

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
      target_table: "trongate_administrators",
      user_ref_field: "trongate_user_id",
      secret_login_word: "tg-admin",
      redirect_on_success: "trongate_administrators/manage",
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

// ---------------------------------------------------------------------------
// Email configuration (config/trongate_email.php) — env driven in the port.
// ---------------------------------------------------------------------------

export const EMAIL_CONFIG = {
  smtp_host: process.env.TG_SMTP_HOST ?? "",
  smtp_port: Number(process.env.TG_SMTP_PORT ?? 465),
  smtp_user: process.env.TG_SMTP_USER ?? "",
  smtp_pass: process.env.TG_SMTP_PASS ?? "",
  smtp_secure: (process.env.TG_SMTP_SECURE ?? "ssl") as "ssl" | "tls" | "",
  smtp_from_name: process.env.TG_SMTP_FROM_NAME ?? "Eterc Support",
};

// ---------------------------------------------------------------------------
// Routing: custom routes and interceptors (config/custom_routing.php)
// ---------------------------------------------------------------------------

export type CustomRoutes = Record<string, string>;
export const CUSTOM_ROUTES: CustomRoutes = {};

export type Interceptors = Record<string, string>;
export const INTERCEPTORS: Interceptors = {};

// ---------------------------------------------------------------------------
// Cookies / session
// ---------------------------------------------------------------------------

export const SESSION_COOKIE = "tg_session";
export const CSRF_COOKIE = "tg_csrf";
export const CSRF_HEADER = "x-tg-csrf";
export const CSRF_FIELD = "csrf_token";
export const FLASH_COOKIE = "tg_flash";
export const FLASH_HEADER = "x-tg-flash";
export const AUTH_TOKEN_COOKIE = "trongatetoken";
export const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days
