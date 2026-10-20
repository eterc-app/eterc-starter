import type { TgViewProps } from "@/engine/views-registry";
import { TgForm } from "@/engine/ui/TgForm";
import { ValidationErrors } from "@/engine/ui/ValidationErrors";
import { siteUrl } from "@/engine/url";

/**
 * Login form (default) — port of modules/login/views/login_default.php.
 *
 * Stylesheet: public/login_module/css/login_default.css
 */
export function LoginDefault({ data }: TgViewProps) {
  const identifierLabel = String(data.identifier_label ?? "");
  const passwordLabel = String(
    (data.fields as { password?: { label?: string } } | undefined)?.password?.label ??
      "Password"
  );
  const allowRemember = Number(data.allow_remember ?? 0) === 1;
  const loginUrl = String(data.login_url ?? "");
  const forgotUrl =
    typeof data.forgot_password_url === "string" ? data.forgot_password_url : null;

  return (
    <>
      <link rel="stylesheet" href="/login_module/css/login_default.css" />
      <div className="card">
        <div className="card-body">
          <h1>Ahoy!</h1>
          <p className="text-center">Please sign in to access your account.</p>

          <ValidationErrors />

          <TgForm action="login/submit_login" params={[loginUrl]}>
            <label htmlFor="identifier">{identifierLabel}</label>
            <input
              id="identifier"
              type="text"
              name="identifier"
              placeholder={identifierLabel}
              autoComplete="username"
              required
            />

            <label htmlFor="password">{passwordLabel}</label>
            <input
              id="password"
              type="password"
              name="password"
              placeholder={passwordLabel}
              autoComplete="current-password"
              required
            />

            {allowRemember ? (
              <div>
                <label className="mb-2">
                  <input type="checkbox" name="remember" value="1" /> Remember me
                </label>
              </div>
            ) : null}

            <div className="mt-1">
              <button type="submit" className="button">
                Sign In
              </button>{" "}
              <a href={siteUrl("")} className="button alt">
                Cancel
              </a>
            </div>
          </TgForm>

          {forgotUrl !== null ? (
            <p className="sm text-center">
              <a href={siteUrl(forgotUrl)}>Forgot your password?</a>
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}
