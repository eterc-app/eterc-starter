import type { TgViewProps } from "@/engine/views-registry";
import { TgForm } from "@/engine/ui/TgForm";
import { ValidationErrors } from "@/engine/ui/ValidationErrors";
import { siteUrl } from "@/engine/url";

/**
 * Login form (split) — port of modules/login/views/login_split.php.
 * The original CSS was inline in the view; it is preserved verbatim here
 * (asset paths updated to the port's /login_module/... public folder).
 */
export function LoginSplit({ data }: TgViewProps) {
  const identifierLabel = String(data.identifier_label ?? "");
  const passwordLabel = String(
    (data.fields as { password?: { label?: string } } | undefined)?.password?.label ??
      "Password"
  );
  const loginUrl = String(data.login_url ?? "");
  const forgotUrl =
    typeof data.forgot_password_url === "string" ? data.forgot_password_url : null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: LOGIN_SPLIT_CSS }} />
      <div className="center-stage">
        <div className="image-panel"></div>
        <div className="form-panel">
          <h1>Account Login</h1>

          <ValidationErrors />

          <TgForm action="login/submit_login" params={[loginUrl]}>
            <div className="form-group">
              <label htmlFor="identifier">{identifierLabel}</label>
              <input
                id="identifier"
                type="text"
                name="identifier"
                placeholder={identifierLabel}
                autoComplete="username"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">{passwordLabel}</label>
              <input
                id="password"
                type="password"
                name="password"
                placeholder={passwordLabel}
                autoComplete="current-password"
                required
              />
            </div>

            <button type="submit" className="button">
              Sign In
            </button>

            {forgotUrl !== null ? (
              <p className="link-row">
                <a href={siteUrl(forgotUrl)}>Forgot password?</a>
              </p>
            ) : null}
          </TgForm>
        </div>
      </div>
    </>
  );
}

// Verbatim port of the <style> block from login_split.php.
const LOGIN_SPLIT_CSS = `
body {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    font-family: verdana;
    color: #999;
    margin: 0;
    padding: 1rem;
    box-sizing: border-box;
    background-image: url('/login_module/images/surfgirl.webp');
    background-position: center bottom;
    background-size: cover;
}

.center-stage {
    background-color: #fff;
    width: 100%;
    max-width: max-content;
    display: flex;
    box-shadow: 0 4px 10px 0 rgba(0, 0, 0, 0.2), 0 4px 20px 0 rgba(0, 0, 0, 0.19);
}

.center-stage .form-panel {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2.5rem;
    box-sizing: border-box;
}

h1 {
    text-transform: uppercase;
    font-size: 1.33em;
    font-weight: normal;
    margin: 0 0 1.5rem;
    color: #555;
}

.form-group {
    width: 100%;
    margin-bottom: 1.25rem;
}

.form-group label {
    display: block;
    margin-bottom: 0.4rem;
    font-size: 0.85rem;
    color: #777;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.form-group input {
    width: 100%;
    padding: 0.7rem 0.9rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 0.95rem;
    color: #555;
    box-sizing: border-box;
    transition: border-color 0.2s;
}

.form-group input:focus {
    border-color: #888;
    outline: none;
}

button[type="submit"] {
    width: 100%;
    padding: 0.75rem;
    background: #555;
    color: #fff;
    border: none;
    border-radius: 4px;
    font-size: 0.95rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    cursor: pointer;
    transition: background 0.2s;
    margin-top: 0.5rem;
}

button[type="submit"]:hover {
    background: #777;
}

.link-row {
    text-align: center;
    margin-top: 1.25rem;
    font-size: 0.85rem;
}

a {
    color: #999;
    text-decoration: none;
}

a:hover {
    color: #555;
    text-decoration: underline;
}

.validation-errors {
    width: 100%;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 4px;
    padding: 0.75rem;
    margin-bottom: 1.25rem;
    color: #991b1b;
    font-size: 0.85rem;
    box-sizing: border-box;
}

.validation-errors p {
    margin: 0 0 0.25rem;
}

.validation-errors li {
    margin-left: 1.2em;
    padding-left: 0;
}

.validation-errors p:last-child {
    margin-bottom: 0;
}

.center-stage .form-panel {
    width: 100%;
}

@media screen and (min-width: 845px) {

    body {
        background-color: #ccc;
        background-image: none;
    }

    .center-stage {
        flex-direction: row;
        align-items: stretch;
        justify-content: space-between;
        max-width: 860px;
    }

    .center-stage .image-panel {
        width: 50%;
        min-height: 70vh;
        background-image: url('/login_module/images/surfgirl.webp');
        background-position: center bottom;
        background-size: cover;
    }

    .center-stage .form-panel {
        width: 50%;
    }

}
`;
