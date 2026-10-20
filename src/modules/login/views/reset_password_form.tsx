import type { TgViewProps } from "@/engine/views-registry";
import { TgForm } from "@/engine/ui/TgForm";
import { siteUrl } from "@/engine/url";

/**
 * Reset password form — port of
 * modules/login/forgot_password/views/reset_password_form.php.
 * The original CSS was inline in the view; it is preserved verbatim here.
 */
export function ResetPasswordForm({ data }: TgViewProps) {
  const errorMessage =
    typeof data.error_message === "string" && data.error_message !== ""
      ? data.error_message
      : null;
  const token = typeof data.token === "string" && data.token !== "" ? data.token : null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: RESET_PASSWORD_FORM_CSS }} />
      <main className="container">
        {errorMessage !== null && token !== null ? (
          <div className="validation-errors">
            <p>{errorMessage}</p>
          </div>
        ) : null}

        {token !== null ? (
          <>
            <h1>Reset Your Password</h1>
            <p className="instruction-text">Enter your new password below.</p>

            <TgForm
              action="login/submit_reset_password"
              hidden={{ token }}
            >
              <div className="form-group">
                <label htmlFor="password">New Password</label>
                <input
                  id="password"
                  type="password"
                  name="password"
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="confirm_password">Confirm New Password</label>
                <input
                  id="confirm_password"
                  type="password"
                  name="confirm_password"
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                  required
                />
              </div>

              <button type="submit" className="button">
                Reset Password
              </button>
            </TgForm>
          </>
        ) : (
          <>
            <h1>Invalid or Expired Link</h1>
            <p className="instruction-text">
              {errorMessage ?? "This password reset link is invalid or has expired."}
            </p>
            <div className="mt-3">
              <a href={siteUrl("login/forgot_password")}>Request a new reset link</a>
            </div>
          </>
        )}
      </main>
    </>
  );
}

// Verbatim port of the <style> block from reset_password_form.php.
const RESET_PASSWORD_FORM_CSS = `
:root {
    --bg-color: #ccc;
    --card-bg: #ffffff;
    --text-main: #333333;
    --text-muted: #666666;
    --border-color: #dddddd;
    --accent-neutral: #4a5568;
    --accent-hover: #2d3748;
    --error-red: #c53030;
    --error-bg: #fff5f5;
}

* {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background-color: var(--bg-color);
    color: var(--text-main);
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 20px;
}

.container {
    width: 100%;
    max-width: 420px;
    background: var(--card-bg);
    padding: 40px;
    border-radius: 12px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.1);
    text-align: center;
}

h1 {
    font-size: 1.5rem;
    font-weight: 700;
    margin-bottom: 12px;
    color: var(--text-main);
}

.instruction-text {
    font-size: 0.95rem;
    color: var(--text-muted);
    line-height: 1.5;
    margin-bottom: 24px;
}

.validation-errors {
    background-color: var(--error-bg);
    color: var(--error-red);
    padding: 12px;
    border-radius: 6px;
    border: 1px solid #feb2b2;
    margin-bottom: 20px;
    font-size: 0.9rem;
    text-align: left;
}

.form-group {
    text-align: left;
    margin-bottom: 20px;
}

label {
    display: block;
    font-size: 0.85rem;
    font-weight: 600;
    margin-bottom: 8px;
    color: var(--text-main);
}

input[type="password"] {
    width: 100%;
    padding: 12px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    font-size: 1rem;
    transition: border-color 0.2s, box-shadow 0.2s;
    outline: none;
}

input[type="password"]:focus {
    border-color: var(--accent-neutral);
    box-shadow: 0 0 0 3px rgba(74, 85, 104, 0.1);
}

button, input[type="submit"] {
    width: 100%;
    padding: 12px;
    background-color: var(--accent-neutral);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.2s;
}

button:hover, input[type="submit"]:hover {
    background-color: var(--accent-hover);
}

.mt-3 {
    margin-top: 24px;
    border-top: 1px solid #eee;
    padding-top: 20px;
}

a {
    color: var(--accent-neutral);
    text-decoration: none;
    font-size: 0.9rem;
    font-weight: 500;
}

a:hover {
    text-decoration: underline;
}
`;
