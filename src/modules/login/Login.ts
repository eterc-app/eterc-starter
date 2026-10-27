import type { ReactNode } from "react";
import { Eterc } from "@/engine/controller";
import { BASE_URL, ENV } from "@/engine/config";
import { post } from "@/engine/post";
import {
  current_url_with_query,
  get_last_segment,
  redirect,
  segment,
  site_url,
} from "@/engine/Url";
import { get_context } from "@/engine/request-context";
import { rotate_session_id } from "@/engine/session";
import { EtHttpError } from "@/engine/signals";
import type { Eterc_tokens } from "@/engine/Eterc_tokens";
import { Login_model } from "./Login_model";
import { get_public_login_settings } from "./login-settings";
import Forgot_password from "./forgot_password/Forgot_password";
export default class Login extends Eterc {
  constructor(moduleName?: string | null) {
    super(moduleName);
    this.model = new Login_model("login");
  }

  private loginModel(): Login_model {
    return this.model as Login_model;
  }

  private tokens(): Eterc_tokens {
    return this.eterc_tokens as Eterc_tokens;
  }
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

    // Convenience route: an unambiguous, level-less entry point.
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
    const public_settings = get_public_login_settings();
    const context = get_context();
    const login_error =
      typeof context.query.login_error === "string" ? context.query.login_error : "";
    const signed_out = context.query.signed_out === "1";

    const social_providers = public_settings.providers.map((provider) => ({
      ...provider,
      href: `${site_url(`api/auth/oauth/${provider.id}`)}?level=${encodeURIComponent(
        level_slug
      )}`,
    }));

    const data: Record<string, unknown> = {
      form_location: site_url(`login/submit_login/${level_slug}`),
      user_level_id,
      login_url: level_slug,
      fields: config.fields,
      identifier_label: this.loginModel().get_identifier_label(user_level_id),
      allow_remember: config.allow_remember ?? 0,
      view_module: this.module_name,
      view_file,
      brand: public_settings.brand,
      background: public_settings.background,
      social_providers,
      site_host: new URL(current_url_with_query()).host,
      login_error_message: login_error
        ? LOGIN_ERROR_MESSAGES[login_error] ?? LOGIN_ERROR_MESSAGES.oauth_failed
        : null,
      signed_out,
    };

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
      // Credentials are valid — rotate the session before creating the token
      // so a pre-set session cookie cannot be reused after authentication.
      rotate_session_id();

      const remember = to_boolean(post("remember")) ? 1 : 0;
      const token = this.loginModel().log_user_in(identifier, user_level_id, remember);

      if (token === false) {
        let msg = "Authentication succeeded but token generation failed. ";
        msg += `Ensure the target table has a valid ${config.user_ref_field}.`;
        throw new EtHttpError(500, ENV === "dev" ? msg : "An internal error occurred.");
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
      throw new EtHttpError(403, "This endpoint is only available in development mode.");
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

    // Destroy all tokens and rotate the session so the signed-out browser
    // cannot keep using the previous session identifier.
    this.tokens().destroy();
    rotate_session_id();

    if (redirect_target !== BASE_URL) {
      redirect_target += redirect_target.includes("?") ? "&signed_out=1" : "?signed_out=1";
    }

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
  hash_password(password: string): string {
    if (typeof password !== "string" || password === "") {
      throw new EtHttpError(403, "This method cannot be called directly.");
    }

    return this.loginModel().hash_password(password);
  }

  // -----------------------------------------------------------------
  // Forgot Password (delegates to the child module)
  // -----------------------------------------------------------------
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
  credentials_valid(identifier: string): string | true {
    if (typeof identifier !== "string" || identifier === "") {
      throw new EtHttpError(403, "This method cannot be called directly.");
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
  show_404(): never {
    throw new EtHttpError(404, "Page not found");
  }
}

/** Boolean cast for posted values ('0' and '' are false). */
function to_boolean(value: unknown): boolean {
  if (value === undefined || value === null || value === false) return false;
  if (typeof value === "string") return value !== "" && value !== "0";
  if (typeof value === "number") return value !== 0;
  return Boolean(value);
}

/**
 * Fixed copy for post-redirect OAuth failures. Redirects carry an enum, never
 * arbitrary provider or exception text.
 */
const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  oauth_unavailable: "Social sign-in is not configured for this workspace.",
  oauth_state: "The sign-in request expired. Start again.",
  oauth_denied: "Sign-in was cancelled.",
  oauth_email: "The provider did not return a verified email address.",
  oauth_no_account: "No active account is linked to that provider account.",
  oauth_identity: "That provider account is already linked to another user.",
  oauth_failed: "Sign-in could not be completed. Try again.",
};
