import type { TgViewProps } from "@/engine/views-registry";
import { site_url } from "@/engine/Url";

/**
 * Rate-limited page — port of modules/login/views/not_allowed.php.
 */
export function NotAllowed({ data }: TgViewProps) {
  const blockDuration = Number(data.block_duration ?? 15);
  const loginUrl = String(data.login_url ?? "");

  return (
    <main className="page">
      <h1>Access Temporarily Blocked</h1>
      <p>
        Too many failed login attempts have been detected for this account or IP
        address. Please wait {blockDuration} minutes and try again.
      </p>
      <p>
        <a href={site_url(`login/login/${loginUrl}`)}>Return to login page</a>
      </p>
    </main>
  );
}
