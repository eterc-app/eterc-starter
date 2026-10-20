import { siteUrl } from "@/engine/url";

/**
 * Password reset complete — port of
 * modules/login/forgot_password/views/reset_success.php.
 * The original CSS was inline in the view; it is preserved verbatim here.
 */
export function ResetSuccess() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: RESET_SUCCESS_CSS }} />
      <main className="container">
        <h1>Password Reset Complete</h1>

        <p>
          Your password has been updated successfully. You can now log in using your
          new password.
        </p>

        <div className="mt-3">
          <a href={siteUrl("login")} className="btn-login">
            Log In
          </a>
        </div>
      </main>
    </>
  );
}

// Verbatim port of the <style> block from reset_success.php.
const RESET_SUCCESS_CSS = `
:root {
    --bg-color: #ccc;
    --card-bg: #ffffff;
    --text-main: #333333;
    --text-muted: #666666;
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
    margin-bottom: 20px;
    color: var(--text-main);
}

p {
    font-size: 0.95rem;
    color: var(--text-muted);
    line-height: 1.6;
    margin-bottom: 2rem;
}

.btn-login {
    display: inline-block;
    width: 100%;
    padding: 12px;
    background-color: var(--accent-neutral);
    color: white;
    border-radius: 6px;
    font-size: 1rem;
    font-weight: 600;
    text-decoration: none;
    transition: background-color 0.2s, transform 0.1s;
}

.btn-login:hover {
    background-color: var(--accent-hover);
    text-decoration: none;
}

.btn-login:active {
    transform: scale(0.98);
}

.mt-3 {
    margin-top: 1rem;
}
`;
