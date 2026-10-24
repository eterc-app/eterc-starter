import { admin_login_path } from "@/engine/config";
import { set_flashdata } from "@/engine/Flashdata";
import { Eterc_tokens, type EtercUserObj } from "@/engine/Eterc_tokens";
import { redirect } from "@/engine/Url";

/** Administrator user level — the 'admin panel' scenario (LOGIN_CONFIG key). */
const ADMIN_USER_LEVEL = 1;
const NOT_ALLOWED_MESSAGE = "You must be logged in to access this page.";

export class Eterc_security {
  readonly moduleName = "eterc_security";
  private readonly tokens = new Eterc_tokens();

  /**
   * Ensure the current request is allowed for the 'admin panel' scenario.
   *
   * Returns the logged-in user object when the request carries a valid,
   * unexpired auth token for user level 1. Otherwise sets the "not allowed"
   * flashdata and issues a redirect to the login page.
   *
   * The redirect throws `EtRedirectSignal` (see @/engine/signals); it is
   * intentionally not caught here — the dispatcher (page / server action /
   * JSON API route) turns it into the actual navigation.
   */
  make_sure_allowed(): EtercUserObj | null {
    const token = this.tokens.attempt_get_valid_token(ADMIN_USER_LEVEL);

    if (token !== false) {
      const userObj = this.tokens.get_user_obj(token);
      if (userObj !== false) {
        return userObj;
      }
    }

    set_flashdata(NOT_ALLOWED_MESSAGE);
    redirect(admin_login_path());
  }
}
