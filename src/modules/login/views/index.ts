import { LoginDefault } from "./login_default";
import { LoginCompact } from "./login_compact";
import { LoginSplit } from "./login_split";
import { NotAllowed } from "./not_allowed";
import { ForgotPasswordForm } from "./forgot_password_form";
import { EmailSent } from "./email_sent";
import { ResetPasswordForm } from "./reset_password_form";
import { ResetSuccess } from "./reset_success";
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
