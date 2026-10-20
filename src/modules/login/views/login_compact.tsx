import type { TgViewProps } from "@/engine/views-registry";
import { TgForm } from "@/engine/ui/TgForm";
import { ValidationErrors } from "@/engine/ui/ValidationErrors";
import { site_url } from "@/engine/Url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "./AuthShell";

/** Login form (compact) — port of modules/login/views/login_compact.php. */
export function LoginCompact({ data }: TgViewProps) {
  const identifierLabel = String(data.identifier_label ?? "");
  const passwordLabel = String(
    (data.fields as { password?: { label?: string } } | undefined)?.password?.label ??
      "Password"
  );
  const loginUrl = String(data.login_url ?? "");
  const forgotUrl =
    typeof data.forgot_password_url === "string" ? data.forgot_password_url : null;

  return (
    <AuthShell title="Log In">
      <ValidationErrors />

      <TgForm
        action="login/submit_login"
        params={[loginUrl]}
        className="space-y-4"
        id="loginForm"
      >
        <div className="space-y-2">
          <Label htmlFor="identifier">{identifierLabel}</Label>
          <Input
            id="identifier"
            type="text"
            name="identifier"
            placeholder={identifierLabel}
            autoComplete="username"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">{passwordLabel}</Label>
          <Input
            id="password"
            type="password"
            name="password"
            placeholder={passwordLabel}
            autoComplete="current-password"
            required
          />
        </div>

        <Button type="submit" className="w-full">
          Log In
        </Button>

        {forgotUrl !== null ? (
          <p className="text-center text-sm">
            <a
              className="font-medium text-primary underline-offset-4 hover:underline"
              href={site_url(forgotUrl)}
            >
              Forgot password?
            </a>
          </p>
        ) : null}
      </TgForm>
    </AuthShell>
  );
}
