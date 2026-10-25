import type { EtViewProps } from "@/engine/views-registry";
import { EtForm } from "@/engine/ui/EtForm";
import { ValidationErrors } from "@/engine/ui/ValidationErrors";
import { site_url } from "@/engine/Url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "./AuthShell";
export function LoginCompact({ data }: EtViewProps) {
  const identifierLabel = String(data.identifier_label ?? "");
  const passwordLabel = String(
    (data.fields as { password?: { label?: string } } | undefined)?.password?.label ??
      "Password"
  );
  const loginUrl = String(data.login_url ?? "");
  const forgotUrl =
    typeof data.forgot_password_url === "string" ? data.forgot_password_url : null;

  return (
    <AuthShell title="Log in" description="Access the private CMS workspace.">
      <ValidationErrors />

      <EtForm
        action="login/submit_login"
        params={[loginUrl]}
        className="space-y-5"
        id="loginForm"
      >
        <div className="space-y-2">
          <Label htmlFor="identifier">{identifierLabel}</Label>
          <Input
            id="identifier"
            type="text"
            name="identifier"
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
            autoComplete="current-password"
            required
          />
        </div>

        <Button type="submit" className="w-full">
          Log in
        </Button>

        {forgotUrl !== null ? (
          <p className="text-center text-sm">
            <a
              className="font-semibold text-foreground underline-offset-4 hover:underline"
              href={site_url(forgotUrl)}
            >
              Forgot password?
            </a>
          </p>
        ) : null}
      </EtForm>
    </AuthShell>
  );
}
