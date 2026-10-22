import { LOGIN_CONFIG } from "@/engine/config";
import { set_flashdata } from "@/engine/Flashdata";
import { Eterc_tokens, type EtercUserObj } from "@/engine/Eterc_tokens";
import { redirect } from "@/engine/Url";

/**
 * Eterc_security — port of modules/eterc_security/Eterc_security.php.
 *
 * The PHP class is a thin authorization facade: `make_sure_allowed()` is the
 * only public method and the only implemented scenario is 'admin panel', which
 * delegates to `eterc_administrators::make_sure_allowed()`. That method
 * validates the request's auth token against user level 1 (administrators)
 * and, when no valid token is present, sends the caller to the login page.
 *
 * The port keeps those semantics but resolves the token through the ported
 * tokens service (`Eterc_tokens`):
 *
 * - token sources (HTTP header `EtercToken`, cookie `AUTH_TOKEN_COOKIE`
 *   = "eterctoken", session value) are gathered by the tokens service;
 * - the token is validated against the administrator user level (id 1) with
 *   its expiry date;
 * - a valid token yields the full user object (`EtercUserObj` — PHP: the
 *   token row joined with the user and user-level tables).
 *
 * Unauthorized requests get the "not allowed" flashdata message (shown on the
 * login page after the redirect) and are redirected to the administrator login
 * form (`login/login/{secret_login_word}`, derived from LOGIN_CONFIG).
 *
 * Usage from controllers (registered by ./index.ts):
 *
 *   const user = this.eterc_security.make_sure_allowed();
 */

/** Administrator user level — the 'admin panel' scenario (LOGIN_CONFIG key). */
const ADMIN_USER_LEVEL = 1;

/**
 * Flashdata carried to the login page when access is denied. Mirrors the
 * framework's "not allowed" auth message (PHP: Login::is_logged_in()).
 */
const NOT_ALLOWED_MESSAGE = "You must be logged in to access this page.";

/**
 * Build the login URL for the administrator level from LOGIN_CONFIG
 * (PHP: Login_model::get_login_url() + Login::logout()). Levels configured
 * with a secret_login_word are addressed by that slug; otherwise the plain
 * "login/login" entry point is used.
 */
function loginRedirectUrl(): string {
  const secret = LOGIN_CONFIG.user_levels[ADMIN_USER_LEVEL]?.secret_login_word?.trim();
  return secret ? `login/login/${secret}` : "login/login";
}

export class Eterc_security {
  readonly moduleName = "eterc_security";

  /** Stateless token service (PHP: $this->eterc_tokens). */
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
    redirect(loginRedirectUrl());
  }
}
