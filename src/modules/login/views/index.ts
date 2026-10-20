import { LoginDefault } from "./login_default";
import { LoginCompact } from "./login_compact";
import { LoginSplit } from "./login_split";
import { NotAllowed } from "./not_allowed";
import { ForgotPasswordForm } from "./forgot_password_form";
import { EmailSent } from "./email_sent";
import { ResetPasswordForm } from "./reset_password_form";
import { ResetSuccess } from "./reset_success";

/**
 * Login module views — registration map for the React port.
 *
 * PHP originals: views/login_default.php, login_compact.php, login_split.php,
 * not_allowed.php and forgot_password/views/{forgot_password_form,email_sent,
 * reset_password_form,reset_success}.php.
 *
 * Child-module views are addressed with the parent's module name, mirroring
 * the PHP controller's `$this->view('...')` calls (view_module is
 * 'login/forgot_password' in the PHP data, but the view file lives under
 * modules/login/views/).
 */
export const views = {
  "login/login_default": LoginDefault,
  "login/login_compact": LoginCompact,
  "login/login_split": LoginSplit,
  "login/not_allowed": NotAllowed,
  "login/forgot_password_form": ForgotPasswordForm,
  "login/email_sent": EmailSent,
  "login/reset_password_form": ResetPasswordForm,
  "login/reset_success": ResetSuccess,
};
