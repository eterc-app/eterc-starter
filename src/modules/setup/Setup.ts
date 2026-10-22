import { Eterc } from "@/engine/controller";
import { redirect } from "@/engine/Url";
import { post } from "@/engine/post";
import { DEFAULT_MODULE } from "@/engine/config";
import { Setup_model } from "./Setup_model";

/**
 * Setup module — port of modules/setup/Setup.php.
 *
 * Steps: 1 Welcome → 2 Database → 3 Admin → 4 Finalize → 5 Finish.
 * The wizard UI is a React client component (SetupWizard) that drives these
 * methods through the JSON API.
 */
export default class Setup extends Eterc {
  constructor(moduleName?: string | null) {
    super(moduleName);
    this.model = new Setup_model("setup");
  }

  private setupModel(): Setup_model {
    return this.model as Setup_model;
  }

  /** Entry point — skips the wizard when the app is already installed. */
  async index() {
    if (this.setupModel().is_installed()) {
      redirect("welcome");
    }

    return this.view("setup/index", {
      dbFile: this.setupModel().get_db_file(),
      appPath: process.cwd(),
      defaultModule: DEFAULT_MODULE,
    });
  }

  /** Step 2 — verify/create the SQLite schema. */
  async init_database() {
    const result = await this.setupModel().initialize_database();
    return { ok: result.ok, message: result.message ?? "" };
  }

  /** Step 3 — validate and create the admin account. */
  async create_admin() {
    await this.validation.set_rules("username", "username", "required|min_length[2]");
    await this.validation.set_rules("email", "email address", "required|valid_email");
    await this.validation.set_rules("password", "password", "required|min_length[8]");
    await this.validation.set_rules(
      "confirm_password",
      "confirm password",
      "required|matches[password]"
    );

    const passed = await this.validation.run();
    if (!passed) {
      return { ok: false, errors: this.validation.errorsJson() };
    }

    const result = this.setupModel().create_admin_account({
      username: String(post("username", true) ?? ""),
      email: String(post("email", true) ?? ""),
      password: String(post("password") ?? ""),
    });

    if (!result.ok) {
      return { ok: false, errors: result.errors ?? {}, message: result.message ?? "" };
    }

    return { ok: true, username: String(post("username", true) ?? "") };
  }

  /** Step 4 — write the installed marker. */
  async finalize() {
    const username = String(post("username", true) ?? "");
    return this.setupModel().finalize(username);
  }

  /** Help message (shown from the wizard). */
  async show_help_message() {
    return this.view("setup/help_message", {});
  }
}
