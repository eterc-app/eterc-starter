import type { EtViewProps } from "@/engine/views-registry";
import { EtForm } from "@/engine/ui/EtForm";
import { ValidationErrors } from "@/engine/ui/ValidationErrors";
import { site_url } from "@/engine/Url";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
export function LoginSplit({ data }: EtViewProps) {
  const identifierLabel = String(data.identifier_label ?? "");
  const passwordLabel = String(
    (data.fields as { password?: { label?: string } } | undefined)?.password?.label ??
      "Password"
  );
  const loginUrl = String(data.login_url ?? "");
  const forgotUrl =
    typeof data.forgot_password_url === "string" ? data.forgot_password_url : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="grid w-full max-w-4xl gap-0 overflow-hidden p-0 md:grid-cols-2">
        <div className="hidden min-h-[32rem] bg-[url('/login_module/images/surfgirl.webp')] bg-cover bg-center md:block" />
        <div className="p-8 sm:p-10">
          <h1 className="mb-6 text-center text-lg font-semibold tracking-[-0.01em] text-foreground">
            Account Login
          </h1>

          <ValidationErrors />

          <EtForm action="login/submit_login" params={[loginUrl]} className="space-y-4">
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
              Sign In
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
          </EtForm>
        </div>
      </Card>
    </main>
  );
}
