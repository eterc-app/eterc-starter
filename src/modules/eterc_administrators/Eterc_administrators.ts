import { Eterc } from "@/engine/controller";
import { admin_login_path, BASE_URL, ENV } from "@/engine/config";
import { set_flashdata } from "@/engine/Flashdata";
import { post } from "@/engine/post";
import { from_eterc_mx, get_context } from "@/engine/request-context";
import { session_get, session_set } from "@/engine/session";
import { EtHttpError } from "@/engine/signals";
import type { EtTemplateData } from "@/engine/Templates";
import type { Eterc_tokens, EtercUserObj } from "@/engine/Eterc_tokens";
import { previous_url, redirect, segment } from "@/engine/Url";
import { list_roles } from "@/modules/cms/cms-access";
import type { Eterc_security } from "@/modules/eterc_security/Eterc_security";
import { Eterc_administrators_model } from "./Eterc_administrators_model";
export default class Eterc_administrators extends Eterc {
  private admin_theme = "";
  private default_limit = 20;
  private per_page_options = [10, 20, 50, 100];
  private dashboard_home = "";

  constructor(moduleName?: string | null) {
    super(moduleName);
    this.dashboard_home = `${this.module_name}/manage`;
    this.model = new Eterc_administrators_model(
      this.module_name || "eterc_administrators"
    );
  }

  private adminModel(): Eterc_administrators_model {
    return this.model as Eterc_administrators_model;
  }
  private tokensService(): Eterc_tokens {
    return (this as unknown as { eterc_tokens: Eterc_tokens })
      .eterc_tokens;
  }
  private securityService(): Eterc_security {
    return (this as unknown as { eterc_security: Eterc_security })
      .eterc_security;
  }


  /**
   * Display form for creating or editing a record.
   */
  async create() {
    this.securityService().make_sure_allowed();

    const update_id = Number(segment(3, "int"));

    const data = this.loadCreateData(update_id);
    if (data === false) {
      return this.not_found();
    }

    return this.templates.admin(this.buildCreateViewData(data, update_id));
  }

  /**
   * Display detailed view of a single record.
   */
  async show() {
    const user_obj = this.securityService().make_sure_allowed();

    const update_id = Number(segment(3, "int"));

    if (update_id === 0) {
      return this.not_found();
    }

    const record_data = this.adminModel().get_data_from_db(update_id);

    if (record_data === false) {
      return this.not_found();
    }

    const logged_in_id = this.loggedInUserId(user_obj);

    const is_own_account = update_id === logged_in_id ? true : false;

    const role_id = this.adminModel().get_role_id_for_admin(update_id);
    const role = role_id > 0 ? this.adminModel().get_role_by_id(role_id) : false;

    const data: EtTemplateData = {
      ...this.adminModel().prepare_for_display({ ...record_data }),
      update_id: update_id,
      role_id: role_id || null,
      role_name: role === false ? "Unassigned" : String(role.name ?? "Unassigned"),
      role_admin_access: role === false ? false : Number(role.admin_access ?? 0) === 1,
      headline: is_own_account ? "Your Account Details" : "Record Details",
      is_own_account: is_own_account,
      back_url: this.getBackUrl(),
      theme: this.admin_theme,
      viewModule: this.module_name,
      viewFile: "show",
    } as EtTemplateData;

    return this.templates.admin(data);
  }

  /**
   * Redirect the signed-in user to the self-service profile.
   */
  async update_your_details() {
    this.securityService().make_sure_allowed();
    redirect("admin/profile");
  }

  /**
   * Display confirmation page before deleting a record.
   */
  async delete_conf() {
    const user_obj = this.securityService().make_sure_allowed();

    const update_id = Number(segment(3, "int"));

    if (update_id === 0) {
      return this.not_found();
    }

    const logged_in_id = this.loggedInUserId(user_obj);

    if (update_id === logged_in_id) {
      set_flashdata("You cannot delete your own account");
      redirect(`${this.module_name}/show/${update_id}`);
    }

    const record_data = this.adminModel().get_data_from_db(update_id);

    if (record_data === false) {
      return this.not_found();
    }

    const data: EtTemplateData = {
      update_id: update_id,
      headline: "Delete Record",
      cancel_url: `${BASE_URL}${this.module_name}/show/${update_id}`,
      form_location: `${BASE_URL}${this.module_name}/submit_delete/${update_id}`,
      theme: this.admin_theme,
      viewModule: this.module_name,
      viewFile: "delete_conf",
    };

    return this.templates.admin(data);
  }

  /**
   * Display password update form.
   */
  async update_password() {
    const user_obj = this.securityService().make_sure_allowed();
    const update_id = Number(segment(3, "int"));

    const record_data = this.adminModel().get_data_from_db(update_id);

    if (record_data === false) {
      return this.not_found();
    }

    const logged_in_id = this.loggedInUserId(user_obj);
    const is_own_account = update_id === logged_in_id ? true : false;

    return this.templates.admin(
      this.buildUpdatePasswordViewData(update_id, is_own_account)
    );
  }

  /**
   * Handle password update form submission.
   */
  async submit_update_password() {
    const user_obj = this.securityService().make_sure_allowed();

    const submit = String(post("submit", true) ?? "");

    if (submit !== "Update Password") {
      const update_id = Number(segment(3, "int"));
      redirect(`${this.module_name}/show/${update_id}`);
    }

    await this.validation.set_rules("password", "password", "required|min_length[12]");
    await this.validation.set_rules(
      "confirm_password",
      "password confirmation",
      "required|matches[password]"
    );

    if ((await this.validation.run()) !== true) {
      const update_id = Number(segment(3, "int"));
      const record_data = this.adminModel().get_data_from_db(update_id);

      if (record_data === false) {
        return this.not_found();
      }

      const logged_in_id = this.loggedInUserId(user_obj);
      const is_own_account = update_id === logged_in_id ? true : false;

      return this.view(
        "eterc_administrators/update_password",
        this.buildUpdatePasswordViewData(update_id, is_own_account)
      );
    }

    const update_id = Number(segment(3, "int"));
    const record_data = this.adminModel().get_data_from_db(update_id);

    if (record_data === false) {
      return this.not_found();
    }

    const password = String(post("password", true) ?? "");
    this.adminModel().update_password(update_id, password);

    // Changing someone else's password must end their existing sessions.
    const logged_in_id = this.loggedInUserId(user_obj);
    if (update_id !== logged_in_id) {
      this.adminModel().revoke_user_sessions(Number(record_data.eterc_user_id ?? 0));
    }

    set_flashdata("Password updated successfully");
    redirect(`${this.module_name}/show/${update_id}`);
  }

  /**
   * Log out the current user and redirect to the login module.
   */
  async logout() {
    this.tokensService().destroy(); // Destroy the authentication token
    redirect("login/logout");
  }

  /**
   * Display 404-style not found page for missing record(s).
   */
  async not_found() {
    const data: EtTemplateData = {
      theme: this.admin_theme,
      headline: "Record Not Found",
      message: "The record you're looking for doesn't exist or has been deleted.",
      back_url: this.getBackUrl(),
      back_label: "Go Back",
      viewModule: this.module_name,
      viewFile: "not_found",
    };

    return this.templates.admin(data);
  }

  /**
   * Handle form submission for creating/updating records.
   */
  async submit() {
    const user_obj = this.securityService().make_sure_allowed();

    const submit = String(post("submit", true) ?? "");

    if (submit !== "Submit") {
      redirect(`${this.module_name}/manage`);
    }

    let update_id = Number(segment(3, "int"));
    const is_update = update_id > 0;
    const password = String(post("password", true) ?? "");

    await this.validation.set_rules(
      "username",
      "username",
      "required|min_length[2]|max_length[50]|callback_username_format_check|callback_username_check"
    );
    await this.validation.set_rules(
      "email",
      "email",
      "required|valid_email|max_length[190]|callback_email_check"
    );
    await this.validation.set_rules("first_name", "first name", "max_length[80]");
    await this.validation.set_rules("last_name", "last name", "max_length[80]");
    await this.validation.set_rules("title", "job title", "max_length[120]");
    await this.validation.set_rules(
      "role_id",
      "role",
      "required|integer|callback_role_check"
    );

    if (!is_update || password !== "") {
      await this.validation.set_rules(
        "password",
        "password",
        "required|min_length[12]|max_length[200]"
      );
      await this.validation.set_rules(
        "confirm_password",
        "password confirmation",
        "required|matches[password]"
      );
    }

    if ((await this.validation.run()) !== true) {
      const data = this.loadCreateData(update_id);

      if (data === false) {
        redirect(`${this.module_name}/manage`);
      }

      return this.view(
        "eterc_administrators/create",
        this.buildCreateViewData(data, update_id)
      );
    }

    // Get raw POST data and convert for the database.
    const post_data = this.adminModel().get_data_from_post();
    const role_id = Number(post_data.role_id ?? 0);
    const db_data = this.adminModel().convert_posted_data_for_db(post_data);

    let flash_msg: string;

    if (is_update) {
      // Verify record exists before updating.
      const existing_record = this.adminModel().get_data_from_db(update_id);
      if (existing_record === false) {
        redirect(`${this.module_name}/manage`);
      }

      const existing_role_id = this.adminModel().get_role_id_for_admin(update_id);
      const existing_role =
        existing_role_id > 0
          ? this.adminModel().get_role_by_id(existing_role_id)
          : false;
      const next_role = this.adminModel().get_role_by_id(role_id);
      const logged_in_id = this.loggedInUserId(user_obj);

      // Do not allow a signed-in administrator to lock themselves out.
      if (update_id === logged_in_id) {
        if (Number(db_data.active ?? 0) !== 1) {
          set_flashdata("You cannot suspend your own account");
          redirect(`${this.module_name}/show/${update_id}`);
        }
        if (next_role === false || Number(next_role.admin_access ?? 0) !== 1) {
          set_flashdata("You cannot remove your own admin access");
          redirect(`${this.module_name}/show/${update_id}`);
        }
      }

      // Keep at least one active account that can open the admin area.
      const was_active_admin =
        Number(existing_record.active ?? 0) === 1 &&
        existing_role !== false &&
        Number(existing_role.admin_access ?? 0) === 1;
      const will_be_active_admin =
        Number(db_data.active ?? 0) === 1 &&
        next_role !== false &&
        Number(next_role.admin_access ?? 0) === 1;

      if (
        was_active_admin &&
        !will_be_active_admin &&
        this.adminModel().count_active_admins() <= 1
      ) {
        set_flashdata("At least one active administrator is required");
        redirect(`${this.module_name}/show/${update_id}`);
      }

      this.adminModel().update_record(
        update_id,
        db_data,
        role_id,
        password !== "" ? password : undefined,
        update_id !== logged_in_id
      );
      flash_msg = "User updated successfully";
    } else {
      update_id = this.adminModel().create_new_record(
        db_data,
        role_id,
        password
      );
      flash_msg = "User created successfully";
    }

    set_flashdata(flash_msg);
    redirect(`${this.module_name}/show/${update_id}`);
  }

  /**
   * Handle record deletion after confirmation.
   */
  async submit_delete() {
    const user_obj = this.securityService().make_sure_allowed();

    const submit = String(post("submit", true) ?? "");

    // Handle non-confirmation immediately.
    if (submit !== "Yes - Delete Now") {
      redirect(`${this.module_name}/manage`);
    }

    const update_id = Number(segment(3, "int"));

    // Handle invalid ID immediately.
    if (update_id === 0) {
      redirect(`${this.module_name}/manage`);
    }

    // Prevent self-deletion.
    const logged_in_id = this.loggedInUserId(user_obj);

    if (update_id === logged_in_id) {
      set_flashdata("You cannot delete your own account");
      redirect(`${this.module_name}/show/${update_id}`);
    }

    // Verify record exists before deleting.
    const record_data = this.adminModel().get_data_from_db(update_id);
    if (record_data === false) {
      redirect(`${this.module_name}/manage`);
    }

    // Perform deletion.
    this.adminModel().delete_record(update_id);
    set_flashdata("The record was successfully deleted");
    redirect(`${this.module_name}/manage`);
  }

  /**
   * Display paginated list of records with per-page selector.
   */
  async manage() {
    this.securityService().make_sure_allowed();

    const limit = this.getLimit();
    const offset = this.getOffset();

    let rows = this.adminModel().get_all_paginated(limit, offset);
    rows = this.adminModel().prepare_records_for_display(rows);
    const total_rows = this.adminModel().count_all();

    const data: EtTemplateData = {
      theme: this.admin_theme,
      rows: rows,
      pagination_data: this.getPaginationData(limit, total_rows),
      per_page_options: this.per_page_options,
      selected_per_page: this.getSelectedPerPage(),
      viewModule: this.module_name,
      viewFile: "manage",
    };

    return this.templates.admin(data);
  }
  make_sure_allowed(): string | null {
    this.assertNotDirectCall("make_sure_allowed");

    let token = this.tokensService().attempt_get_valid_token(1);

    // Handle API/MX requests.
    if (from_eterc_mx() === true && token === false) {
      throw new EtHttpError(401, "");
    }

    // Handle web requests with no valid token.
    if (token === false) {
      if (ENV.toLowerCase() === "dev") {
        // DEV: Auto-login as first active user.
        const user_obj = this.adminModel().get_any_active_user();

        if (user_obj !== false) {
          token = this.adminModel().log_user_in(String(user_obj.username ?? ""), 1);
        } else {
          throw new EtHttpError(500, "No active users found in database");
        }
      } else {
        // PROD: Redirect to login page.
        redirect(admin_login_path());
      }
    }

    return token === false ? null : token;
  }

  /**
   * Set number of records per page for pagination.
   */
  async set_per_page() {
    this.securityService().make_sure_allowed();

    let selected_index = Number(segment(3, "int"));

    if (selected_index < 0 || selected_index >= this.per_page_options.length) {
      selected_index = 1;
    }

    session_set("selected_per_page", selected_index);
    redirect(`${this.module_name}/manage`);
  }

  /**
   * Validates username availability and format for create/update operations.
   *
   * This validation callback ensures that submitted usernames are optional,
   * contain only letters/numbers/underscores and are not already taken by
   * another record. The {label} placeholder in error messages is replaced by
   * the validation library with the appropriate field label.
   */
  username_check(str: string): string | true {
    this.assertNotDirectCall("username_check");

    if (str === "") {
      return true;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(str)) {
      return "The {label} can only contain letters, numbers, and underscores.";
    }

    const update_id = Number(segment(3, "int"));
    const is_available = this.adminModel().is_username_available(str, update_id);

    if (is_available === false) {
      return update_id === 0
        ? "The {label} is already taken. Please choose another."
        : "The {label} is already in use by another account.";
    }

    return true;
  }

  /**
   * Keep usernames portable across URL, API, and CLI surfaces.
   */
  username_format_check(str: string): string | true {
    this.assertNotDirectCall("username_format_check");

    if (!/^[A-Za-z0-9_]+$/.test(str)) {
      return "The {label} may only contain letters, numbers, and underscores.";
    }

    return true;
  }

  /**
   * Validate that an email address is not already used by another account.
   */
  email_check(str: string): string | true {
    this.assertNotDirectCall("email_check");

    if (str === "") {
      return true;
    }

    const update_id = Number(segment(3, "int"));
    const is_available = this.adminModel().is_email_available(str, update_id);

    if (is_available === false) {
      return update_id === 0
        ? "The {label} is already registered. Please use another address."
        : "The {label} is already in use by another account.";
    }

    return true;
  }

  /**
   * Validate that the submitted role exists and has a user level.
   */
  role_check(str: string): string | true {
    this.assertNotDirectCall("role_check");

    const role_id = Number(str);
    if (!Number.isFinite(role_id) || role_id <= 0) {
      return "Choose a role for this account.";
    }

    const role = this.adminModel().get_role_by_id(role_id);
    if (role === false) {
      return "The selected role no longer exists.";
    }

    return true;
  }

  private assertNotDirectCall(method: string): void {
    const ctx = get_context();
    const module_segment = (ctx.segments[0] ?? "").toLowerCase();
    const method_segment = (ctx.segments[1] ?? "").toLowerCase();

    if (
      module_segment === this.module_name.toLowerCase() &&
      method_segment === method.toLowerCase()
    ) {
      throw new EtHttpError(403, "403 Forbidden - Direct URL access not permitted");
    }
  }
  private loggedInUserId(user_obj: EtercUserObj | null): number {
    if (user_obj === null) {
      redirect(admin_login_path());
    }

    const record = this.adminModel().get_user_by_token(user_obj.token);
    return record === false ? 0 : Number(record.id ?? 0);
  }
  private getBackUrl(): string {
    const back_url = previous_url();

    if (
      back_url !== "" &&
      urlPath(back_url).startsWith(`/${this.module_name}/manage`)
    ) {
      return back_url;
    }

    return `${BASE_URL}${this.module_name}/manage`;
  }
  private getLimit(): number {
    const selected = session_get<number>("selected_per_page");

    if (selected !== undefined && this.per_page_options[selected] !== undefined) {
      return this.per_page_options[selected];
    }

    return this.default_limit;
  }
  private getOffset(): number {
    const page_num = Number(segment(3, "int"));
    return page_num > 1 ? (page_num - 1) * this.getLimit() : 0;
  }
  private getPaginationData(limit: number, total_rows: number): Record<string, unknown> {
    const total_pages = limit > 0 ? Math.ceil(total_rows / limit) : 0;
    const requested_page = Number(segment(3, "int"));
    const current_page = Math.max(
      1,
      Math.min(requested_page, Math.max(1, total_pages))
    );

    return {
      total_rows: total_rows,
      page_num_segment: 3,
      limit: limit,
      pagination_root: `${this.module_name}/manage`,
      record_name_plural: "records",
      include_showing_statement: true,
      current_page: current_page,
      total_pages: total_pages,
    };
  }
  private getSelectedPerPage(): number {
    return session_get<number>("selected_per_page") ?? 1;
  }
  private loadCreateData(update_id: number): Record<string, unknown> | false {
    if (update_id > 0) {
      const record = this.adminModel().get_data_from_db(update_id);
      if (record === false) {
        return false;
      }
      return this.adminModel().prepare_for_display({ ...record });
    }

    return this.adminModel().get_data_from_post();
  }
  private buildCreateViewData(
    data: Record<string, unknown>,
    update_id: number
  ): EtTemplateData {
    const roles = list_roles();
    const default_role =
      roles.find((role) => role.is_system) ??
      roles.find((role) => role.admin_access) ??
      roles[0] ??
      null;
    const role_id =
      update_id > 0
        ? this.adminModel().get_role_id_for_admin(update_id)
        : Number(data.role_id ?? 0);
    const selected_role_id = role_id > 0 ? role_id : (default_role?.id ?? 0);

    return {
      ...data,
      roles,
      role_id: selected_role_id,
      headline: update_id > 0 ? "Update user" : "Create user",
      update_id: update_id,
      cancel_url:
        update_id > 0
          ? `${BASE_URL}${this.module_name}/show/${update_id}`
          : `${BASE_URL}${this.module_name}/manage`,
      update_password_url: `${BASE_URL}${this.module_name}/update_password/${update_id}`,
      form_location: `${BASE_URL}${this.module_name}/submit/${update_id}`,
      theme: this.admin_theme,
      viewModule: this.module_name,
      viewFile: "create",
    };
  }
  private buildUpdatePasswordViewData(
    update_id: number,
    is_own_account: boolean
  ): EtTemplateData {
    return {
      update_id: update_id,
      headline: is_own_account ? "Update Your Password" : "Update Password",
      cancel_url:
        update_id > 0
          ? `${BASE_URL}${this.module_name}/show/${update_id}`
          : `${BASE_URL}${this.module_name}/manage`,
      form_location: `${BASE_URL}${this.module_name}/submit_update_password/${update_id}`,
      theme: this.admin_theme,
      viewModule: this.module_name,
      viewFile: "update_password",
    };
  }
}

/** Path part of a URL (absolute or relative); "" when unavailable. */
function urlPath(url: string): string {
  if (url === "") return "";
  try {
    return new URL(url).pathname;
  } catch {
    return url.split("?")[0];
  }
}
