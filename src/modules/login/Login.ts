import type { ReactNode } from "react";
import { Trongate } from "@/engine/controller";
import { BASE_URL, ENV } from "@/engine/config";
import { post } from "@/engine/post";
import { get_last_segment, redirect, segment, site_url } from "@/engine/Url";
import { TgHttpError } from "@/engine/signals";
import type { Trongate_tokens } from "@/engine/Trongate_tokens";
import { Login_model } from "./Login_model";
import Forgot_password from "./forgot_password/Forgot_password";

/**
 * Login module — port of modules/login/Login.php.
 *
 * Portable, configurable authentication module. Supports multiple user levels,
 * each with its own target table, field mappings and view file (LOGIN_CONFIG).
 *
 * URL addressing mirrors the PHP original:
 *   /login                       → index() → login()
 *   /login/login/{user_level_id} → login form
 *   POST /login/submit_login/{user_level_id}
 *   /login/not_allowed/{user_level_id}
 *   /login/logout
 *   /login/forgot_password/{user_level_id}       (delegates to the child module)
 *   POST /login/submit_forgot_password/{user_level_id}
 *   /login/reset_password/{token}
 *   POST /login/submit_reset_password
 */
export default class Login extends Trongate {
  constructor(moduleName?: string | null) {
    super(moduleName);
    this.model = new Login_model("login");
  }

  private loginModel(): Login_model {
    return this.model as Login_model;
  }

  private tokens(): Trongate_tokens {
    return this.trongate_tokens as Trongate_tokens;
  }

  /**
   * Determine the target user level from the URL.
   *
   * Scans URL segments for configured secret_login_word values. If any level
   * has a secret configured, only the correct secret word grants access —
   * numeric level IDs alone are rejected. Otherwise the user level ID is
   * extracted from segment(3) as an integer.
   *
   * @param allow_default When true and no level segment is present, fall back
   *   to the only configured level. Used by the forgot-password entry points:
   *   the reset form's "request a new link" href has no level segment (as in
   *   the PHP view), which would otherwise 404 under a secret login word.
   */
  private resolve_level(allow_default = false): number {
    const levels = this.loginModel().get_configured_level_configs();
    const last_segment = get_last_segment();

    // Check if the last URL segment matches a configured secret word.
    for (const [level_id, config] of Object.entries(levels)) {
      if (config.secret_login_word && last_segment === config.secret_login_word) {
        return this.resolve_level_from_secret(levels, Number(level_id));
      }
    }

    // No secret matched — try the numeric segment.
    const level = Number(segment(3, "int"));

    if (level > 0 && levels[level]) {
      // Only reject numeric access if this specific level has a secret.
      if (levels[level].secret_login_word) {
        this.show_404();
      }
      return level;
    }

    // Port convenience: an unambiguous, level-less entry point.
    const level_ids = Object.keys(levels);
    if (allow_default && segment(3) === "" && level_ids.length === 1) {
      return Number(level_ids[0]);
    }

    // No level could be determined.
    this.show_404();
  }

  /**
   * Resolve the level ID when a secret word has been matched.
   *
   * If the last URL segment is a numeric, configured level, that level is
   * used. Otherwise, the matched secret's own level is returned.
   */
  private resolve_level_from_secret(
    levels: Record<number, { secret_login_word?: string }>,
    matched_level: number
  ): number {
    const last = get_last_segment();
    const level = parseInt(last, 10);

    if (level > 0 && levels[level]) {
      return level;
    }

    return matched_level;
  }

  // -----------------------------------------------------------------
  // Login
  // -----------------------------------------------------------------

  /** Default route — shows the login form. */
  async index(): Promise<ReactNode> {
    return this.login();
  }

  /** Display the login form for a given user level. */
  async login(): Promise<ReactNode> {
    // Guard: require a third URL segment to identify the user level.
    if (segment(3) === "") {
      redirect(BASE_URL);
    }

    const user_level_id = this.resolve_level();

    // Redirect if already logged in.
    const token = this.tokens().attempt_get_valid_token(user_level_id);

    if (token !== false) {
      const config = this.loginModel().get_level_config(user_level_id);
      redirect(config.redirect_on_success);
    }

    // Destroy lingering tokens.
    this.tokens().destroy();

    const config = this.loginModel().get_level_config(user_level_id);
    const level_slug = this.loginModel().get_login_url(user_level_id);
    const view_file = config.view_file || "login_default";

    const data: Record<string, unknown> = {
      form_location: site_url(`login/submit_login/${level_slug}`),
      user_level_id,
      login_url: level_slug,
      fields: config.fields,
      identifier_label: this.loginModel().get_identifier_label(user_level_id),
      allow_remember: config.allow_remember ?? 0,
      view_module: this.module_name,
      view_file,
    };

    // Only include the forgot-password URL when enabled for this user level.
    if (config.enable_forgot_password) {
      data.forgot_password_url = `login/forgot_password/${level_slug}`;
    }

    return this.view(`login/${view_file}`, data);
  }

  /** Handle login form submission (POST /login/submit_login/{user_level_id}). */
  async submit_login(): Promise<ReactNode> {
    const user_level_id = this.resolve_level();
    const config = this.loginModel().get_level_config(user_level_id);
    const ident_label = this.loginModel().get_identifier_label(user_level_id).toLowerCase();
    const level_slug = this.loginModel().get_login_url(user_level_id);

    // Rate limiting check (before validation).
    this.loginModel().remove_expired_restrictions(user_level_id);

    const identifier = String(post("identifier", true) ?? "");

    if (!this.loginModel().is_login_allowed(identifier, user_level_id)) {
      redirect(`login/not_allowed/${level_slug}`);
    }

    // Set validation rules with the custom credentials callback.
    await this.validation.set_rules(
      "identifier",
      ident_label,
      "required|callback_credentials_valid"
    );
    await this.validation.set_rules("password", "password", "required");

    if ((await this.validation.run()) === true) {
      // Credentials are valid — log the user in.
      const remember = to_php_bool(post("remember")) ? 1 : 0;
      const token = this.loginModel().log_user_in(identifier, user_level_id, remember);

      if (token === false) {
        let msg = "Authentication succeeded but token generation failed. ";
        msg += `Ensure the target table has a valid ${config.user_ref_field}.`;
        throw new TgHttpError(500, ENV === "dev" ? msg : "An internal error occurred.");
      }

      this.loginModel().clear_failed_attempts(identifier, user_level_id);
      redirect(config.redirect_on_success);
    }

    // Validation failed — record the attempt.
    this.loginModel().record_failed_attempt(identifier, user_level_id);

    // Check if the user is now rate-limited.
    if (!this.loginModel().is_login_allowed(identifier, user_level_id)) {
      redirect(`login/not_allowed/${level_slug}`);
    }

    // Redisplay form with validation errors.
    return this.login();
  }

  /** Display the rate-limited page. */
  async not_allowed(): Promise<ReactNode> {
    const user_level_id = this.resolve_level();
    const block_duration = Number(
      this.loginModel().get_global_config("block_duration") ?? 900
    );

    const data: Record<string, unknown> = {
      block_duration: Math.floor(block_duration / 60),
      user_level_id,
      login_url: this.loginModel().get_login_url(user_level_id),
      view_module: this.module_name,
      view_file: "not_allowed",
    };

    return this.view("login/not_allowed", data);
  }

  /** Unlock all rate-limited users (dev mode only). */
  async unlock(): Promise<string> {
    if (ENV !== "dev") {
      throw new TgHttpError(403, "This endpoint is only available in development mode.");
    }

    this.loginModel().unlock_all();

    return "All rate-limit restrictions have been cleared.";
  }

  /**
   * Log the user out.
   *
   * Determines the correct login URL from the user's current token before
   * destroying it, then redirects to that level's login form. Falls back to
   * the homepage if no token or no matching configured level is found.
   */
  async logout(): Promise<never> {
    const user_obj = this.tokens().get_user_obj();

    let redirect_target = BASE_URL; // Default: homepage.

    if (user_obj !== false) {
      const level_id = Number(user_obj.user_level_id);
      const levels = this.loginModel().get_configured_level_configs();

      if (levels[level_id]) {
        const config = levels[level_id];
        redirect_target = config.secret_login_word
          ? `login/login/${config.secret_login_word}`
          : `login/login/${level_id}`;
      }
    }

    // Destroy all tokens.
    this.tokens().destroy();

    redirect(redirect_target);
  }

  /**
   * Check whether a user is logged in with the given user level.
   *
   * @param user_level_id the level to check, or null for any level.
   * @returns true when logged in, an error message otherwise.
   */
  is_logged_in(user_level_id: number | null = null): true | string {
    const token =
      user_level_id !== null
        ? this.tokens().attempt_get_valid_token(user_level_id)
        : this.tokens().attempt_get_valid_token();

    if (token !== false) {
      return true;
    }

    return "You must be logged in to access this page.";
  }

  /**
   * Hash a plain-text password using the configured bcrypt cost.
   *
   * Thin wrapper around Login_model#hash_password() so other modules can hash
   * passwords with the same algorithm and cost factor as login. Mirrors the
   * PHP original's block_url() protection by refusing direct URL access
   * (URL invocation supplies no argument).
   */
  hash_password(password: string): string {
    if (typeof password !== "string" || password === "") {
      throw new TgHttpError(403, "This method cannot be called directly.");
    }

    return this.loginModel().hash_password(password);
  }

  // -----------------------------------------------------------------
  // Forgot Password (delegates to the child module)
  // -----------------------------------------------------------------

  /** Load the login-forgot_password child module (PHP: $this->module()). */
  private forgotPasswordModule(): Forgot_password {
    return new Forgot_password(this, "login-forgot_password");
  }

  /** Display the forgot password form. */
  async forgot_password(): Promise<ReactNode> {
    const user_level_id = this.resolve_level(true);
    const config = this.loginModel().get_level_config(user_level_id);

    if (!config.enable_forgot_password) {
      this.show_404();
    }

    return this.forgotPasswordModule().form();
  }

  /** Handle forgot password form submission. */
  async submit_forgot_password(): Promise<ReactNode> {
    const user_level_id = this.resolve_level(true);
    const config = this.loginModel().get_level_config(user_level_id);

    if (!config.enable_forgot_password) {
      this.show_404();
    }

    return this.forgotPasswordModule().submit();
  }

  /** Display the reset password form (from the email link). */
  async reset_password(): Promise<ReactNode> {
    // Resolve the level from the reset token to check per-level config.
    const token = String(segment(3) ?? "");
    const user_level_id = this.loginModel().get_level_id_for_token(token);

    if (user_level_id === null) {
      // Invalid token — pass through to the child module for error handling.
      return this.forgotPasswordModule().reset();
    }

    const config = this.loginModel().get_level_config(user_level_id);

    if (!config.enable_forgot_password) {
      this.show_404();
    }

    return this.forgotPasswordModule().reset();
  }

  /** Handle the new password submission (POST /login/submit_reset_password). */
  async submit_reset_password(): Promise<ReactNode> {
    const token = String(post("token", true) ?? "");
    const user_level_id = this.loginModel().get_level_id_for_token(token);

    if (user_level_id === null) {
      // Pass through to the child module — it handles invalid tokens gracefully.
      return this.forgotPasswordModule().submit_reset();
    }

    const config = this.loginModel().get_level_config(user_level_id);

    if (!config.enable_forgot_password) {
      this.show_404();
    }

    return this.forgotPasswordModule().submit_reset();
  }

  // -----------------------------------------------------------------
  // Custom Validation Callback
  // -----------------------------------------------------------------

  /**
   * Custom validation callback that checks credentials against the database.
   *
   * Invoked by the validation service as part of the 'identifier' field rules.
   * Returns true if credentials are valid, or an error message string otherwise.
   * Mirrors the PHP original's block_url() protection: the callback is only
   * ever reached with a non-empty value, so a URL invocation (no argument)
   * is rejected.
   */
  credentials_valid(identifier: string): string | true {
    if (typeof identifier !== "string" || identifier === "") {
      throw new TgHttpError(403, "This method cannot be called directly.");
    }

    const user_level_id = this.resolve_level();
    const password = String(post("password") ?? ""); // Raw — do not clean or trim.

    const valid = this.loginModel().validate_credentials(
      identifier,
      password,
      user_level_id
    );

    if (valid === true) {
      return true;
    }

    return "The [label] and/or password you entered is incorrect.";
  }

  /**
   * Stop processing with the 404 page (PHP: templates->error_404() + die()).
   * The dispatcher renders the ported 404 template for TgHttpError(404).
   */
  show_404(): never {
    throw new TgHttpError(404, "Page not found");
  }
}

/** PHP-style boolean cast for posted values ('0' and '' are false). */
function to_php_bool(value: unknown): boolean {
  if (value === undefined || value === null || value === false) return false;
  if (typeof value === "string") return value !== "" && value !== "0";
  if (typeof value === "number") return value !== 0;
  return Boolean(value);
}
