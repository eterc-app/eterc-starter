import type { TgViewProps } from "@/engine/views-registry";
import { TgForm } from "@/engine/ui/TgForm";
import { ValidationErrors } from "@/engine/ui/ValidationErrors";
import { site_url } from "@/engine/Url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "./AuthShell";

/**
 * Login form (default) — port of modules/login/views/login_default.php.
 * Markup uses the Eterc shadcn/Tailwind auth surface.
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
    <AuthShell
      title="Welcome back"
      description="Please sign in to access your account."
    >
      <ValidationErrors />

      <TgForm action="login/submit_login" params={[loginUrl]} className="space-y-4">
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

        {allowRemember ? (
          <Label className="flex items-center gap-2 text-sm font-normal">
            <input type="checkbox" name="remember" value="1" className="m-0 size-4" />
            Remember me
          </Label>
        ) : null}

        <div className="flex flex-col gap-2 pt-2 sm:flex-row">
          <Button type="submit" className="w-full">
            Sign In
          </Button>
          <Button asChild variant="outline" className="w-full">
            <a href={site_url("")}>Cancel</a>
          </Button>
        </div>
      </TgForm>

      {forgotUrl !== null ? (
        <p className="mt-4 text-center text-sm">
          <a
            className="font-medium text-primary underline-offset-4 hover:underline"
            href={site_url(forgotUrl)}
          >
            Forgot your password?
          </a>
        </p>
      ) : null}
    </AuthShell>
  );
}
