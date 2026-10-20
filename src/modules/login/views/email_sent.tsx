import type { TgViewProps } from "@/engine/views-registry";
import { siteUrl } from "@/engine/url";

/**
 * "Email sent" confirmation — port of
 * modules/login/forgot_password/views/email_sent.php.
 * The original CSS was inline in the view; it is preserved verbatim here.
 */
export function EmailSent({ data }: TgViewProps) {
  const loginUrl = String(data.login_url ?? "");

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: EMAIL_SENT_CSS }} />
      <main className="container">
        <h1>Check Your Email</h1>

        <p>
          If an account with that email address exists, you will receive a password
          reset link shortly.
        </p>

        <p>
          Please check your inbox (and spam folder) and click the link to reset your
          password.
        </p>

        <div className="mt-3">
          <a href={siteUrl(`login/login/${loginUrl}`)}>Back to login</a>
        </div>
      </main>
    </>
  );
}

// Verbatim port of the <style> block from email_sent.php.
const EMAIL_SENT_CSS = `
:root {
    --bg-color: #ccc;
    --card-bg: #ffffff;
    --text-main: #333333;
    --text-muted: #666666;
    --accent-neutral: #4a5568;
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
    margin-bottom: 1.5rem;
    text-align: left;
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

.info-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
    display: block;
}
`;
