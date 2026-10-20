import type { TgViewProps } from "@/engine/views-registry";
import { TgForm } from "@/engine/ui/TgForm";
import { Flashdata } from "@/engine/ui/Flashdata";
import { siteUrl } from "@/engine/url";

/**
 * Forgot password form — port of
 * modules/login/forgot_password/views/forgot_password_form.php.
 * The original CSS was inline in the view; it is preserved verbatim here.
 */
export function ForgotPasswordForm({ data }: TgViewProps) {
  const identifierLabel = String(data.identifier_label ?? "");
  const loginUrl = String(data.login_url ?? "");
  const lowerLabel = identifierLabel.toLowerCase();
  const instruction = lowerLabel.includes("email")
    ? `Enter your ${lowerLabel} and we will send you a reset link.`
    : `Enter your ${lowerLabel} or email address and we will send you a reset link.`;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: FORGOT_PASSWORD_FORM_CSS }} />
      <main className="container">
        <h1>Forgot Your Password?</h1>
        <p className="instruction-text">{instruction}</p>

        <Flashdata />

        <TgForm action="login/submit_forgot_password" params={[loginUrl]}>
          <div className="form-group">
            <label htmlFor="identifier">{identifierLabel}</label>
            <input
              id="identifier"
              type="text"
              name="identifier"
              placeholder={`${identifierLabel} or Email`}
              autoComplete="email"
              required
            />
          </div>

          <button type="submit" className="button">
            Send Reset Link
          </button>
        </TgForm>

        <p className="mt-2">
          <a href={siteUrl(`login/login/${loginUrl}`)}>Back to login</a>
        </p>
      </main>
    </>
  );
}

// Verbatim port of the <style> block from forgot_password_form.php.
const FORGOT_PASSWORD_FORM_CSS = `
:root {
    --bg-color: #ccc;
    --card-bg: #ffffff;
    --text-main: #333333;
    --text-muted: #666666;
    --border-color: #dddddd;
    --accent-neutral: #4a5568;
    --accent-hover: #2d3748;
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

.alert, [style*="color: red"], [style*="background-color: #f8d7da"] {
    padding: 10px;
    border-radius: 6px;
    margin-bottom: 20px;
    font-size: 0.9rem;
    list-style: none;
    background-color: #fff5f5;
    color: #c53030;
    border: 1px solid #feb2b2;
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

input[type="text"] {
    width: 100%;
    padding: 12px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    font-size: 1rem;
    transition: border-color 0.2s, box-shadow 0.2s;
    outline: none;
}

input[type="text"]:focus {
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

.mt-2 {
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
