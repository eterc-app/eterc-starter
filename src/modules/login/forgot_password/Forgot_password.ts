import type { ReactNode } from "react";
import { post } from "@/engine/post";
import { get_last_segment, redirect, segment, site_url } from "@/engine/Url";
import { set_flashdata } from "@/engine/Flashdata";
import type Login from "../Login";
import type { Login_model } from "../Login_model";
export default class Forgot_password {
  readonly moduleName: string;
  private readonly login: Login;

  constructor(login: Login, moduleName = "login-forgot_password") {
    this.login = login;
    this.moduleName = moduleName;
  }

  /** Reference to the parent module's login model. */
  private model(): Login_model {
    return this.login.model as Login_model;
  }

  // -----------------------------------------------------------------
  // Forgot Password Form
  // -----------------------------------------------------------------

  /** Display the forgot password form. */
  async form(): Promise<ReactNode> {
    const model = this.model();
    const user_level_id = this.resolve_level();
    const level_slug = model.get_login_url(user_level_id);

    const data: Record<string, unknown> = {
      form_location: site_url(`login/submit_forgot_password/${level_slug}`),
      identifier_label: model.get_identifier_label(user_level_id),
      user_level_id,
      login_url: level_slug,
      view_module: "login/forgot_password",
    };

    return this.login.view("login/forgot_password_form", data);
  }

  /** Handle the forgot password form submission. */
  async submit(): Promise<ReactNode> {
    const model = this.model();
    const user_level_id = this.resolve_level();
    const label = model.get_identifier_label(user_level_id);
    const level_slug = model.get_login_url(user_level_id);
    const submitted = String(post("identifier", true) ?? "");

    if (submitted === "") {
      this.set_flashdata(`Please enter your ${label.toLowerCase()}.`);
      redirect(`login/forgot_password/${level_slug}`);
    }

    // Find user by identifier (e.g. username) or email.
    const user = model.find_user_lax(submitted, user_level_id);

    if (user === false) {
      // Don't reveal whether the account exists.
      return this.show_email_sent(user_level_id);
    }

    // Use the first configured identifier column value for the token.
    const ident_columns = model.get_identifier_columns(user_level_id);
    const identifier = String(user[ident_columns[0]] ?? "");

    // Use the email address from the record, or fall back to the submitted value.
    const email =
      typeof user.email === "string" && user.email !== "" ? user.email : submitted;

    // Generate the reset token.
    const token = model.generate_reset_token(identifier, user_level_id);

    if (token === false) {
      // Don't reveal internal errors.
      return this.show_email_sent(user_level_id);
    }

    // Build the reset link and send it to the user's actual email.
    const reset_link = site_url(`login/reset_password/${token}`);
    await model.send_reset_email(email, reset_link);

    return this.show_email_sent(user_level_id);
  }

  /** Show the "email sent" confirmation page. */
  private async show_email_sent(user_level_id: number): Promise<ReactNode> {
    const data: Record<string, unknown> = {
      user_level_id,
      login_url: this.model().get_login_url(user_level_id),
      view_module: "login/forgot_password",
    };

    return this.login.view("login/email_sent", data);
  }

  // -----------------------------------------------------------------
  // Reset Password (from email link)
  // -----------------------------------------------------------------

  /** Display the reset password form (from the email link). */
  async reset(): Promise<ReactNode> {
    const model = this.model();
    const token = String(segment(3) ?? "");

    if (token === "" || token.length !== 64) {
      this.set_flashdata("Invalid or missing reset token.");
      redirect("login");
    }

    const reset = model.validate_reset_token(token);

    const data: Record<string, unknown> = {
      view_module: "login/forgot_password",
    };

    if (reset === false) {
      data.error_message = "This reset link is invalid or has expired.";
      data.token = null;
      data.form_location = "";
      return this.login.view("login/reset_password_form", data);
    }

    data.token = token;
    data.error_message = null;
    data.form_location = site_url("login/submit_reset_password");

    return this.login.view("login/reset_password_form", data);
  }

  /** Handle the new password submission. */
  async submit_reset(): Promise<ReactNode> {
    const model = this.model();
    const token = String(post("token", true) ?? "");
    const password = String(post("password") ?? "");
    const confirm = String(post("confirm_password") ?? "");

    if (token === "" || token.length !== 64) {
      redirect("login");
    }

    const data: Record<string, unknown> = {
      view_module: "login/forgot_password",
    };

    const reset = model.validate_reset_token(token);

    if (reset === false) {
      data.error_message = "This reset link is invalid or has expired. Please request a new one.";
      data.token = null;
      data.form_location = "";
      return this.login.view("login/reset_password_form", data);
    }

    // Validate the password.
    if (password === "" || password.length < 8) {
      data.error_message = "Password must be at least 8 characters long.";
      data.token = token;
      data.form_location = site_url("login/submit_reset_password");
      return this.login.view("login/reset_password_form", data);
    }

    if (password !== confirm) {
      data.error_message = "Passwords do not match.";
      data.token = token;
      data.form_location = site_url("login/submit_reset_password");
      return this.login.view("login/reset_password_form", data);
    }

    const success = model.reset_password(token, password);

    if (success) {
      return this.login.view("login/reset_success", data);
    }

    data.error_message = "Something went wrong. Please try again.";
    data.token = token;
    data.form_location = site_url("login/submit_reset_password");
    return this.login.view("login/reset_password_form", data);
  }

  // -----------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------

  /**
   * Determine the target user level from the URL (child-module flavour: a
   * matched secret word resolves directly to its own level).
   */
  private resolve_level(): number {
    const model = this.model();
    const levels = model.get_configured_level_configs();
    const last_segment = get_last_segment();

    // Check if the last URL segment matches a configured secret word.
    for (const [level_id, config] of Object.entries(levels)) {
      if (config.secret_login_word && last_segment === config.secret_login_word) {
        return Number(level_id);
      }
    }

    // No secret matched — try the numeric segment.
    const level = Number(segment(3, "int"));

    if (level > 0 && levels[level]) {
      // Only reject numeric access if this specific level has a secret.
      if (levels[level].secret_login_word) {
        this.login.show_404();
      }
      return level;
    }

    // Convenience route: the reset form's "request a new link" href has no
    // level segment, so allow an unambiguous single-level fallback.
    const level_ids = Object.keys(levels);
    if (segment(3) === "" && level_ids.length === 1) {
      return Number(level_ids[0]);
    }

    this.login.show_404();
  }

  /** Set a flashdata error message. */
  private set_flashdata(msg: string): void {
    set_flashdata(msg);
  }
}
